import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { loadOwnedRun, runCounts, publicRun, TERMINAL_STATUSES, MAX_ERROR_LENGTH } from "@/lib/agent-runs";
import { nowISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/runs/:id/complete — close a run.
 *
 * running → completed | failed, and nothing else. A run that is already
 * terminal is refused with 409 rather than silently reopened or re-stamped,
 * so a retrying agent cannot quietly rewrite when a run finished or turn a
 * failure into a success.
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

  const status = b.status;
  if (typeof status !== "string" || !(TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return Response.json(
      { error: `"status" must be one of: ${TERMINAL_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // An error message is stored only for a failure. Accepting one on a success
  // would put a permanent "something went wrong" note on a run that did not.
  let error: string | null = null;
  if (b.error !== undefined && b.error !== null) {
    if (typeof b.error !== "string") {
      return Response.json({ error: '"error" must be a string' }, { status: 400 });
    }
    if (b.error.length > MAX_ERROR_LENGTH) {
      return Response.json({ error: `"error" exceeds ${MAX_ERROR_LENGTH} characters` }, { status: 400 });
    }
    if (status !== "failed") {
      return Response.json({ error: '"error" may only accompany status "failed"' }, { status: 400 });
    }
    error = b.error;
  }

  const lookup = await loadOwnedRun(Number(idStr), auth.agent);
  if (!lookup.ok) return Response.json({ error: "Not found" }, { status: 404 });
  const run = lookup.run;

  if (run.status !== "running") {
    return Response.json(
      { error: `Run is already ${run.status}`, id: run.id, status: run.status },
      { status: 409 }
    );
  }

  const [updated] = await db.update(s.agentRuns)
    .set({ status, error, completedAt: nowISO() })
    .where(eq(s.agentRuns.id, run.id))
    .returning();

  // Counts come from the ledger, every time. Nothing is cached on the run, so
  // there is no stored number that could disagree with the rows.
  return Response.json(publicRun(updated, auth.agent.cityName, await runCounts(run.id)));
}
