import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { and, eq } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { loadOwnedRun, runUsage, MAX_ACTIVITIES_PER_RUN, STALE_RUN_HOURS } from "@/lib/agent-runs";
import {
  validateEventResearch, validateDevelopment, mergeChangeLog, isCalendarDate,
  developmentFingerprint, MAX_RESEARCH_BYTES,
} from "@/lib/agent-event-prospects";
import { NON_OUTREACH_EVENT_TYPES } from "@/lib/taxonomy";
import { notInArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/agent/events/:id/research
 *
 * Refreshes the AI RESEARCH LAYER. It writes exactly three columns —
 * aiFitScore, aiResearch and applicationDeadline — and every other field is
 * unreachable, not by validation that rejects it but because the update
 * statement names only those three. A caller could send "status", "startsAt" or
 * "locationText" and nothing would happen to them.
 *
 * applicationDeadline is here on purpose. It is a discovery fact that genuinely
 * changes when registration information is published, and it is NOT startsAt,
 * endsAt or followUpDueAt — those stay human-owned and untouchable here.
 *
 * WORKS ON PENDING, APPROVED AND REJECTED EVENTS. Review means a human owns the
 * OPERATIONAL record; it does not mean the scanner goes blind. What it can
 * never do is change the review itself: status, reason, reviewer and timestamp
 * are absent from the update, so a rejected event stays rejected no matter what
 * the agent finds. If external research suggests a human-owned field is wrong,
 * that belongs in the changeLog as a discrepancy — never as a silent correction.
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

  // Named and refused, rather than ignored. Sending "status" here is a
  // misunderstanding of what this endpoint is for, and saying so is more useful
  // than silently discarding it.
  const FORBIDDEN = [
    "name", "type", "status", "bookedAt", "startsAt", "endsAt", "locationText", "notes",
    "expectedAttendees", "actualAttendees", "screeningsCompleted", "revenue", "outcomeNotes",
    "followUpRequired", "followUpDueAt",
    "accountId", "contactId", "opportunityId", "campaignId", "partnerId", "clinicLocationId",
    "cityId", "userId",
    "aiReviewStatus", "aiReviewReason", "aiReviewedAt", "aiReviewedBy",
  ];
  const sent = FORBIDDEN.filter((k) => k in b);
  if (sent.length) {
    return Response.json({
      error: `This endpoint updates AI research only. Cannot be set here: ${sent.join(", ")}`,
      hint: "If research suggests a human-owned field is wrong, record it as a development instead — the CRM will not silently correct a person's record.",
    }, { status: 400 });
  }

  const patch: { aiFitScore?: number; aiResearch?: string; applicationDeadline?: string | null } = {};

  if (b.aiFitScore !== undefined && b.aiFitScore !== null) {
    if (typeof b.aiFitScore !== "number" || !Number.isInteger(b.aiFitScore)
        || b.aiFitScore < 0 || b.aiFitScore > 100) {
      return Response.json({ error: '"aiFitScore" must be an integer 0-100' }, { status: 400 });
    }
    patch.aiFitScore = b.aiFitScore;
  }

  // Explicit null clears a deadline that turned out not to exist; a string sets
  // one. Absent leaves it alone.
  if ("applicationDeadline" in b) {
    if (b.applicationDeadline === null) {
      patch.applicationDeadline = null;
    } else if (typeof b.applicationDeadline === "string" && isCalendarDate(b.applicationDeadline.trim())) {
      patch.applicationDeadline = b.applicationDeadline.trim();
    } else {
      return Response.json(
        { error: '"applicationDeadline" must be a calendar date YYYY-MM-DD, or null to clear it' },
        { status: 400 }
      );
    }
  }

  let incomingResearch: Record<string, unknown> | null = null;
  if (b.aiResearch !== undefined && b.aiResearch !== null) {
    const parsed = validateEventResearch(b.aiResearch);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    incomingResearch = parsed.value as Record<string, unknown>;
  }

  // The optional material-development declaration. Materiality is DECLARED, not
  // inferred: calling this endpoint is not evidence that anything changed, and
  // treating every refresh as news is how a useful signal becomes noise.
  let development: ReturnType<typeof validateDevelopment> | null = null;
  if (b.development !== undefined && b.development !== null) {
    development = validateDevelopment(b.development);
    if (!development.ok) return Response.json({ error: development.error }, { status: 400 });
  }

  if (patch.aiFitScore === undefined && incomingResearch === null
      && !("applicationDeadline" in patch) && !development) {
    return Response.json(
      { error: "Provide at least one of: aiFitScore, aiResearch, applicationDeadline, development" },
      { status: 400 }
    );
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

  // The event must live in the agent's own city, and be an outreach event —
  // the same two conditions the read API applies. A foreign one reads as not
  // found, exactly as everywhere else in this API.
  const event = await db.query.events.findFirst({
    where: and(
      eq(s.events.id, Number(idStr)),
      eq(s.events.cityId, auth.agent.cityId),
      notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]),
    ),
    columns: { id: true, name: true, aiResearch: true, aiReviewStatus: true },
  });
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });

  const usage = await runUsage(run.id);
  if (usage.total + 1 > MAX_ACTIVITIES_PER_RUN) {
    return Response.json({ error: `Run would exceed ${MAX_ACTIVITIES_PER_RUN} activities` }, { status: 409 });
  }

  // ---- change log: merge, never replace ------------------------------------
  // The external agent is not trusted to send back the full accumulated history
  // correctly every time, and one forgetful payload must not erase months of
  // development records. The stored log is authoritative; the incoming one can
  // only add.
  const merged = mergeChangeLog({
    stored: event.aiResearch,
    incoming: incomingResearch,
    development: development?.ok ? development.value : null,
  });
  if (!merged.ok) return Response.json({ error: merged.error }, { status: 400 });
  if (incomingResearch !== null || development) patch.aiResearch = merged.json;

  // ---- did this development already get logged in this run? -----------------
  // One weekly sweep must not tell Carter five times that vendor registration
  // opened. Deterministic and simple: same event, same run, same fingerprint.
  let alreadyLogged = false;
  if (development?.ok) {
    const fingerprint = developmentFingerprint(development.value);
    const priorRows = await db
      .select({ detail: s.agentActivities.detail })
      .from(s.agentActivities)
      .where(and(
        eq(s.agentActivities.agentRunId, run.id),
        eq(s.agentActivities.eventId, event.id),
        eq(s.agentActivities.action, "resurfaced"),
      ));
    alreadyLogged = priorRows.some((r) => (r.detail ?? "").startsWith(fingerprint));
  }

  const [updated] = await db.update(s.events)
    .set(patch)                       // only these three columns, ever
    .where(eq(s.events.id, event.id))
    .returning({
      id: s.events.id, aiFitScore: s.events.aiFitScore, aiResearch: s.events.aiResearch,
      applicationDeadline: s.events.applicationDeadline, aiReviewStatus: s.events.aiReviewStatus,
      status: s.events.status, bookedAt: s.events.bookedAt,
    });

  const action = development?.ok && !alreadyLogged ? "resurfaced" : "researched";
  const detail = development?.ok
    ? `${developmentFingerprint(development.value)} ${development.value.detail}`.slice(0, 500)
    : `Research updated for "${event.name}"`.slice(0, 500);
  // A duplicate development still records that a refresh happened — it is just
  // not announced a second time.
  if (!(development?.ok && alreadyLogged)) {
    await db.insert(s.agentActivities).values({
      agentRunId: run.id,
      eventId: event.id,
      action,
      detail,
      cityId: run.cityId,
    });
  }

  let research: unknown = null;
  if (updated.aiResearch) { try { research = JSON.parse(updated.aiResearch); } catch { research = null; } }
  return Response.json({
    updated: true,
    id: updated.id,
    city: auth.agent.cityName,
    action: development?.ok && alreadyLogged ? "already_reported" : action,
    aiFitScore: updated.aiFitScore,
    applicationDeadline: updated.applicationDeadline,
    // Echoed so the caller can see plainly that review and lifecycle are
    // untouched by anything it just sent.
    aiReviewStatus: updated.aiReviewStatus,
    status: updated.status,
    bookedAt: updated.bookedAt,
    changeLogEntries: merged.entryCount,
    researchBytes: merged.json ? merged.json.length : 0,
    maxResearchBytes: MAX_RESEARCH_BYTES,
    aiResearch: research,
  });
}
