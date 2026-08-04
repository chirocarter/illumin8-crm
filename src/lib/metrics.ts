// Deterministic metric engine. Each metric = one readable SQL query + the
// drill-down URL that opens the exact filtered records behind the number.
// No AI, no estimates: if the number is on screen, the list is one click away.
import { db, schema as s } from "@/db";
import { and, count, countDistinct, eq, gte, inArray, isNotNull, lt, notInArray, sql, sum, type SQL } from "drizzle-orm";
import {
  CONTACT_ACTIVITY_TYPES, IN_PERSON_ACTIVITY_TYPES, PARTNERSHIP_CONVO_OUTCOMES,
  OPEN_STAGES, NON_OUTREACH_EVENT_TYPES, MEETING_EVENT_TYPES,
} from "./taxonomy";
import { followUpCondition } from "./followups";
import { todayISO } from "./dates";
import { scopeConds } from "./scope";

/**
 * Internal meetings and time-off are calendar entries, not outreach, so they
 * are excluded from Events Booked / Held / Screenings. Exported so the events
 * list applies the same exclusion and the drill-down matches the number.
 */
export function outreachEventsOnly(): SQL {
  return notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]);
}

/** Who/where a set of numbers covers. Omitted keys mean "everyone"/"everywhere". */
export type MetricScope = { cityId?: number | null; userId?: number | null };

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const str = p.toString();
  return str ? `?${str}` : "";
}

export type Metric = { key: string; label: string; value: number; href: string };

/** exclusive upper bound for a date-only range: activities store full datetimes */
function upper(to: string) {
  return to + "T99"; // lexicographically after any time on `to`… but ISO uses T23:59 max; "T99" > "T23", safe for string compare
}

async function one(q: Promise<{ c: number | string | null }[]>): Promise<number> {
  const rows = await q;
  return Number(rows[0]?.c ?? 0);
}

/**
 * All weekly activity/outcome metrics for a date range [from, to] (date-only, inclusive).
 * Used by the dashboard, the weekly reports, and goal progress — same numbers everywhere.
 */
export async function metricValues(
  from: string,
  to: string,
  scope: MetricScope = {},
  linkParams: Record<string, string | undefined> = {},
): Promise<Record<string, Metric>> {
  const a = s.activities;
  // Every query is narrowed the same way, so a metric and its drill-down list
  // are always describing the same rows.
  const inScope = (t: Parameters<typeof scopeConds>[0]) => scopeConds(t, scope);
  const dateRange = and(gte(a.occurredAt, from), lt(a.occurredAt, upper(to)), ...inScope(a));

  const act = (extra?: SQL) =>
    one(db.select({ c: count() }).from(a).where(extra ? and(dateRange, extra) : dateRange));

  const [
    businessesAdded, newLeads, businessesContacted, allActivities, inPersonVisits,
    phoneCalls, emails, followUps, partnershipConvos, dropBoxVisits,
    eventsBooked, meetingsBooked, eventsHeld, screenings, apptsBooked, apptsShowed, noShows, charged, collected,
    hoursWorked, labourCost, directSpend,
  ] = await Promise.all([
    one(db.select({ c: count() }).from(s.accounts).where(and(gte(s.accounts.createdAt, from), lt(s.accounts.createdAt, upper(to)), ...inScope(s.accounts)))),
    one(db.select({ c: count() }).from(s.leads).where(and(gte(s.leads.createdAt, from), lt(s.leads.createdAt, upper(to)), ...inScope(s.leads)))),
    one(db.select({ c: countDistinct(a.accountId) }).from(a).where(and(dateRange, inArray(a.type, [...CONTACT_ACTIVITY_TYPES]), isNotNull(a.accountId)))),
    act(),
    one(db.select({ c: count() }).from(a).where(and(dateRange, inArray(a.type, [...IN_PERSON_ACTIVITY_TYPES])))),
    one(db.select({ c: count() }).from(a).where(and(dateRange, inArray(a.type, ["Phone Call", "Voicemail"])))),
    act(eq(a.type, "Email")),
    act(followUpCondition()),
    one(db.select({ c: count() }).from(a).where(and(dateRange, inArray(a.outcome, [...PARTNERSHIP_CONVO_OUTCOMES])))),
    act(eq(a.type, "Drop Box Visit")),
    one(db.select({ c: count() }).from(s.events).where(and(gte(s.events.bookedAt, from), lt(s.events.bookedAt, upper(to)), ...inScope(s.events), outreachEventsOnly()))),
    // Meetings are counted separately so outreach event numbers stay honest.
    one(db.select({ c: count() }).from(s.events).where(and(gte(s.events.bookedAt, from), lt(s.events.bookedAt, upper(to)), ...inScope(s.events), inArray(s.events.type, [...MEETING_EVENT_TYPES])))),
    one(db.select({ c: count() }).from(s.events).where(and(inArray(s.events.status, ["Completed", "Follow-Up Needed"]), gte(s.events.startsAt, from), lt(s.events.startsAt, upper(to)), ...inScope(s.events), outreachEventsOnly()))),
    one(db.select({ c: sum(s.events.screeningsCompleted) }).from(s.events).where(and(inArray(s.events.status, ["Completed", "Follow-Up Needed"]), gte(s.events.startsAt, from), lt(s.events.startsAt, upper(to)), ...inScope(s.events), outreachEventsOnly()))),
    one(db.select({ c: count() }).from(s.appointments).where(and(gte(s.appointments.createdAt, from), lt(s.appointments.createdAt, upper(to)), ...inScope(s.appointments)))),
    one(db.select({ c: count() }).from(s.appointments).where(and(eq(s.appointments.status, "Showed"), gte(s.appointments.scheduledAt, from), lt(s.appointments.scheduledAt, upper(to)), ...inScope(s.appointments)))),
    one(db.select({ c: count() }).from(s.appointments).where(and(eq(s.appointments.status, "No-Show"), gte(s.appointments.scheduledAt, from), lt(s.appointments.scheduledAt, upper(to)), ...inScope(s.appointments)))),
    // Money charged & collected on appointments booked in the range (aligned with Appointments Booked)
    one(db.select({ c: sum(s.appointments.revenue) }).from(s.appointments).where(and(gte(s.appointments.createdAt, from), lt(s.appointments.createdAt, upper(to)), ...inScope(s.appointments)))),
    one(db.select({ c: sum(s.appointments.revenue) }).from(s.appointments).where(and(eq(s.appointments.collected, true), gte(s.appointments.createdAt, from), lt(s.appointments.createdAt, upper(to)), ...inScope(s.appointments)))),

    // ---- Marketing spend ----
    one(db.select({ c: sum(s.timeEntries.hours) }).from(s.timeEntries)
      .where(and(gte(s.timeEntries.workedOn, from), lt(s.timeEntries.workedOn, upper(to)), ...inScope(s.timeEntries)))),
    // Priced per person: each entry uses the rate of whoever logged it, so a
    // team with different rates totals correctly.
    one(db.select({ c: sql<number>`coalesce(sum(${s.timeEntries.hours} * coalesce(${s.users.hourlyRate}, 0)), 0)` })
      .from(s.timeEntries).leftJoin(s.users, eq(s.timeEntries.userId, s.users.id))
      .where(and(gte(s.timeEntries.workedOn, from), lt(s.timeEntries.workedOn, upper(to)), ...inScope(s.timeEntries)))),
    one(db.select({ c: sum(s.expenses.amount) }).from(s.expenses)
      .where(and(gte(s.expenses.spentOn, from), lt(s.expenses.spentOn, upper(to)), ...inScope(s.expenses)))),
  ]);

  // Spend is labour plus money out the door.
  const marketingSpend = labourCost + directSpend;

  // Carried into every drill-down so the list opens the same scope the number counted.
  const range = { from, to, ...linkParams };
  const m = (key: string, label: string, value: number, href: string): [string, Metric] =>
    [key, { key, label, value, href }];

  return Object.fromEntries([
    m("businesses_added", "Businesses Added", businessesAdded, `/accounts${qs({ createdFrom: from, createdTo: to, ...linkParams })}`),
    m("new_leads", "New Leads", newLeads, `/leads${qs(range)}`),
    m("businesses_contacted", "Businesses Contacted", businessesContacted, `/activities${qs({ ...range, typeGroup: "contact" })}`),
    m("all_activities", "Activities Logged", allActivities, `/activities${qs(range)}`),
    m("in_person_visits", "In-Person Visits", inPersonVisits, `/activities${qs({ ...range, typeGroup: "inperson" })}`),
    m("phone_calls", "Phone Calls", phoneCalls, `/activities${qs({ ...range, typeGroup: "phone" })}`),
    m("emails", "Emails", emails, `/activities${qs({ ...range, type: "Email" })}`),
    m("follow_ups_completed", "Follow-Ups Completed", followUps, `/activities${qs({ ...range, followups: "1" })}`),
    m("partnership_conversations", "Partnership Conversations", partnershipConvos, `/activities${qs({ ...range, outcomeGroup: "partnership" })}`),
    m("drop_box_visits", "Drop Box Visits", dropBoxVisits, `/activities${qs({ ...range, type: "Drop Box Visit" })}`),
    m("events_booked", "Events Booked", eventsBooked, `/events${qs({ bookedFrom: from, bookedTo: to, ...linkParams })}`),
    m("meetings_booked", "Meetings Booked", meetingsBooked, `/events${qs({ bookedFrom: from, bookedTo: to, meetings: "1", ...linkParams })}`),
    m("events_held", "Events Held", eventsHeld, `/events${qs({ heldFrom: from, heldTo: to, ...linkParams })}`),
    m("screenings_completed", "Screenings Completed", screenings, `/events${qs({ heldFrom: from, heldTo: to, ...linkParams })}`),
    m("appointments_booked", "Appointments Booked", apptsBooked, `/appointments${qs({ cfrom: from, cto: to, ...linkParams })}`),
    m("appointments_showed", "Appointments Showed", apptsShowed, `/appointments${qs({ ...range, status: "Showed" })}`),
    m("no_shows", "No-Shows", noShows, `/appointments${qs({ ...range, status: "No-Show" })}`),
    m("money_charged", "Money Charged", charged, `/appointments${qs({ cfrom: from, cto: to, ...linkParams })}`),
    m("money_collected", "Money Collected", collected, `/appointments${qs({ cfrom: from, cto: to, collected: "1", ...linkParams })}`),
    m("hours_worked", "Hours Worked", hoursWorked, `/spend${qs({ ...range })}`),
    m("labour_cost", "Cost of Hours", labourCost, `/spend${qs({ ...range })}`),
    m("direct_spend", "Direct Spend", directSpend, `/spend${qs({ ...range })}`),
    m("marketing_spend", "Marketing Spend", marketingSpend, `/spend${qs({ ...range })}`),
  ]);
}

/**
 * Marketing spend on its own, so the dashboard can show YOUR hours and YOUR
 * spend rather than the whole city's. Cheaper than a full metricValues() pass
 * when only these four numbers are needed.
 */
export async function spendFor(from: string, to: string, scope: MetricScope = {}) {
  const inScope = (t: Parameters<typeof scopeConds>[0]) => scopeConds(t, scope);
  const [hours, labour, direct] = await Promise.all([
    one(db.select({ c: sum(s.timeEntries.hours) }).from(s.timeEntries)
      .where(and(gte(s.timeEntries.workedOn, from), lt(s.timeEntries.workedOn, upper(to)), ...inScope(s.timeEntries)))),
    one(db.select({ c: sql<number>`coalesce(sum(${s.timeEntries.hours} * coalesce(${s.users.hourlyRate}, 0)), 0)` })
      .from(s.timeEntries).leftJoin(s.users, eq(s.timeEntries.userId, s.users.id))
      .where(and(gte(s.timeEntries.workedOn, from), lt(s.timeEntries.workedOn, upper(to)), ...inScope(s.timeEntries)))),
    one(db.select({ c: sum(s.expenses.amount) }).from(s.expenses)
      .where(and(gte(s.expenses.spentOn, from), lt(s.expenses.spentOn, upper(to)), ...inScope(s.expenses)))),
  ]);
  return { hours, labour, direct, total: labour + direct };
}

/** Counts that aren't week-bound: used on the dashboard header cards. */
export async function pulseCounts(scope: MetricScope = {}, linkParams: Record<string, string | undefined> = {}) {
  const today = todayISO();
  const inScope = (t: Parameters<typeof scopeConds>[0]) => scopeConds(t, scope);
  const [dueToday, overdue, activeOpps] = await Promise.all([
    one(db.select({ c: count() }).from(s.tasks).where(and(eq(s.tasks.status, "Open"), gte(s.tasks.dueDate, today), lt(s.tasks.dueDate, upper(today)), ...inScope(s.tasks)))),
    one(db.select({ c: count() }).from(s.tasks).where(and(eq(s.tasks.status, "Open"), lt(s.tasks.dueDate, today), ...inScope(s.tasks)))),
    one(db.select({ c: count() }).from(s.opportunities).where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), ...inScope(s.opportunities)))),
  ]);
  return {
    dueToday: { value: dueToday, href: `/tasks${qs({ due: "today", ...linkParams })}` },
    overdue: { value: overdue, href: `/tasks${qs({ due: "overdue", ...linkParams })}` },
    activeOpps: { value: activeOpps, href: `/opportunities${qs({ open: "1", ...linkParams })}` },
  };
}

