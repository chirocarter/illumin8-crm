import "server-only";

// Read-only event access for the AI outreach agent.
//
// Same shape as ./agent-accounts, and for the same reason: lib/lists.ts starts
// from the signed-in user's session and city cookie, which an external agent
// does not have. cityId is a REQUIRED argument here, so an unscoped query is
// not expressible.
//
// The agent sees OUTREACH events only. Meetings, internal meetings and
// time-off blocks live on the events table so they appear on Carter's
// calendar, but they are his diary — not opportunities. Excluding them keeps
// the agent away from personal scheduling and stops it deduping a booth
// application against a dentist appointment.
import { db, schema as s } from "@/db";
import { and, eq, gte, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { NON_OUTREACH_EVENT_TYPES } from "./taxonomy";

export const AGENT_EVENT_SEARCH_MAX_LIMIT = 25;
export const AGENT_EVENT_SEARCH_DEFAULT_LIMIT = 10;
/** Long enough to be a real query, short enough not to be an attack. */
export const AGENT_EVENT_QUERY_MAX_LENGTH = 120;

const NAME_NOISE = new Set([
  "the", "a", "an", "of", "at", "in", "on", "for",
  "annual", "official", "presents", "presented",
]);

/**
 * The comparable form of an event name.
 *
 * Event titles get re-published with small differences all the time — "The 3rd
 * Annual ABQ Health & Wellness Expo" and "ABQ Health and Wellness Expo 2026"
 * are one event. This collapses the differences that never carry identity:
 * case, punctuation, "&" vs "and", ordinal and year noise, and a little filler.
 *
 * Deliberately NOT fuzzy — no edit distance, no vectors. Two names either
 * reduce to the same string or they do not, which is a rule a person can check
 * by hand and a test can pin down.
 *
 * Exported because the eventual server-side dedupe must use exactly this, and
 * it is returned to the agent so its judgement and the server's cannot drift.
 *
 * KNOWN LIMIT, and the thing E3 has to design around: this is a POST-FILTER
 * over rows SQL has already returned, not a search key. Name recall is bound by
 * the LIKE below, so a genuinely reworded title ("Health and Wellness Expo
 * Albuquerque" for a stored "The 3rd Annual ABQ Health & Wellness Expo") comes
 * back only when the date or venue also matches. Verified both ways.
 *
 * The date is therefore the reliable anchor for dedupe — every real event has
 * one. Making the name itself a search key would mean storing this value in its
 * own indexed column, which is a schema change, not a query change.
 */
export function normalizeEventName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    // Ordinals ("3rd"), bare years ("2026") and filler carry no identity.
    .filter((w) => w && !NAME_NOISE.has(w)
      && !/^\d{1,2}(st|nd|rd|th)$/.test(w)
      && !/^(19|20)\d{2}$/.test(w))
    .join(" ");
}

/** Venue text reduced the same way, so "Expo NM" compares with "EXPO N.M.". */
export function normalizeVenue(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The only event fields an agent has any reason to see in a result list. */
const EVENT_FIELDS = {
  id: s.events.id,
  name: s.events.name,
  type: s.events.type,
  status: s.events.status,
  startsAt: s.events.startsAt,
  endsAt: s.events.endsAt,
  locationText: s.events.locationText,
  expectedAttendees: s.events.expectedAttendees,
  applicationDeadline: s.events.applicationDeadline,
  aiFitScore: s.events.aiFitScore,
  aiReviewStatus: s.events.aiReviewStatus,
} as const;

export type AgentEventMatch = {
  id: number; name: string; type: string; status: string;
  startsAt: string | null; endsAt: string | null; locationText: string | null;
  expectedAttendees: number; applicationDeadline: string | null;
  aiFitScore: number | null; aiReviewStatus: string | null;
  /** The comparable form of `name`, so the caller need not re-derive it. */
  normalizedName: string;
  /** Which supplied criterion this row matched — helps judge a duplicate. */
  matchedOn: ("name" | "nameExact" | "date" | "venue")[];
};

export type AgentEventSearchInput = {
  /** From the authenticated identity. Never from the request. */
  cityId: number;
  q?: string | null;
  /** A calendar date, YYYY-MM-DD. Matches any event starting that day. */
  date?: string | null;
  venue?: string | null;
  limit?: number | null;
};

/**
 * Find events in ONE city that might already be the one being researched.
 *
 * Criteria are OR'd, like the business search: an event whose published name
 * has changed but whose date and venue have not is exactly the duplicate worth
 * catching. This reports what exists; it does not decide what a duplicate is.
 */
export async function searchEventsForAgent(
  input: AgentEventSearchInput
): Promise<{ matches: AgentEventMatch[]; limit: number; truncated: boolean }> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? AGENT_EVENT_SEARCH_DEFAULT_LIMIT)),
    AGENT_EVENT_SEARCH_MAX_LIMIT
  );

  const q = input.q?.trim().slice(0, AGENT_EVENT_QUERY_MAX_LENGTH) || null;
  const venue = input.venue?.trim().slice(0, AGENT_EVENT_QUERY_MAX_LENGTH) || null;
  const date = input.date?.trim() || null;

  // "!" is the LIKE escape character, not backslash — a backslash has to
  // survive both a TypeScript template literal and SQLite's parser, and SQLite
  // rejected the result as not a single character. % and _ in an event name
  // stay literal, so a caller cannot pass "%" to match the whole city.
  const likeSafe = (v: string) => v.replace(/[!%_]/g, (c) => `!${c}`);

  const criteria: SQL[] = [];
  if (q) {
    criteria.push(sql`${s.events.name} LIKE ${"%" + likeSafe(q) + "%"} ESCAPE '!'`);
  }
  if (venue) {
    criteria.push(sql`coalesce(${s.events.locationText}, '') LIKE ${"%" + likeSafe(venue) + "%"} ESCAPE '!'`);
  }
  if (date) {
    // starts_at is "YYYY-MM-DDTHH:mm:ss"; a half-open string range covers the
    // whole day without depending on SQLite's date functions.
    criteria.push(and(gte(s.events.startsAt, date), lt(s.events.startsAt, date + "T99"))!);
  }

  // No criteria means no search. Returning the city's whole calendar on an
  // empty query is exactly the "dump the database" call the cap exists to stop.
  if (criteria.length === 0) return { matches: [], limit, truncated: false };

  const rows = await db
    .select(EVENT_FIELDS)
    .from(s.events)
    .where(and(
      // cityId is not optional and not caller-supplied: this is the isolation.
      // A NULL city_id never equals anything, so historical events predating
      // the column belong to no market rather than to both.
      eq(s.events.cityId, input.cityId),
      notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]),
      or(...criteria)!,
    ))
    .limit(limit + 1); // one extra, only to detect truncation

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  // Normalized comparison happens here rather than in SQL, for the same reason
  // the domain check does in agent-accounts: doing it properly in SQLite is far
  // more error-prone than doing it once in TypeScript.
  const qNorm = q ? normalizeEventName(q) : null;
  const venueNorm = venue ? normalizeVenue(venue) : null;

  const matches: AgentEventMatch[] = page.map((r) => {
    const normalizedName = normalizeEventName(r.name);
    const matchedOn: AgentEventMatch["matchedOn"] = [];
    if (q && r.name.toLowerCase().includes(q.toLowerCase())) matchedOn.push("name");
    if (qNorm && normalizedName === qNorm) matchedOn.push("nameExact");
    if (date && r.startsAt && r.startsAt.slice(0, 10) === date) matchedOn.push("date");
    if (venueNorm && r.locationText && normalizeVenue(r.locationText).includes(venueNorm)) {
      matchedOn.push("venue");
    }
    return { ...r, normalizedName, matchedOn };
  });

  return { matches, limit, truncated };
}

/** One event in the agent's own market, including its own prior research. */
export async function getEventForAgent(cityId: number, id: number) {
  const row = await db.query.events.findFirst({
    where: and(
      eq(s.events.id, id),
      eq(s.events.cityId, cityId),
      notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]),
    ),
    columns: {
      id: true, name: true, type: true, status: true,
      startsAt: true, endsAt: true, locationText: true,
      expectedAttendees: true, applicationDeadline: true,
      aiFitScore: true, aiResearch: true, agentRunId: true,
      aiReviewStatus: true, aiReviewReason: true, createdAt: true,
      // Deliberately absent:
      //   cityId, userId        internal wiring — and cityId in particular is
      //                         the thing the agent must never learn to think
      //                         of as an input
      //   accountId, contactId, campaignId, partnerId, opportunityId,
      //   clinicLocationId      human relationship wiring
      //   bookedAt, actualAttendees, screeningsCompleted, revenue,
      //   outcomeNotes, followUp*
      //                         operational results, none of the agent's
      //                         business; `status` already says where an event
      //                         stands
      //   notes                 Carter's planning notes. The agent has its own
      //                         research field and does not read his.
    },
  });
  if (!row) return null;

  // Stored as JSON text; handed back as an object so the agent need not parse
  // it. A malformed blob returns null rather than throwing.
  const { aiResearch, ...rest } = row;
  let research: unknown = null;
  if (aiResearch) { try { research = JSON.parse(aiResearch); } catch { research = null; } }
  return { ...rest, normalizedName: normalizeEventName(rest.name), aiResearch: research };
}
