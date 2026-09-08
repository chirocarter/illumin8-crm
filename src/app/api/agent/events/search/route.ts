import { NextRequest } from "next/server";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import {
  searchEventsForAgent, AGENT_EVENT_SEARCH_MAX_LIMIT, AGENT_EVENT_QUERY_MAX_LENGTH,
} from "@/lib/agent-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/events/search?q=&date=&venue=&limit=
 *
 * "Do we already know about this event?" — the question the agent asks before
 * proposing anything, and the read half of duplicate prevention.
 *
 * There is no cityId parameter, by design. The city comes from the credential.
 * A `cityId` in the query string is simply an unrecognised parameter and is
 * ignored, so there is nothing to get wrong at a call site later.
 *
 * Read-only. This route creates nothing, updates nothing and opens no run.
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

  // Reject absurd input rather than truncating it silently — a 5 KB "q" is a
  // bug or a probe, and quietly searching its first 120 characters would hide
  // which one.
  for (const k of ["q", "venue"]) {
    const v = sp.get(k);
    if (v !== null && v.length > AGENT_EVENT_QUERY_MAX_LENGTH) {
      return Response.json(
        { error: `Parameter "${k}" exceeds ${AGENT_EVENT_QUERY_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  // A date is either a calendar date or a mistake. Accepting a partial one
  // would silently widen the search to a month or a year.
  const date = raw("date");
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'Parameter "date" must be YYYY-MM-DD' }, { status: 400 });
  }

  // A number that is too LARGE is clamped, not refused: asking for more than
  // the cap is reasonable, and the response reports both the applied limit and
  // maxLimit so the caller can see what happened. Something that is not a
  // number at all is a bug worth surfacing.
  const limitRaw = sp.get("limit");
  if (limitRaw !== null && !/^\d{1,6}$/.test(limitRaw)) {
    return Response.json({ error: 'Parameter "limit" must be a positive integer' }, { status: 400 });
  }

  const q = raw("q"), venue = raw("venue");
  if (!q && !date && !venue) {
    return Response.json(
      { error: "Provide at least one of: q, date, venue" },
      { status: 400 }
    );
  }

  const { matches, limit, truncated } = await searchEventsForAgent({
    cityId: auth.agent.cityId, // the ONLY source of scope
    q, date, venue,
    limit: limitRaw ? Number(limitRaw) : null,
  });

  return Response.json({
    city: auth.agent.cityName,
    count: matches.length,
    limit,
    maxLimit: AGENT_EVENT_SEARCH_MAX_LIMIT,
    truncated,
    matches,
  });
}
