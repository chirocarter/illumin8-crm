import "server-only";

// Agent run lifecycle + audit ledger.
//
// A run is the unit of accountability: the agent opens one, records what it
// does, and closes it. Counts are DERIVED from the ledger on read, never stored
// on the run, so the summary and the rows behind it cannot drift apart — the
// same rule every metric in this app follows.
import { db, schema as s } from "@/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { AGENT_ACTIONS, AGENT_RUN_STATUSES } from "./taxonomy";

// ---------------------------------------------------------------------------
// V1 guardrails.
//
// Sized from the real job: a weekly sweep is expected to look at tens to low
// hundreds of businesses. These are meant to stop a malfunctioning agent
// looping forever, not to ration normal work — a legitimate run that hits one
// of these is a bug worth seeing, and the agent can always open a second run.
// ---------------------------------------------------------------------------

/** ~250 candidates × ~4 activities each, with headroom. */
export const MAX_ACTIVITIES_PER_RUN = 1000;
/** Candidate businesses one run may log discovering. Low hundreds is the job. */
export const MAX_DISCOVERED_PER_RUN = 300;
/** Per request. Big enough to batch a page of results, small enough to bound a payload. */
export const MAX_ACTIVITIES_PER_REQUEST = 25;
/** One explanatory sentence, not a research dump — that belongs in aiResearch. */
export const MAX_DETAIL_LENGTH = 500;
export const MAX_ERROR_LENGTH = 500;
/**
 * A run older than this stops accepting activity. A weekly sweep over a few
 * hundred businesses takes minutes, not hours; a run still open after six is
 * abandoned, and letting it keep writing would mean an interrupted job silently
 * appending to yesterday's ledger.
 */
export const STALE_RUN_HOURS = 6;

export const AGENT_TRIGGERS = ["manual", "scheduled", "test"] as const;
export type AgentTrigger = (typeof AGENT_TRIGGERS)[number];

/** The two states a run may finish in. Terminal means terminal. */
export const TERMINAL_STATUSES = ["completed", "failed"] as const;

export type RunLookup =
  | { ok: true; run: typeof s.agentRuns.$inferSelect }
  | { ok: false; reason: "not_found" | "terminal" | "stale" };

/**
 * Load a run the caller actually owns.
 *
 * Ownership is BOTH userId and cityId. Either alone would be weaker than it
 * looks: one identity per city today, but the moment a city gains a second
 * agent, userId alone would let them write to each other's ledgers.
 *
 * A run belonging to someone else is reported as not_found, never as
 * forbidden — a 403 would confirm the id exists and let one market enumerate
 * another's runs.
 */
export async function loadOwnedRun(
  runId: number,
  agent: { userId: number; cityId: number },
  opts: { mustBeRunning?: boolean } = {}
): Promise<RunLookup> {
  const run = await db.query.agentRuns.findFirst({
    where: and(
      eq(s.agentRuns.id, runId),
      eq(s.agentRuns.userId, agent.userId),
      eq(s.agentRuns.cityId, agent.cityId)
    ),
  });
  if (!run) return { ok: false, reason: "not_found" };

  if (opts.mustBeRunning) {
    // Once terminal, the ledger is immutable through this API. No schema change
    // was needed for that: agent_runs.status already carries the state, and the
    // agent API is the only writer, so the check belongs here rather than in a
    // database trigger.
    if (run.status !== "running") return { ok: false, reason: "terminal" };
    const startedMs = Date.parse(run.startedAt.replace(" ", "T"));
    if (Number.isFinite(startedMs) && Date.now() - startedMs > STALE_RUN_HOURS * 3600_000) {
      return { ok: false, reason: "stale" };
    }
  }
  return { ok: true, run };
}

/** Every action zeroed, so a caller can rely on the shape whatever happened. */
export function emptyCounts(): Record<string, number> {
  return Object.fromEntries(AGENT_ACTIONS.map((a) => [a, 0]));
}

/**
 * Counts for one run, computed from agent_activities.
 *
 * Deliberately a GROUP BY rather than columns on agent_runs. Stored counters
 * would be a second source of truth that could disagree with the ledger, and
 * there would be no way to tell which was lying.
 */
export async function runCounts(runId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ action: s.agentActivities.action, n: count() })
    .from(s.agentActivities)
    .where(eq(s.agentActivities.agentRunId, runId))
    .groupBy(s.agentActivities.action);

  const counts = emptyCounts();
  for (const r of rows) {
    // An action outside the vocabulary cannot be written by the API, but if one
    // ever existed it is surfaced rather than silently dropped from the total.
    counts[r.action] = (counts[r.action] ?? 0) + Number(r.n);
  }
  return counts;
}

/** How many activities a run already holds, and how many were 'discovered'. */
export async function runUsage(runId: number): Promise<{ total: number; discovered: number }> {
  const [row] = await db
    .select({
      total: count(),
      discovered: sql<number>`sum(case when ${s.agentActivities.action} = 'discovered' then 1 else 0 end)`,
    })
    .from(s.agentActivities)
    .where(eq(s.agentActivities.agentRunId, runId));
  return { total: Number(row?.total ?? 0), discovered: Number(row?.discovered ?? 0) };
}

/** Shape returned for a run. No cityId, userId or other internal wiring. */
export function publicRun(
  run: typeof s.agentRuns.$inferSelect,
  cityName: string,
  counts?: Record<string, number>
) {
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
    city: cityName,
    ...(counts ? { counts } : {}),
  };
}

export { AGENT_ACTIONS, AGENT_RUN_STATUSES };

// ---------------------------------------------------------------------------
// Run concurrency.
//
// The per-run caps bound damage inside a run; these bound how many runs a
// leaked credential could open at all. The real job is one scheduled sweep a
// week plus manual testing, so 10 a day is generous while keeping a runaway
// loop finite.
// ---------------------------------------------------------------------------

export const MAX_OPEN_RUNS_PER_AGENT = 1;
export const MAX_RUNS_PER_DAY = 10;

/**
 * Why a new run may not start, or null if it may.
 *
 * Counted per agent USER rather than per city: the identity holds the
 * credential, so it is the thing whose blast radius is being bounded.
 *
 * A run older than STALE_RUN_HOURS stops blocking a new one, but is left
 * honestly marked "running". It is not rewritten to "failed" — the agent never
 * reported a failure, and inventing one would put a fact in the ledger that
 * nothing actually observed.
 */
export async function runStartBlocked(
  agent: { userId: number }
): Promise<{ reason: "open_run" | "daily_cap"; openRunId?: number; count?: number } | null> {
  // Ages are compared in JavaScript, not SQL. started_at is written by
  // datetime('now','localtime'), so a cutoff built from toISOString() is UTC and
  // silently wrong by the machine's offset - on a UTC-6 host every run looked six
  // hours old the moment it was created, and this guard never fired. Parsing the
  // stored string as local time is what loadOwnedRun already does.
  const ageMs = (stamp: string) => {
    const t = Date.parse(stamp.replace(" ", "T"));
    return Number.isFinite(t) ? Date.now() - t : Infinity;
  };

  const openRuns = await db
    .select({ id: s.agentRuns.id, startedAt: s.agentRuns.startedAt })
    .from(s.agentRuns)
    .where(and(eq(s.agentRuns.userId, agent.userId), eq(s.agentRuns.status, "running")));
  const live = openRuns.find((r) => ageMs(r.startedAt) < STALE_RUN_HOURS * 3600_000);
  if (live) return { reason: "open_run", openRunId: live.id };

  // Bounded scan: only the most recent runs can fall inside 24h anyway.
  const recent = await db
    .select({ startedAt: s.agentRuns.startedAt })
    .from(s.agentRuns)
    .where(eq(s.agentRuns.userId, agent.userId))
    .orderBy(desc(s.agentRuns.id))
    .limit(MAX_RUNS_PER_DAY * 5);
  const today = recent.filter((r) => ageMs(r.startedAt) < 24 * 3600_000).length;
  if (today >= MAX_RUNS_PER_DAY) return { reason: "daily_cap", count: today };

  return null;
}
