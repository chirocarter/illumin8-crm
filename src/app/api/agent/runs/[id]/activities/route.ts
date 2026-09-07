import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import {
  loadOwnedRun, runUsage, AGENT_ACTIONS,
  MAX_ACTIVITIES_PER_REQUEST, MAX_ACTIVITIES_PER_RUN, MAX_DISCOVERED_PER_RUN,
  MAX_DETAIL_LENGTH, STALE_RUN_HOURS,
} from "@/lib/agent-runs";

export const dynamic = "force-dynamic";

type Incoming = { action: string; accountId?: number | null; detail?: string | null };

/**
 * POST /api/agent/runs/:id/activities — append to the audit ledger.
 *
 * Accepts one activity or a batch of up to 25. Everything is validated before
 * anything is written, so a bad entry in a batch does not leave half of it
 * recorded.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  const { id: idStr } = await ctx.params;
  if (!/^\d{1,9}$/.test(idStr)) return Response.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Malformed JSON body" }, { status: 400 }); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const raw: unknown[] = Array.isArray(b.activities) ? b.activities : [b];
  if (raw.length === 0) return Response.json({ error: "No activities supplied" }, { status: 400 });
  if (raw.length > MAX_ACTIVITIES_PER_REQUEST) {
    return Response.json(
      { error: `At most ${MAX_ACTIVITIES_PER_REQUEST} activities per request` },
      { status: 400 }
    );
  }

  // Validate shape before touching the database.
  const parsed: Incoming[] = [];
  for (const [i, item] of raw.entries()) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return Response.json({ error: `activities[${i}] must be an object` }, { status: 400 });
    }
    const a = item as Record<string, unknown>;
    if (typeof a.action !== "string" || !(AGENT_ACTIONS as readonly string[]).includes(a.action)) {
      return Response.json(
        { error: `activities[${i}].action must be one of: ${AGENT_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (a.detail !== undefined && a.detail !== null) {
      if (typeof a.detail !== "string") {
        return Response.json({ error: `activities[${i}].detail must be a string` }, { status: 400 });
      }
      if (a.detail.length > MAX_DETAIL_LENGTH) {
        return Response.json(
          { error: `activities[${i}].detail exceeds ${MAX_DETAIL_LENGTH} characters` },
          { status: 400 }
        );
      }
    }
    let accountId: number | null = null;
    if (a.accountId !== undefined && a.accountId !== null) {
      if (typeof a.accountId !== "number" || !Number.isInteger(a.accountId) || a.accountId <= 0) {
        return Response.json({ error: `activities[${i}].accountId must be a positive integer` }, { status: 400 });
      }
      accountId = a.accountId;
    }
    parsed.push({ action: a.action, accountId, detail: (a.detail as string | undefined) ?? null });
  }

  // The run must exist, belong to this agent AND city, and still be running.
  const lookup = await loadOwnedRun(Number(idStr), auth.agent, { mustBeRunning: true });
  if (!lookup.ok) {
    if (lookup.reason === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
    if (lookup.reason === "terminal") {
      return Response.json({ error: "Run is already complete; its ledger is immutable" }, { status: 409 });
    }
    return Response.json(
      { error: `Run has been open longer than ${STALE_RUN_HOURS}h and no longer accepts activity` },
      { status: 409 }
    );
  }
  const run = lookup.run;

  // Every referenced account must live in the agent's own city. A McKinney
  // account on an Albuquerque run is reported as not found, matching how a
  // foreign business reads everywhere else in this API.
  const wantedIds = [...new Set(parsed.map((p) => p.accountId).filter((x): x is number => x !== null))];
  if (wantedIds.length) {
    const found = await db
      .select({ id: s.accounts.id })
      .from(s.accounts)
      .where(and(inArray(s.accounts.id, wantedIds), eq(s.accounts.cityId, auth.agent.cityId)));
    const okIds = new Set(found.map((r) => r.id));
    const missing = wantedIds.filter((id) => !okIds.has(id));
    if (missing.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Run-level caps, checked against what is already recorded.
  const usage = await runUsage(run.id);
  if (usage.total + parsed.length > MAX_ACTIVITIES_PER_RUN) {
    return Response.json(
      { error: `Run would exceed ${MAX_ACTIVITIES_PER_RUN} activities`, recorded: usage.total },
      { status: 409 }
    );
  }
  const newDiscovered = parsed.filter((p) => p.action === "discovered").length;
  if (usage.discovered + newDiscovered > MAX_DISCOVERED_PER_RUN) {
    return Response.json(
      { error: `Run would exceed ${MAX_DISCOVERED_PER_RUN} discovered candidates`, discovered: usage.discovered },
      { status: 409 }
    );
  }

  await db.insert(s.agentActivities).values(
    parsed.map((p) => ({
      agentRunId: run.id,
      accountId: p.accountId,
      action: p.action,
      detail: p.detail,
      cityId: run.cityId, // from the run, which came from the credential
    }))
  );

  const after = await runUsage(run.id);
  return Response.json({
    runId: run.id,
    recorded: parsed.length,
    totalActivities: after.total,
    remaining: MAX_ACTIVITIES_PER_RUN - after.total,
  }, { status: 201 });
}
