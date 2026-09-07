import { NextRequest } from "next/server";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import {
  searchAccountsForAgent, AGENT_SEARCH_MAX_LIMIT, AGENT_QUERY_MAX_LENGTH,
} from "@/lib/agent-accounts";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/businesses/search?q=&phone=&website=&limit=
 *
 * "Does this business already exist in my market?" — the question the agent
 * asks before creating anything.
 *
 * There is no cityId parameter, by design. The city comes from the credential.
 * A `cityId` in the query string is simply an unrecognised parameter and is
 * ignored, so there is nothing to get wrong at a call site later.
 */
export async function GET(req: NextRequest) {
  // Called here, not inherited from middleware. Middleware only lets the
  // request REACH this route; this line decides whether it may do anything.
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  const sp = req.nextUrl.searchParams;
  const raw = (k: string) => {
    const v = sp.get(k);
    return v && v.trim() ? v.trim() : null;
  };

  // Reject absurd input rather than truncating it silently — a 5 KB "name" is a
  // bug or a probe, and quietly searching its first 120 characters would hide
  // which one.
  for (const k of ["q", "phone", "website"]) {
    const v = sp.get(k);
    if (v !== null && v.length > AGENT_QUERY_MAX_LENGTH) {
      return Response.json(
        { error: `Parameter "${k}" exceeds ${AGENT_QUERY_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  // A number that is too LARGE is clamped, not refused: asking for more than
  // the cap is reasonable, and the response reports both the applied limit and
  // maxLimit so the caller can see what happened. Something that is not a
  // number at all is a bug worth surfacing.
  const limitRaw = sp.get("limit");
  if (limitRaw !== null && !/^\d{1,6}$/.test(limitRaw)) {
    return Response.json({ error: 'Parameter "limit" must be a positive integer' }, { status: 400 });
  }

  const q = raw("q"), phone = raw("phone"), website = raw("website");
  if (!q && !phone && !website) {
    return Response.json(
      { error: "Provide at least one of: q, phone, website" },
      { status: 400 }
    );
  }

  const { matches, limit, truncated } = await searchAccountsForAgent({
    cityId: auth.agent.cityId, // the ONLY source of scope
    q, phone, website,
    limit: limitRaw ? Number(limitRaw) : null,
  });

  return Response.json({
    city: auth.agent.cityName,
    count: matches.length,
    limit,
    maxLimit: AGENT_SEARCH_MAX_LIMIT,
    truncated,
    matches,
  });
}
