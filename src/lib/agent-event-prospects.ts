import "server-only";

// Validation and duplicate safety for agent-discovered EVENTS.
//
// Sibling of ./agent-prospects, which does the same job for businesses. The
// agent is expected to search before it creates, but the server is the final
// word: relying on a caller to remember a check is not a safety layer.
import { db, schema as s } from "@/db";
import { and, eq, gte, isNull, lt, notInArray, or, desc } from "drizzle-orm";
import { NON_OUTREACH_EVENT_TYPES } from "./taxonomy";
import { normalizeEventName, normalizeVenue } from "./agent-events";
import { addDays, todayISO } from "./dates";

// ---- bounds on stored research -------------------------------------------
// SQLite is not a document store. These keep one event's research to a few
// kilobytes; anything larger belongs wherever the agent does its own logging.
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_SOURCES = 10;
export const MAX_URL_LENGTH = 500;
export const MAX_LABEL_LENGTH = 120;
export const MAX_TEXT_LENGTH = 300;
export const MAX_CHANGELOG_ENTRIES = 50;
export const MAX_CHANGELOG_NOTE = 300;
/** Larger than the business cap (8000): an event accumulates a changeLog. */
export const MAX_RESEARCH_BYTES = 12000;
export const MAX_NAME_LENGTH = 200;
export const MAX_VENUE_LENGTH = 300;
export const MAX_EXPECTED_ATTENDEES = 10_000_000;

export const RESEARCH_CONFIDENCE = ["low", "medium", "high"] as const;

/**
 * How far ahead an event may be scheduled. The agent scans roughly six months
 * out; three years is far beyond any real listing and stops a parsing slip
 * ("2207") becoming a permanent calendar entry.
 */
export const MAX_YEARS_AHEAD = 3;

/**
 * Horizon for the undated-duplicate candidate set. An undated proposal is
 * compared against every same-city outreach event that is undated or still
 * ahead of us within this window.
 */
export const UNDATED_LOOKAHEAD_DAYS = 730;
/** Hard ceiling on that candidate set. Production holds 61 events in total. */
export const MAX_DUPLICATE_CANDIDATES = 500;

export type EventResearchPayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Small validators, shared by the fields below.
// ---------------------------------------------------------------------------
type Fail = { ok: false; error: string };
type Pass<T> = { ok: true; value: T };

function boundedString(v: unknown, path: string, max: number): Pass<string> | Fail {
  if (typeof v !== "string") return { ok: false, error: `${path} must be a string` };
  if (v.length > max) return { ok: false, error: `${path} exceeds ${max} characters` };
  return { ok: true, value: v };
}

/** ISO calendar date, and a real one — "2027-02-31" is rejected. */
export function isCalendarDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Accepts "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss" and returns
 * the storage form this schema uses everywhere: "YYYY-MM-DDTHH:mm:ss".
 *
 * A date with no time becomes T00:00:00 rather than being stored bare. Bare
 * dates would be parsed as UTC midnight by `new Date()` in fmtDateTime and
 * render as the PREVIOUS day on a UTC-6 host — the same local-vs-UTC trap the
 * README already records for run ages.
 */
export function normalizeStartsAt(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, date, hh, mm, ss] = m;
  if (!isCalendarDate(date)) return null;
  if (hh === undefined) return `${date}T00:00:00`;
  const h = Number(hh), mi = Number(mm), sec = Number(ss ?? "00");
  if (h > 23 || mi > 59 || sec > 59) return null;
  return `${date}T${hh}:${mm}:${ss ?? "00"}`;
}

/**
 * Validate the research blob.
 *
 * Storage only — this deliberately knows nothing about what makes an event a
 * good opportunity or how a score is reached. That reasoning lives in the
 * future agent, not in the CRM.
 *
 * Unknown keys are DROPPED rather than rejected: the agent brain is still being
 * designed, and a field it invents should not fail the whole write. What is
 * kept is bounded; what is not recognised never reaches the database.
 */
export function validateEventResearch(raw: unknown): Pass<EventResearchPayload> | Fail {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "aiResearch must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  const out: EventResearchPayload = {};
  const set = (k: string, res: Pass<unknown> | Fail): Fail | null => {
    if (!res.ok) return res;
    out[k] = res.value;
    return null;
  };

  if (r.summary != null) {
    const e = set("summary", boundedString(r.summary, "aiResearch.summary", MAX_SUMMARY_LENGTH));
    if (e) return e;
  }
  if (r.confidence != null) {
    if (typeof r.confidence !== "string" || !(RESEARCH_CONFIDENCE as readonly string[]).includes(r.confidence)) {
      return { ok: false, error: `aiResearch.confidence must be one of: ${RESEARCH_CONFIDENCE.join(", ")}` };
    }
    out.confidence = r.confidence;
  }
  // Free-text descriptors. Deliberately not enum-constrained: the agent brain
  // that will fill these does not exist yet, and guessing its vocabulary now
  // would reject real data. Bounded in length, which is the part that matters.
  for (const k of ["organizer", "organizerContact", "vendorStatus", "vendorCost"] as const) {
    if (r[k] != null) {
      const e = set(k, boundedString(r[k], `aiResearch.${k}`, MAX_TEXT_LENGTH));
      if (e) return e;
    }
  }
  for (const k of ["researchedAt", "model"] as const) {
    if (r[k] != null) {
      const e = set(k, boundedString(r[k], `aiResearch.${k}`, MAX_LABEL_LENGTH));
      if (e) return e;
    }
  }
  if (r.estimatedAttendance != null) {
    const v = r.estimatedAttendance;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_EXPECTED_ATTENDEES) {
      return { ok: false, error: `aiResearch.estimatedAttendance must be an integer 0-${MAX_EXPECTED_ATTENDEES}` };
    }
    out.estimatedAttendance = v;
  }
  if (r.potential != null) {
    const p = r.potential;
    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      return { ok: false, error: "aiResearch.potential must be a JSON object" };
    }
    const kept: Record<string, string | number> = {};
    for (const k of ["patient", "employer", "brand"] as const) {
      const v = (p as Record<string, unknown>)[k];
      if (v == null) continue;
      if (typeof v === "number") {
        if (!Number.isInteger(v) || v < 0 || v > 100) {
          return { ok: false, error: `aiResearch.potential.${k} must be an integer 0-100` };
        }
        kept[k] = v;
      } else {
        const res = boundedString(v, `aiResearch.potential.${k}`, MAX_LABEL_LENGTH);
        if (!res.ok) return res;
        kept[k] = res.value;
      }
    }
    out.potential = kept;
  }
  if (r.sources != null) {
    if (!Array.isArray(r.sources)) return { ok: false, error: "aiResearch.sources must be an array" };
    if (r.sources.length > MAX_SOURCES) {
      return { ok: false, error: `aiResearch.sources exceeds ${MAX_SOURCES} entries` };
    }
    const sources: { url: string; label?: string }[] = [];
    for (const [i, src] of r.sources.entries()) {
      if (src === null || typeof src !== "object" || Array.isArray(src)) {
        return { ok: false, error: `aiResearch.sources[${i}] must be an object` };
      }
      const sv = src as Record<string, unknown>;
      if (typeof sv.url !== "string" || !sv.url.trim()) {
        return { ok: false, error: `aiResearch.sources[${i}].url is required` };
      }
      if (sv.url.length > MAX_URL_LENGTH) {
        return { ok: false, error: `aiResearch.sources[${i}].url exceeds ${MAX_URL_LENGTH} characters` };
      }
      // http/https only: a stored javascript: or data: URL would eventually be
      // rendered as a link on the review screen.
      if (!/^https?:\/\//i.test(sv.url)) {
        return { ok: false, error: `aiResearch.sources[${i}].url must be http or https` };
      }
      const entry: { url: string; label?: string } = { url: sv.url };
      if (sv.label != null) {
        const res = boundedString(sv.label, `aiResearch.sources[${i}].label`, MAX_LABEL_LENGTH);
        if (!res.ok) return res;
        entry.label = res.value;
      }
      sources.push(entry);
    }
    out.sources = sources;
  }
  // Shape is fixed now even though nothing writes it until E4, so the first
  // change-detection write cannot invent a different one.
  if (r.changeLog != null) {
    if (!Array.isArray(r.changeLog)) return { ok: false, error: "aiResearch.changeLog must be an array" };
    if (r.changeLog.length > MAX_CHANGELOG_ENTRIES) {
      return { ok: false, error: `aiResearch.changeLog exceeds ${MAX_CHANGELOG_ENTRIES} entries` };
    }
    const log: { at: string; note: string; source?: string }[] = [];
    for (const [i, raw2] of r.changeLog.entries()) {
      if (raw2 === null || typeof raw2 !== "object" || Array.isArray(raw2)) {
        return { ok: false, error: `aiResearch.changeLog[${i}] must be an object` };
      }
      const c = raw2 as Record<string, unknown>;
      const at = boundedString(c.at ?? "", `aiResearch.changeLog[${i}].at`, MAX_LABEL_LENGTH);
      if (!at.ok) return at;
      const note = boundedString(c.note ?? "", `aiResearch.changeLog[${i}].note`, MAX_CHANGELOG_NOTE);
      if (!note.ok) return note;
      const entry: { at: string; note: string; source?: string } = { at: at.value, note: note.value };
      if (c.source != null) {
        const src = boundedString(c.source, `aiResearch.changeLog[${i}].source`, MAX_URL_LENGTH);
        if (!src.ok) return src;
        if (!/^https?:\/\//i.test(src.value)) {
          return { ok: false, error: `aiResearch.changeLog[${i}].source must be http or https` };
        }
        entry.source = src.value;
      }
      log.push(entry);
    }
    out.changeLog = log;
  }

  const serialized = JSON.stringify(out);
  if (serialized.length > MAX_RESEARCH_BYTES) {
    return { ok: false, error: `aiResearch exceeds ${MAX_RESEARCH_BYTES} bytes when stored` };
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Material developments
// ---------------------------------------------------------------------------

/**
 * The kinds of change that justify asking a person to look again.
 *
 * A closed vocabulary, unlike the free-text research fields, because this list
 * is what the New Developments surface is built on. If the agent could invent
 * kinds, "summary refreshed" would eventually appear beside "registration
 * opened" and the surface would stop meaning anything.
 *
 * Everything here changes whether or how Illumin8 can PARTICIPATE, or changes
 * the value of participating by a lot. Reconfirming a known date, tidying a
 * summary, or finding one more source that says the same thing does not belong
 * — those are ordinary `researched` refreshes.
 */
export const DEVELOPMENT_KINDS = [
  "vendor_registration_opened",
  "sponsorship_opened",
  "booth_pricing_published",
  "application_deadline_announced",
  "application_deadline_changed",
  "organizer_identified",
  "event_date_changed",
  "audience_information_published",
  "attendance_estimate_changed",
  "event_expanded",
  "event_reopened",
  "event_cancelled",
  "cancellation_reversed",
  "participation_rules_changed",
  "employer_component_announced",
] as const;
export type DevelopmentKind = (typeof DEVELOPMENT_KINDS)[number];

export const MAX_DEVELOPMENT_DETAIL = 300;

export type Development = {
  kind: DevelopmentKind;
  detail: string;
  occurredAt?: string;
  sources?: { url: string; label?: string }[];
};

export function validateDevelopment(raw: unknown): Pass<Development> | Fail {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "development must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !(DEVELOPMENT_KINDS as readonly string[]).includes(r.kind)) {
    return { ok: false, error: `development.kind must be one of: ${DEVELOPMENT_KINDS.join(", ")}` };
  }
  const detail = boundedString(r.detail ?? "", "development.detail", MAX_DEVELOPMENT_DETAIL);
  if (!detail.ok) return detail;
  if (!detail.value.trim()) {
    return { ok: false, error: "development.detail is required — say what actually changed" };
  }
  const out: Development = { kind: r.kind as DevelopmentKind, detail: detail.value.trim() };

  if (r.occurredAt != null) {
    if (typeof r.occurredAt !== "string" || !isCalendarDate(r.occurredAt.trim())) {
      return { ok: false, error: "development.occurredAt must be a calendar date, YYYY-MM-DD" };
    }
    out.occurredAt = r.occurredAt.trim();
  }
  if (r.sources != null) {
    if (!Array.isArray(r.sources)) return { ok: false, error: "development.sources must be an array" };
    if (r.sources.length > MAX_SOURCES) {
      return { ok: false, error: `development.sources exceeds ${MAX_SOURCES} entries` };
    }
    const sources: { url: string; label?: string }[] = [];
    for (const [i, src] of r.sources.entries()) {
      if (src === null || typeof src !== "object" || Array.isArray(src)) {
        return { ok: false, error: `development.sources[${i}] must be an object` };
      }
      const sv = src as Record<string, unknown>;
      if (typeof sv.url !== "string" || !/^https?:\/\//i.test(sv.url)) {
        return { ok: false, error: `development.sources[${i}].url must be http or https` };
      }
      if (sv.url.length > MAX_URL_LENGTH) {
        return { ok: false, error: `development.sources[${i}].url exceeds ${MAX_URL_LENGTH} characters` };
      }
      const entry: { url: string; label?: string } = { url: sv.url };
      if (sv.label != null) {
        const lbl = boundedString(sv.label, `development.sources[${i}].label`, MAX_LABEL_LENGTH);
        if (!lbl.ok) return lbl;
        entry.label = lbl.value;
      }
      sources.push(entry);
    }
    out.sources = sources;
  }
  return { ok: true, value: out };
}

/**
 * A short, stable prefix identifying one development, used both as the leading
 * token of the ledger detail line and as the de-duplication key within a run.
 *
 * Kind plus a normalized slice of the detail: reporting the same kind with the
 * same wording twice in one run is the noise worth suppressing, while the same
 * kind with genuinely different detail ("pricing published" then "pricing
 * changed again") still gets through.
 */
export function developmentFingerprint(d: Development): string {
  const slug = d.detail.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
  return `[${d.kind}:${slug}]`;
}

/**
 * Merge incoming research over stored research WITHOUT losing change history.
 *
 * The stored changeLog is authoritative and append-only through this path. An
 * incoming payload may add entries but can never shorten or rewrite the log:
 * the external agent is not trusted to echo months of accumulated history back
 * perfectly on every call, and one forgetful payload must not erase it.
 *
 * Everything else in the research blob IS replaced by the incoming values —
 * summary, confidence, sources and the rest are a current snapshot, and that is
 * what a refresh means.
 */
export function mergeChangeLog(input: {
  stored: string | null;
  incoming: Record<string, unknown> | null;
  development: Development | null;
}): { ok: true; json: string; entryCount: number } | Fail {
  let storedObj: Record<string, unknown> = {};
  try { if (input.stored) storedObj = JSON.parse(input.stored) as Record<string, unknown>; } catch { storedObj = {}; }

  const storedLog = Array.isArray(storedObj.changeLog)
    ? (storedObj.changeLog as { at?: unknown; note?: unknown; source?: unknown }[])
        .filter((e) => e && typeof e === "object" && typeof e.note === "string")
        .map((e) => ({
          at: typeof e.at === "string" ? e.at : "",
          note: e.note as string,
          ...(typeof e.source === "string" ? { source: e.source } : {}),
        }))
    : [];

  // Start from the incoming snapshot when there is one, otherwise keep what is
  // stored. Either way the log below is rebuilt from the stored history.
  const base: Record<string, unknown> = input.incoming
    ? { ...input.incoming }
    : { ...storedObj };
  delete base.changeLog;

  const log = [...storedLog];

  // An incoming payload may propose entries; only ones not already present are
  // added, matched on note text so a re-sent history is idempotent.
  if (input.incoming && Array.isArray(input.incoming.changeLog)) {
    for (const e of input.incoming.changeLog as { at?: string; note?: string; source?: string }[]) {
      if (!e?.note) continue;
      if (log.some((x) => x.note === e.note)) continue;
      log.push({ at: e.at ?? "", note: e.note, ...(e.source ? { source: e.source } : {}) });
    }
  }

  if (input.development) {
    const note = `${input.development.kind}: ${input.development.detail}`;
    if (!log.some((x) => x.note === note)) {
      log.push({
        at: input.development.occurredAt ?? new Date().toISOString().slice(0, 10),
        note,
        ...(input.development.sources?.[0]?.url ? { source: input.development.sources[0].url } : {}),
      });
    }
  }

  // Oldest entries fall off first if the log outgrows its bound — recent
  // developments are the ones a person acts on.
  const trimmed = log.slice(-MAX_CHANGELOG_ENTRIES);
  const out = trimmed.length ? { ...base, changeLog: trimmed } : base;

  const json = JSON.stringify(out);
  if (json.length > MAX_RESEARCH_BYTES) {
    return { ok: false, error: `aiResearch exceeds ${MAX_RESEARCH_BYTES} bytes when stored (changeLog has ${trimmed.length} entries)` };
  }
  return { ok: true, json, entryCount: trimmed.length };
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export type EventDuplicateHit = {
  duplicateOf: number;
  matchedOn: ("name" | "date" | "undated")[];
  existing: {
    id: number; name: string; normalizedName: string; type: string; status: string;
    startsAt: string | null; locationText: string | null;
    applicationDeadline: string | null; aiReviewStatus: string | null;
  };
};

export type VenueCollision = { eventId: number; name: string };

type Candidate = {
  id: number; name: string; type: string; status: string;
  startsAt: string | null; locationText: string | null;
  applicationDeadline: string | null; aiReviewStatus: string | null;
};

const CANDIDATE_FIELDS = {
  id: s.events.id, name: s.events.name, type: s.events.type, status: s.events.status,
  startsAt: s.events.startsAt, locationText: s.events.locationText,
  applicationDeadline: s.events.applicationDeadline, aiReviewStatus: s.events.aiReviewStatus,
} as const;

/**
 * Events that could plausibly be the one being proposed.
 *
 * DATED proposal: same city, outreach types, starting within ±1 calendar day —
 * one day of slack because two sources routinely disagree about the date of a
 * multi-day expo. Existing UNDATED events are included too, which the spec did
 * not require: without them, proposing "NM Wellness Expo" with a date would
 * happily duplicate the undated row the agent itself created last week.
 *
 * UNDATED proposal: same city, outreach types, and either undated or still
 * ahead of us inside the lookahead window. A past event cannot be the thing an
 * undated future opportunity refers to.
 *
 * Both are capped. Names are compared in application code afterwards, because
 * `LIKE` cannot see that "Health & Wellness" and "Health and Wellness" are the
 * same event — which is the whole reason normalization exists.
 */
async function duplicateCandidates(cityId: number, startsAt: string | null): Promise<Candidate[]> {
  const outreachOnly = notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]);

  const window = startsAt
    ? or(
        and(
          gte(s.events.startsAt, addDays(startsAt.slice(0, 10), -1)),
          lt(s.events.startsAt, addDays(startsAt.slice(0, 10), 1) + "T99"),
        )!,
        isNull(s.events.startsAt),
      )!
    : or(
        isNull(s.events.startsAt),
        and(
          gte(s.events.startsAt, todayISO()),
          lt(s.events.startsAt, addDays(todayISO(), UNDATED_LOOKAHEAD_DAYS) + "T99"),
        )!,
      )!;

  return db
    .select(CANDIDATE_FIELDS)
    .from(s.events)
    .where(and(eq(s.events.cityId, cityId), outreachOnly, window))
    .orderBy(desc(s.events.id))
    .limit(MAX_DUPLICATE_CANDIDATES);
}

/**
 * Hard-stop duplicate check, within one city.
 *
 * The rule is exact equality of NORMALIZED names. Nothing fuzzy: two titles
 * either reduce to the same string or they do not, which a person can check by
 * hand and a test can pin down.
 *
 * A venue match is NOT a duplicate and never blocks — Expo New Mexico hosts
 * dozens of unrelated events a year. It is returned as a soft signal only.
 */
export async function findEventDuplicate(
  cityId: number,
  input: { name: string; startsAt: string | null; locationText?: string | null }
): Promise<{ duplicate: EventDuplicateHit | null; venueCollision: VenueCollision | null; candidatesChecked: number }> {
  const proposed = normalizeEventName(input.name);
  if (!proposed) return { duplicate: null, venueCollision: null, candidatesChecked: 0 };

  const candidates = await duplicateCandidates(cityId, input.startsAt);
  const proposedVenue = input.locationText ? normalizeVenue(input.locationText) : null;

  let venueCollision: VenueCollision | null = null;
  for (const c of candidates) {
    const normalizedName = normalizeEventName(c.name);
    if (normalizedName === proposed) {
      const matchedOn: EventDuplicateHit["matchedOn"] = ["name"];
      if (c.startsAt === null) matchedOn.push("undated");
      else if (input.startsAt) matchedOn.push("date");
      return {
        duplicate: { duplicateOf: c.id, matchedOn, existing: { ...c, normalizedName } },
        venueCollision: null,
        candidatesChecked: candidates.length,
      };
    }
    // Same room, different event. Recorded, never enforced.
    if (!venueCollision && proposedVenue && c.locationText
        && normalizeVenue(c.locationText) === proposedVenue) {
      venueCollision = { eventId: c.id, name: c.name };
    }
  }

  return { duplicate: null, venueCollision, candidatesChecked: candidates.length };
}
