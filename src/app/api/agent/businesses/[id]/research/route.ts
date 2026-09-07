import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { and, eq } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { loadOwnedRun, runUsage, MAX_ACTIVITIES_PER_RUN, STALE_RUN_HOURS } from "@/lib/agent-runs";
import { validateResearch } from "@/lib/agent-prospects";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/agent/businesses/:id/research
 *
 * Writes exactly two columns: aiFitScore and aiResearch. Every other field is
 * unreachable through this route — not by validation that rejects them, but
 * because the update statement names only those two. A caller could send
 * "status" or "phone" and nothing would happen to them.
 *
 * agentRunId is validation context, never an ownership reassignment: it proves
 * the caller holds an open run, and the account's own city/owner are untouched.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  if (typeof b.agentRunId !== "number" || !Number.isInteger(b.agentRunId) || b.agentRunId <= 0) {
    return Response.json({ error: '"agentRunId" is required' }, { status: 400 });
  }

  const patch: { aiFitScore?: number; aiResearch?: string } = {};
  if (b.aiFitScore !== undefined && b.aiFitScore !== null) {
    if (typeof b.aiFitScore !== "number" || !Number.isInteger(b.aiFitScore) || b.aiFitScore < 0 || b.aiFitScore > 100) {
      return Response.json({ error: '"aiFitScore" must be an integer 0-100' }, { status: 400 });
    }
    patch.aiFitScore = b.aiFitScore;
  }
  if (b.aiResearch !== undefined && b.aiResearch !== null) {
    const parsed = validateResearch(b.aiResearch);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    patch.aiResearch = JSON.stringify(parsed.value);
  }
  if (patch.aiFitScore === undefined && patch.aiResearch === undefined) {
    return Response.json({ error: "Provide aiFitScore, aiResearch, or both" }, { status: 400 });
  }

  const lookup = await loadOwnedRun(b.agentRunId, auth.agent, { mustBeRunning: true });
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

  // The account must live in the agent's own city. A foreign one reads as not
  // found, exactly as it does everywhere else in this API.
  const account = await db.query.accounts.findFirst({
    where: and(eq(s.accounts.id, Number(idStr)), eq(s.accounts.cityId, auth.agent.cityId)),
    columns: { id: true, name: true },
  });
  if (!account) return Response.json({ error: "Not found" }, { status: 404 });

  const usage = await runUsage(run.id);
  if (usage.total + 1 > MAX_ACTIVITIES_PER_RUN) {
    return Response.json({ error: `Run would exceed ${MAX_ACTIVITIES_PER_RUN} activities` }, { status: 409 });
  }

  const [updated] = await db.update(s.accounts)
    .set(patch)                       // only these two columns, ever
    .where(eq(s.accounts.id, account.id))
    .returning({ id: s.accounts.id, aiFitScore: s.accounts.aiFitScore, aiResearch: s.accounts.aiResearch });

  await db.insert(s.agentActivities).values({
    agentRunId: run.id,
    accountId: account.id,
    action: "researched",
    detail: `Research updated for "${account.name}"`.slice(0, 500),
    cityId: run.cityId,
  });

  let research: unknown = null;
  if (updated.aiResearch) { try { research = JSON.parse(updated.aiResearch); } catch { research = null; } }
  return Response.json({
    updated: true,
    id: updated.id,
    city: auth.agent.cityName,
    aiFitScore: updated.aiFitScore,
    aiResearch: research,
  });
}
