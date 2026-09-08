import { NextRequest } from "next/server";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { getEventForAgent } from "@/lib/agent-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/events/:id
 *
 * An event in the agent's own market, or 404.
 *
 * A record in ANOTHER city returns 404, not 403 — deliberately
 * indistinguishable from "no such event". 403 would confirm the id exists
 * somewhere, letting one market's agent map another's calendar by walking ids.
 * Same rule the human authorize() helper follows, and the same rule the
 * business detail route follows.
 *
 * Historical events with no city are reachable by neither market: the lookup
 * compares city_id for equality, and NULL equals nothing.
 *
 * Read-only. Nothing here writes, and nothing here can move an event towards
 * Booked — the agent has no path to that at all yet.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  const { id: idStr } = await ctx.params;
  if (!/^\d{1,9}$/.test(idStr)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const event = await getEventForAgent(auth.agent.cityId, Number(idStr));
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ city: auth.agent.cityName, event });
}
