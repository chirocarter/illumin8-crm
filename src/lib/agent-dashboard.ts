import "server-only";

// Read model for /agent. Human session, existing city scope — no agent
// credential is involved in reading this.
import { db, schema as s } from "@/db";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { AGENT_ACTIONS } from "./taxonomy";
import { AI_REVIEW_PENDING } from "./ai-review";

export type PendingProspect = {
  id: number; name: string; vertical: string; area: string;
  aiFitScore: number | null; createdAt: string;
  summary: string | null; confidence: string | null;
  sources: { url: string; label?: string }[];
};

function parseResearch(raw: string | null) {
  if (!raw) return { summary: null, confidence: null, sources: [] as { url: string; label?: string }[] };
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    return {
      summary: typeof r.summary === "string" ? r.summary : null,
      confidence: typeof r.confidence === "string" ? r.confidence : null,
      // Only http(s) links are ever rendered, whatever got stored.
      sources: Array.isArray(r.sources)
        ? (r.sources as { url?: unknown; label?: unknown }[])
            .filter((x) => typeof x?.url === "string" && /^https?:\/\//i.test(x.url as string))
            .map((x) => ({ url: x.url as string, label: typeof x.label === "string" ? x.label : undefined }))
        : [],
    };
  } catch {
    return { summary: null, confidence: null, sources: [] as { url: string; label?: string }[] };
  }
}

/** Everything /agent shows, for ONE city. */
export async function agentDashboard(cityId: number | null) {
  const latestRun = await db.query.agentRuns.findFirst({
    where: cityId ? eq(s.agentRuns.cityId, cityId) : undefined,
    orderBy: [desc(s.agentRuns.id)],
  });

  const counts = Object.fromEntries(AGENT_ACTIONS.map((a) => [a, 0])) as Record<string, number>;
  if (latestRun) {
    // Derived, every time. Nothing is cached on the run.
    const rows = await db
      .select({ action: s.agentActivities.action, n: sql<number>`count(*)` })
      .from(s.agentActivities)
      .where(eq(s.agentActivities.agentRunId, latestRun.id))
      .groupBy(s.agentActivities.action);
    for (const r of rows) counts[r.action] = (counts[r.action] ?? 0) + Number(r.n);
  }

  const pendingRows = await db
    .select({
      id: s.accounts.id, name: s.accounts.name, vertical: s.accounts.vertical,
      area: s.accounts.area, aiFitScore: s.accounts.aiFitScore,
      aiResearch: s.accounts.aiResearch, createdAt: s.accounts.createdAt,
    })
    .from(s.accounts)
    .where(and(
      eq(s.accounts.aiReviewStatus, AI_REVIEW_PENDING),
      ...(cityId ? [eq(s.accounts.cityId, cityId)] : [])
    ))
    // Best candidates first; unscored last rather than sorted as zero, since a
    // missing score is "not assessed", not "assessed badly".
    .orderBy(sql`${s.accounts.aiFitScore} IS NULL`, desc(s.accounts.aiFitScore), desc(s.accounts.id))
    .limit(50);

  const pending: PendingProspect[] = pendingRows.map((r) => {
    const { aiResearch, ...rest } = r;
    return { ...rest, ...parseResearch(aiResearch) };
  });

  const recent = await db
    .select({
      id: s.agentActivities.id, action: s.agentActivities.action,
      detail: s.agentActivities.detail, createdAt: s.agentActivities.createdAt,
      accountId: s.agentActivities.accountId, accountName: s.accounts.name,
      // Events too, now that the agent acts on both. Without this an event
      // activity would render as a line of text with nothing to click — the
      // dead-end number this app is built to avoid.
      eventId: s.agentActivities.eventId, eventName: s.events.name,
      runId: s.agentActivities.agentRunId,
    })
    .from(s.agentActivities)
    .leftJoin(s.accounts, eq(s.agentActivities.accountId, s.accounts.id))
    .leftJoin(s.events, eq(s.agentActivities.eventId, s.events.id))
    .where(cityId ? eq(s.agentActivities.cityId, cityId) : undefined)
    .orderBy(desc(s.agentActivities.id))
    .limit(25);

  const errors = await db
    .select({
      id: s.agentActivities.id, detail: s.agentActivities.detail,
      createdAt: s.agentActivities.createdAt, runId: s.agentActivities.agentRunId,
    })
    .from(s.agentActivities)
    .where(and(
      eq(s.agentActivities.action, "error"),
      ...(cityId ? [eq(s.agentActivities.cityId, cityId)] : [])
    ))
    .orderBy(desc(s.agentActivities.id))
    .limit(10);

  /**
   * Integrity check for the one gap Step 5 could not close.
   *
   * Prospect creation writes the account and then the ledger row, because the
   * app's two database drivers disagree about what a transaction means (see
   * api/agent/prospects). A crash between the two writes would leave an
   * AI-created account with no 'created' entry. Nothing here repairs anything —
   * it only makes the inconsistency visible if it ever happens.
   */
  const unreconciled = await db
    .select({ id: s.accounts.id, name: s.accounts.name, agentRunId: s.accounts.agentRunId })
    .from(s.accounts)
    .where(and(
      isNotNull(s.accounts.agentRunId),
      ...(cityId ? [eq(s.accounts.cityId, cityId)] : []),
      sql`NOT EXISTS (
        SELECT 1 FROM agent_activities ag
        WHERE ag.account_id = accounts.id
          AND ag.action = 'created'
          AND ag.agent_run_id = accounts.agent_run_id)`
    ))
    .limit(10);

  return { latestRun, counts, pending, recent, errors, unreconciled };
}
