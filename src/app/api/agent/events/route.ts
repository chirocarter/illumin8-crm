import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { loadOwnedRun, runUsage, MAX_ACTIVITIES_PER_RUN, STALE_RUN_HOURS } from "@/lib/agent-runs";
import { normalizeEventName } from "@/lib/agent-events";
import {
  findEventDuplicate, validateEventResearch, normalizeStartsAt, isCalendarDate,
  MAX_NAME_LENGTH, MAX_VENUE_LENGTH, MAX_EXPECTED_ATTENDEES, MAX_YEARS_AHEAD,
} from "@/lib/agent-event-prospects";
import { AI_REVIEW_PENDING } from "@/lib/ai-review";
import { EVENT_TYPES, NON_OUTREACH_EVENT_TYPES } from "@/lib/taxonomy";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/events — propose a prospective event for human review.
 *
 * WHAT THE AGENT CANNOT DO HERE, structurally rather than by validation:
 * there is no `status` input. An agent-created event is always born
 * status='Idea', bookedAt=null, aiReviewStatus='Pending'. Booked, Confirmed,
 * Completed and Follow-Up Needed are not reachable through this route at all,
 * so nothing the agent sends can make the CRM claim Illumin8 has booked
 * anything. cityId, userId and agentRunId come from the credential and the
 * validated run; every review field comes from a human session elsewhere.
 *
 * ON ATOMICITY, deliberately not glossed over: this does NOT use a database
 * transaction, for the reason recorded on the business prospects route — the
 * two drivers disagree about what one means, so a rollback bug could be real
 * in production and impossible to reproduce locally. Instead: insert the event,
 * then the ledger entry, and if the ledger entry fails, delete the event just
 * made. Same behaviour on both drivers. The residual risk is a crash between
 * the two writes, which is detectable with one query — an event with
 * agent_run_id and no matching 'created' activity.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Malformed JSON body" }, { status: 400 }); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  // ---- run ----------------------------------------------------------------
  if (typeof b.agentRunId !== "number" || !Number.isInteger(b.agentRunId) || b.agentRunId <= 0) {
    return Response.json({ error: '"agentRunId" is required' }, { status: 400 });
  }

  // ---- name ---------------------------------------------------------------
  if (typeof b.name !== "string" || !b.name.trim()) {
    return Response.json({ error: '"name" is required' }, { status: 400 });
  }
  const name = b.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return Response.json({ error: `"name" exceeds ${MAX_NAME_LENGTH} characters` }, { status: 400 });
  }
  // A name that normalizes to nothing ("2026", "!!!") cannot be deduped against
  // anything, so it would be a permanent duplicate magnet.
  if (!normalizeEventName(name)) {
    return Response.json(
      { error: '"name" must contain at least one distinguishing word' },
      { status: 400 }
    );
  }

  // ---- type ---------------------------------------------------------------
  // Restricted to the outreach vocabulary. The agent must not be able to file
  // a discovery as "Time Off / Away" or "Internal Meeting" — those are Carter's
  // calendar, and the read API deliberately cannot even see them.
  const OUTREACH_TYPES = EVENT_TYPES.filter(
    (t) => !(NON_OUTREACH_EVENT_TYPES as readonly string[]).includes(t)
  );
  let type = "Community Event";
  if (b.type != null) {
    if (typeof b.type !== "string" || !OUTREACH_TYPES.includes(b.type as typeof OUTREACH_TYPES[number])) {
      return Response.json(
        { error: `"type" must be one of: ${OUTREACH_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    type = b.type;
  }

  // ---- dates --------------------------------------------------------------
  // startsAt MAY be null. A promising event whose organizer has not published a
  // date yet is a supported case, not an edge case, and must not be lost merely
  // because an undated row is harder to dedupe.
  let startsAt: string | null = null;
  if (b.startsAt != null) {
    if (typeof b.startsAt !== "string") {
      return Response.json({ error: '"startsAt" must be a string or null' }, { status: 400 });
    }
    startsAt = normalizeStartsAt(b.startsAt);
    if (!startsAt) {
      return Response.json(
        { error: '"startsAt" must be YYYY-MM-DD, YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss' },
        { status: 400 }
      );
    }
    // Do not silently create last year's event because an archived listing was
    // mistaken for the current one. This agent discovers opportunities, and an
    // opportunity that has already happened is not one.
    const today = todayISO();
    if (startsAt.slice(0, 10) < today) {
      return Response.json({
        error: `"startsAt" is in the past (${startsAt.slice(0, 10)}). This endpoint creates current and future opportunities; historical ingestion is not supported.`,
      }, { status: 400 });
    }
    const maxYear = Number(today.slice(0, 4)) + MAX_YEARS_AHEAD;
    if (Number(startsAt.slice(0, 4)) > maxYear) {
      return Response.json(
        { error: `"startsAt" is more than ${MAX_YEARS_AHEAD} years ahead — check the parsed year` },
        { status: 400 }
      );
    }
  }

  let endsAt: string | null = null;
  if (b.endsAt != null) {
    if (typeof b.endsAt !== "string") {
      return Response.json({ error: '"endsAt" must be a string or null' }, { status: 400 });
    }
    endsAt = normalizeStartsAt(b.endsAt);
    if (!endsAt) {
      return Response.json({ error: '"endsAt" must be a valid date or datetime' }, { status: 400 });
    }
    // Mirrors what the human form does: an end before its start would render as
    // a negative-height block on the calendar.
    if (!startsAt || endsAt <= startsAt) {
      return Response.json({ error: '"endsAt" must be after "startsAt"' }, { status: 400 });
    }
  }

  // applicationDeadline is its own field and never followUpDueAt, which means
  // "chase the host AFTER the event happened".
  let applicationDeadline: string | null = null;
  if (b.applicationDeadline != null) {
    if (typeof b.applicationDeadline !== "string" || !isCalendarDate(b.applicationDeadline.trim())) {
      return Response.json({ error: '"applicationDeadline" must be a calendar date, YYYY-MM-DD' }, { status: 400 });
    }
    applicationDeadline = b.applicationDeadline.trim();
  }

  // ---- descriptive fields -------------------------------------------------
  let locationText: string | null = null;
  if (b.locationText != null) {
    if (typeof b.locationText !== "string") {
      return Response.json({ error: '"locationText" must be a string' }, { status: 400 });
    }
    locationText = b.locationText.trim().slice(0, MAX_VENUE_LENGTH) || null;
  }

  let expectedAttendees = 0;
  if (b.expectedAttendees != null) {
    const v = b.expectedAttendees;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_EXPECTED_ATTENDEES) {
      return Response.json(
        { error: `"expectedAttendees" must be an integer 0-${MAX_EXPECTED_ATTENDEES}` },
        { status: 400 }
      );
    }
    expectedAttendees = v;
  }

  let fitScore: number | null = null;
  if (b.aiFitScore != null) {
    if (typeof b.aiFitScore !== "number" || !Number.isInteger(b.aiFitScore)
        || b.aiFitScore < 0 || b.aiFitScore > 100) {
      return Response.json({ error: '"aiFitScore" must be an integer 0-100' }, { status: 400 });
    }
    fitScore = b.aiFitScore;
  }

  let researchJson: string | null = null;
  if (b.aiResearch != null) {
    const parsed = validateEventResearch(b.aiResearch);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    researchJson = JSON.stringify(parsed.value);
  }

  // ---- fields the agent may never set -------------------------------------
  // Named explicitly and REFUSED rather than ignored. Silently dropping
  // "status": "Booked" would let a caller believe it had booked an event; a 400
  // says the boundary exists. Ignoring is right for a stray query parameter,
  // but a body key is a deliberate statement of intent.
  const FORBIDDEN = [
    "status", "bookedAt", "cityId", "userId", "city", "user",
    "actualAttendees", "screeningsCompleted", "revenue", "outcomeNotes",
    "followUpRequired", "followUpDueAt", "notes",
    "aiReviewStatus", "aiReviewReason", "aiReviewedAt", "aiReviewedBy",
    "accountId", "contactId", "opportunityId", "campaignId", "partnerId", "clinicLocationId",
  ];
  const sent = FORBIDDEN.filter((k) => k in b);
  if (sent.length) {
    return Response.json({
      error: `These fields are set by the CRM and cannot be supplied: ${sent.join(", ")}`,
      hint: "An agent-discovered event is always created as status 'Idea', pending human review. Only a person can book an event.",
    }, { status: 400 });
  }

  // ---- the run must exist, be owned by this agent AND city, and be running --
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

  // An event writes a ledger row, so it is bound by the same run cap.
  const usage = await runUsage(run.id);
  if (usage.total + 1 > MAX_ACTIVITIES_PER_RUN) {
    return Response.json({ error: `Run would exceed ${MAX_ACTIVITIES_PER_RUN} activities` }, { status: 409 });
  }

  // ---- server-side duplicate safety, within this city only -----------------
  const { duplicate, venueCollision, candidatesChecked } =
    await findEventDuplicate(auth.agent.cityId, { name, startsAt, locationText });

  if (duplicate) {
    await db.insert(s.agentActivities).values({
      agentRunId: run.id,
      eventId: duplicate.duplicateOf,
      action: "duplicate_skipped",
      detail: `"${name}" matched existing event #${duplicate.duplicateOf} on ${duplicate.matchedOn.join(" + ")}`.slice(0, 500),
      cityId: run.cityId,
    });
    return Response.json({
      created: false,
      duplicateOf: duplicate.duplicateOf,
      matchedOn: duplicate.matchedOn,
      existing: duplicate.existing,
      candidatesChecked,
    }, { status: 409 });
  }

  const [event] = await db.insert(s.events).values({
    name,
    type,
    startsAt,
    endsAt,
    locationText,
    expectedAttendees,
    applicationDeadline,
    // Server-forced, every one of them. Not defaults a caller could override —
    // there is no input path to any of these values.
    status: "Idea",
    bookedAt: null,
    aiFitScore: fitScore,
    aiResearch: researchJson,
    agentRunId: run.id,
    aiReviewStatus: AI_REVIEW_PENDING,
    cityId: run.cityId,   // from the run, which came from the credential
    userId: run.userId,   // ditto
  }).returning();

  try {
    await db.insert(s.agentActivities).values({
      agentRunId: run.id,
      eventId: event.id,
      action: "created",
      detail: `Discovered event "${name}" for review`.slice(0, 500),
      cityId: run.cityId,
    });
  } catch (err) {
    // Compensating delete: the ledger must never miss a real write, so if it
    // cannot be recorded, the write is undone rather than left unaudited.
    await db.delete(s.events).where(eq(s.events.id, event.id));
    console.error("[agent] ledger write failed; event rolled back", err);
    return Response.json({ error: "Could not record the audit entry; nothing was created" }, { status: 500 });
  }

  return Response.json({
    created: true,
    id: event.id,
    name: event.name,
    normalizedName: normalizeEventName(event.name),
    type: event.type,
    status: event.status,               // always "Idea"
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    locationText: event.locationText,
    expectedAttendees: event.expectedAttendees,
    applicationDeadline: event.applicationDeadline,
    // Says plainly that a stored deadline has passed, so nothing downstream can
    // read a factual date as "registration is open".
    applicationDeadlinePassed: applicationDeadline ? applicationDeadline < todayISO() : false,
    aiFitScore: event.aiFitScore,
    aiReviewStatus: event.aiReviewStatus, // always "Pending"
    city: auth.agent.cityName,
    candidatesChecked,
    ...(venueCollision ? { venueCollisionWith: venueCollision } : {}),
  }, { status: 201 });
}
