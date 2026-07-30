// The pipeline is DERIVED, not maintained.
//
// It used to read the `opportunities` table, which had to be filled in by hand.
// Nobody did: 37 businesses had been contacted and 4 had booked events, but only
// 5 opportunity records existed, so the board sat empty while real work piled up
// elsewhere. Now a business's stage is computed from what is actually recorded —
// its events, its activity outcomes, and its status — so logging a call that
// books an event moves that business up the board on its own.
import { db, schema as s } from "@/db";
import { and, desc, eq, inArray, isNotNull, ne, notInArray, type SQL } from "drizzle-orm";
import { NON_OUTREACH_EVENT_TYPES } from "./taxonomy";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

// Scoping is inlined rather than imported from ./scope, which pulls in
// server-only code and would make this module untestable from a plain script.
type Owned = { cityId: SQLiteColumn; userId: SQLiteColumn };
function narrow(t: Owned, scope: { cityId?: number | null; userId?: number | null }): SQL[] {
  const conds: SQL[] = [];
  if (scope.cityId) conds.push(eq(t.cityId, scope.cityId));
  if (scope.userId) conds.push(eq(t.userId, scope.userId));
  return conds;
}

/** Board columns, left to right. */
export const PIPELINE_STAGES = [
  "Prospect", "Contacted", "Interested", "Meeting Booked",
  "Event Booked", "Event Completed", "Partner",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type PipelineCard = {
  accountId: number;
  name: string;
  stage: PipelineStage;
  /** the record that put it in this stage — shown on the card */
  reason: string;
  nextFollowUpAt: string | null;
  overdue: boolean;
  lastContactedAt: string | null;
};

/** Statuses that mean "stop working this" — kept off the board entirely. */
const CLOSED_STATUSES = ["Not a Fit", "Do Not Contact"];

/** Outcomes that show real interest, in ascending order of commitment. */
const INTEREST_OUTCOMES = ["Interested", "Discussed Partnership", "Needs Materials", "Reached Decision Maker"];

export async function pipelineCards(
  scope: { cityId?: number | null; userId?: number | null },
  today: string,
): Promise<PipelineCard[]> {
  const inScope = (t: Owned) => narrow(t, scope);

  const [accounts, events, activities] = await Promise.all([
    db.select({
      id: s.accounts.id, name: s.accounts.name, status: s.accounts.status,
      nextFollowUpAt: s.accounts.nextFollowUpAt, lastContactedAt: s.accounts.lastContactedAt,
    }).from(s.accounts).where(and(notInArray(s.accounts.status, CLOSED_STATUSES), ...inScope(s.accounts))),

    // Meetings and time-off are calendar entries, not outreach events, so they
    // must not push a business into an event stage.
    db.select({
      accountId: s.events.accountId, name: s.events.name,
      status: s.events.status, type: s.events.type, startsAt: s.events.startsAt,
    }).from(s.events).where(and(
      isNotNull(s.events.accountId),
      notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]),
      ...inScope(s.events),
    )),

    db.select({
      accountId: s.activities.accountId, outcome: s.activities.outcome,
      occurredAt: s.activities.occurredAt, type: s.activities.type,
    }).from(s.activities)
      .where(and(isNotNull(s.activities.accountId), ...inScope(s.activities)))
      .orderBy(desc(s.activities.occurredAt)),
  ]);

  const eventsFor = new Map<number, typeof events>();
  for (const e of events) {
    const k = e.accountId!;
    eventsFor.set(k, [...(eventsFor.get(k) ?? []), e]);
  }
  const actsFor = new Map<number, typeof activities>();
  for (const a of activities) {
    const k = a.accountId!;
    actsFor.set(k, [...(actsFor.get(k) ?? []), a]);
  }

  const cards: PipelineCard[] = [];
  for (const acct of accounts) {
    const evs = eventsFor.get(acct.id) ?? [];
    const acts = actsFor.get(acct.id) ?? [];

    let stage: PipelineStage = "Prospect";
    let reason = "No contact yet";

    // Weakest evidence first; each stronger signal overwrites it.
    if (acts.length > 0) {
      stage = "Contacted";
      const latest = acts[0];
      reason = `${latest.type}${latest.outcome ? ` · ${latest.outcome}` : ""}`;
    }
    if (acts.some((a) => a.outcome && INTEREST_OUTCOMES.includes(a.outcome))) {
      stage = "Interested";
      const hit = acts.find((a) => a.outcome && INTEREST_OUTCOMES.includes(a.outcome))!;
      reason = hit.outcome!;
    }
    if (acts.some((a) => a.outcome === "Booked Meeting")) {
      stage = "Meeting Booked";
      reason = "Meeting booked";
    }
    const completed = evs.filter((e) => ["Completed", "Follow-Up Needed"].includes(e.status));
    const upcoming = evs.filter((e) => ["Booked", "Confirmed", "Date Pending", "Planning"].includes(e.status));
    if (upcoming.length) {
      stage = "Event Booked";
      reason = upcoming[0].name;
    }
    if (completed.length) {
      stage = "Event Completed";
      reason = completed[0].name;
    }
    // An explicit partner status is the strongest signal of all.
    if (["Active Partner", "Converted"].includes(acct.status)) {
      stage = "Partner";
      reason = acct.status;
    }

    cards.push({
      accountId: acct.id,
      name: acct.name,
      stage,
      reason,
      nextFollowUpAt: acct.nextFollowUpAt,
      overdue: !!acct.nextFollowUpAt && acct.nextFollowUpAt < today,
      lastContactedAt: acct.lastContactedAt,
    });
  }

  return cards;
}
