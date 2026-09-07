import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { AGENT_TRIGGERS, publicRun } from "@/lib/agent-runs";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/runs — open a run.
 *
 * The body carries a trigger and nothing else. cityId and userId come from the
 * credential; supplying them is not "rejected" so much as meaningless, because
 * they are never read. That is the point: there is no ownership field an agent
 * could get wrong.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  let body: unknown = {};
  if (req.headers.get("content-length") !== "0") {
    try { body = await req.json(); } catch { return Response.json({ error: "Malformed JSON body" }, { status: 400 }); }
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const trigger = (body as Record<string, unknown>).trigger ?? "manual";
  if (typeof trigger !== "string" || !(AGENT_TRIGGERS as readonly string[]).includes(trigger)) {
    return Response.json(
      { error: `"trigger" must be one of: ${AGENT_TRIGGERS.join(", ")}` },
      { status: 400 }
    );
  }

  const [run] = await db.insert(s.agentRuns).values({
    trigger,
    status: "running",
    cityId: auth.agent.cityId,  // from the credential
    userId: auth.agent.userId,  // from the credential
  }).returning();

  return Response.json(publicRun(run, auth.agent.cityName), { status: 201 });
}
