import "server-only";

// Read model for the EVENT half of /agent: the review queue, the New
// Developments surface, and the integrity check.
//
// Separate from ./agent-dashboard, which is the business half. Same shapes and
// the same rules — derived counts, city scope from the human session, nothing
// cached — but keeping them apart stops one file becoming the place where every
// AI query lives.
import { db, schema as s } from "@/db";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { AI_REVIEW_PENDING, AI_REVIEW_APPROVED, AI_REVIEW_REJECTED } from "./ai-review";

export type EventResearchView = {
  summary: string | null;
  confidence: string | null;
  organizer: string | null;
  organizerContact: string | null;
  vendorStatus: string | null;
  vendorCost: string | null;
  estimatedAttendance: number | null;
  potential: Record<string, string | number> | null;
  recommendedAction: string | null;
  sources: { url: string; label?: string }[];
  changeLog: { at: string; note: string; source?: string }[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Parse the stored blob defensively — a malformed one must not break the page. */
export function parseEventResearch(raw: string | null): EventResearchView {
  const empty: EventResearchView = {
    summary: null, confidence: null, organizer: null, organizerContact: null,
    vendorStatus: null, vendorCost: null, estimatedAttendance: null, potential: null,
    recommendedAction: null, sources: [], changeLog: [],
  };
  if (!raw) return empty;
  try {
    const r = JSON.parse(raw) as Record<string, unknown>;
    return {
      summary: str(r.summary),
      confidence: str(r.confidence),
      organizer: str(r.organizer),
      organizerContact: str(r.organizerContact),
      vendorStatus: str(r.vendorStatus),
      vendorCost: str(r.vendorCost),
      estimatedAttendance: typeof r.estimatedAttendance === "number" ? r.estimatedAttendance : null,
      potential: r.potential && typeof r.potential === "object" && !Array.isArray(r.potential)
        ? (r.potential as Record<string, string | number>) : null,
      recommendedAction: str(r.recommendedAction),
      // Only http(s) links are ever rendered, whatever got stored.
      sources: Array.isArray(r.sources)
        ? (r.sources as { url?: unknown; label?: unknown }[])
            .filter((x) => typeof x?.url === "string" && /^https?:\/\//i.test(x.url as string))
            .map((x) => ({ url: x.url as string, label: typeof x.label === "string" ? x.label : undefined }))
        : [],
      changeLog: Array.isArray(r.changeLog)
        ? (r.changeLog as Record<string, unknown>[])
            .filter((x) => x && typeof x === "object")
            .map((x) => ({
              at: str(x.at) ?? "",
              note: str(x.note) ?? "",
              source: typeof x.source === "string" && /^https?:\/\//i.test(x.source) ? x.source : undefined,
            }))
            .filter((x) => x.note)
        : [],
    };
  } catch {
    return empty;
  }
}

/** Pill counts for the events list. Cheap, and only two numbers. */
export async function eventReviewCounts(cityId?: number | null): Promise<{ Pending: number; Rejected: number }> {
  const rows = await db
    .select({ status: s.events.aiReviewStatus, n: count() })
    .from(s.events)
    .where(and(isNotNull(s.events.aiReviewStatus), ...(cityId ? [eq(s.events.cityId, cityId)] : [])))
    .groupBy(s.events.aiReviewStatus);
  const out = { Pending: 0, Rejected: 0 };
  for (const r of rows) {
    if (r.status === AI_REVIEW_PENDING) out.Pending = Number(r.n);
    if (r.status === AI_REVIEW_REJECTED) out.Rejected = Number(r.n);
  }
  return out;
}

export type PendingEvent = {
  id: number; name: string; type: string;
  startsAt: string | null; locationText: string | null;
  applicationDeadline: string | null; deadlinePassed: boolean;
  expectedAttendees: number; aiFitScore: number | null; createdAt: string;
} & EventResearchView;

/**
 * The review queue for one city.
 *
 * Order: best candidates first, unscored last — a missing score means "not
 * assessed", not "assessed badly", so sorting it as zero would bury a
 * promising undated find. Within the same score the nearer application
 * deadline comes first, because that is the one that stops being actionable.
 * Both rules are plain SQL, so the order is reproducible.
 *
 * Undated events are NOT excluded or demoted. A promising event whose organizer
 * has not published a date is the case this whole feature exists to catch.
 */
export async function pendingEventsForReview(cityId: number | null, today: string): Promise<PendingEvent[]> {
  const rows = await db
    .select({
      id: s.events.id, name: s.events.name, type: s.events.type,
      startsAt: s.events.startsAt, locationText: s.events.locationText,
      applicationDeadline: s.events.applicationDeadline,
      expectedAttendees: s.events.expectedAttendees,
      aiFitScore: s.events.aiFitScore, aiResearch: s.events.aiResearch,
      createdAt: s.events.createdAt,
    })
    .from(s.events)
    .where(and(
      eq(s.events.aiReviewStatus, AI_REVIEW_PENDING),
      ...(cityId ? [eq(s.events.cityId, cityId)] : []),
    ))
    .orderBy(
      sql`${s.events.aiFitScore} IS NULL`,
      desc(s.events.aiFitScore),
      sql`${s.events.applicationDeadline} IS NULL`,
      s.events.applicationDeadline,
      desc(s.events.id),
    )
    .limit(50);

  return rows.map(({ aiResearch, applicationDeadline, ...rest }) => ({
    ...rest,
    applicationDeadline,
    deadlinePassed: !!applicationDeadline && applicationDeadline < today,
    ...parseEventResearch(aiResearch),
  }));
}

export type EventDevelopment = {
  activityId: number; createdAt: string; detail: string | null; runId: number;
  eventId: number; name: string; startsAt: string | null;
  aiReviewStatus: string | null; aiReviewReason: string | null; aiReviewedAt: string | null;
  applicationDeadline: string | null; aiFitScore: number | null; confidence: string | null;
  latestSource: string | null;
};

/**
 * Material developments worth a second look.
 *
 * Built from `resurfaced` ONLY — never from `researched`. A research refresh
 * happens on every sweep; if routine refreshes appeared here the surface would
 * be noise within a week and Carter would stop reading it.
 *
 * For a REVIEWED event the development must post-date the review. A development
 * the agent logged before Carter looked is already part of what he decided on,
 * and re-showing it as news would misrepresent his own decision back to him.
 * Pending events have no review timestamp, so everything on them qualifies.
 */
export async function newEventDevelopments(cityId: number | null): Promise<EventDevelopment[]> {
  const rows = await db
    .select({
      activityId: s.agentActivities.id,
      createdAt: s.agentActivities.createdAt,
      detail: s.agentActivities.detail,
      runId: s.agentActivities.agentRunId,
      eventId: s.events.id,
      name: s.events.name,
      startsAt: s.events.startsAt,
      aiReviewStatus: s.events.aiReviewStatus,
      aiReviewReason: s.events.aiReviewReason,
      aiReviewedAt: s.events.aiReviewedAt,
      applicationDeadline: s.events.applicationDeadline,
      aiFitScore: s.events.aiFitScore,
      aiResearch: s.events.aiResearch,
    })
    .from(s.agentActivities)
    .innerJoin(s.events, eq(s.events.id, s.agentActivities.eventId))
    .where(and(
      eq(s.agentActivities.action, "resurfaced"),
      ...(cityId ? [eq(s.agentActivities.cityId, cityId)] : []),
      // Post-review only, for reviewed events.
      //
      // The two columns are NOT written in the same format, and comparing them
      // raw is wrong in a way that looks right:
      //   agent_activities.created_at  "2026-09-08 16:22:08"  (SQLite default)
      //   events.ai_reviewed_at        "2026-09-08T16:20:45"  (nowISO)
      // " " sorts before "T", so a development logged minutes AFTER a review on
      // the same day compared as earlier and was silently dropped. Verified by
      // test. Normalizing the separator on both sides makes the comparison mean
      // what it says.
      sql`(${s.events.aiReviewedAt} IS NULL
           OR replace(${s.agentActivities.createdAt}, 'T', ' ') > replace(${s.events.aiReviewedAt}, 'T', ' '))`,
    ))
    .orderBy(desc(s.agentActivities.id))
    .limit(30);

  return rows.map(({ aiResearch, ...rest }) => {
    const research = parseEventResearch(aiResearch);
    return {
      ...rest,
      confidence: research.confidence,
      latestSource: research.changeLog.at(-1)?.source ?? research.sources[0]?.url ?? null,
    };
  });
}

/**
 * Events written by the agent with no matching 'created' ledger entry.
 *
 * This is the observability half of the known crash window between the event
 * insert and the ledger insert on POST /api/agent/events. Nothing is repaired
 * automatically — an anomaly that fixes itself teaches nobody anything.
 *
 * Mirrors the account check in ./agent-dashboard exactly.
 */
export async function unreconciledEvents(cityId: number | null) {
  return db
    .select({ id: s.events.id, name: s.events.name, agentRunId: s.events.agentRunId })
    .from(s.events)
    .where(and(
      isNotNull(s.events.agentRunId),
      ...(cityId ? [eq(s.events.cityId, cityId)] : []),
      sql`NOT EXISTS (
        SELECT 1 FROM agent_activities ag
        WHERE ag.event_id = events.id
          AND ag.action = 'created'
          AND ag.agent_run_id = events.agent_run_id)`,
    ))
    .limit(10);
}

export { AI_REVIEW_PENDING, AI_REVIEW_APPROVED, AI_REVIEW_REJECTED };
