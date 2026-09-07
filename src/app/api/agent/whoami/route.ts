import { NextRequest } from "next/server";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

/**
 * Connectivity + identity check for an external agent.
 *
 * Read-only, and the one place that answers "which city am I?" — useful when
 * wiring up a new market, because a misconfigured credential shows up here
 * rather than as records quietly landing in the wrong city.
 *
 * Returns nothing secret: a display name and a city, which the caller had to
 * hold a valid credential to see at all.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  return Response.json({
    authenticated: true,
    agent: auth.agent.userName,
    city: auth.agent.cityName,
  });
}
