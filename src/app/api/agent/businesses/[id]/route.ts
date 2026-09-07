import { NextRequest } from "next/server";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { getAccountForAgent } from "@/lib/agent-accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/businesses/:id
 *
 * A business in the agent's own market, or 404.
 *
 * A record in ANOTHER city returns 404, not 403 — deliberately
 * indistinguishable from "no such business". 403 would confirm the id exists
 * somewhere, letting one market's agent map another's book by walking ids.
 * Same rule the human authorize() helper follows.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  const { id: idStr } = await ctx.params;
  if (!/^\d{1,9}$/.test(idStr)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const business = await getAccountForAgent(auth.agent.cityId, Number(idStr));
  if (!business) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ city: auth.agent.cityName, business });
}
