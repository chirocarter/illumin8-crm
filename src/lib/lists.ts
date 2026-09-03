// Shared, URL-driven list queries. Every list page AND its CSV export run
// through these builders, so a drill-down link, the page it opens, and the
// exported file always agree.
import { db, schema as s } from "@/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, or, sql, type SQL, type Column } from "drizzle-orm";
import {
  CONTACT_ACTIVITY_TYPES, IN_PERSON_ACTIVITY_TYPES, PARTNERSHIP_CONVO_OUTCOMES, OPEN_STAGES,
  INFLUENCE_LEVELS, RELATIONSHIP_STRENGTHS, RELATIONSHIP_STATUSES, INTEREST_LEVELS,
  LEAD_APPT_STATUSES, APPOINTMENT_STATUSES, ACCOUNT_STATUSES, OPPORTUNITY_STAGES, EVENT_STATUSES,
  REPORTING_CALL_TYPES,
} from "./taxonomy";
import { todayISO, addDays, nowISO } from "./dates";
import { listScope, scopeConds } from "./scope";
import { followUpCondition } from "./followups";
import { meetingsOnly, outreachEventsOnly } from "./metrics";

export type SP = Record<string, string | string[] | undefined>;

/**
 * Starting conditions for every list: the active city, so one market's records
 * never appear while working in another. A drill-down from a wider stats scope
 * (org-wide, or one person) passes `?scope=`/`?who=` and is honoured here, so
 * the list always matches the number that opened it.
 */
async function scopeStart(sp: SP, t: Parameters<typeof scopeConds>[0]): Promise<SQL[]> {
  return scopeConds(t, await listScope(sp));
}

export function spStr(sp: SP, key: string): string | undefined {
  const v = sp[key];
  const str = Array.isArray(v) ? v[0] : v;
  return str && str.length > 0 ? str : undefined;
}

/**
 * All values for a repeatable param — `?status=Interested&status=Nurture`.
 * Multi-select filters use this so you can show several statuses at once
 * instead of one at a time.
 */
export function spAll(sp: SP, key: string): string[] {
  const v = sp[key];
  const list = Array.isArray(v) ? v : v ? [v] : [];
  // A single value may also arrive comma-joined from a link.
  return list.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
}
function spNum(sp: SP, key: string): number | undefined {
  const v = spStr(sp, key);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The page you're looking at right now, filters and all, for a form's `returnTo`.
 *
 * Acting on a row — ticking a task done, changing a status — has to land you
 * back on the same filtered view. Redirecting to the bare list instead throws
 * away the tab you were working through, which reads as being kicked out of it.
 *
 * Repeated params are kept repeated: `?status=A&status=B` must survive as both.
 */
export function currentUrl(path: string, sp: SP): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v ? [v] : []) {
      if (one) p.append(k, one);
    }
  }
  const q = p.toString();
  return q ? `${path}?${q}` : path;
}
/** exclusive upper bound for date-only params against datetime columns */
const up = (to: string) => to + "T99";

const LIMIT = 500;

// ---------- Sorting ----------
// Clicking a column header sets ?sort=<key>&dir=<asc|desc>. Each list whitelists
// its sortable keys (so nothing arbitrary reaches SQL) and the same builder feeds
// both the page and the CSV export, so a sorted view exports in that order too.
type Dir = "asc" | "desc";
type SortMap = Record<string, (dir: Dir) => SQL[]>;
const dirFn = (dir: Dir) => (dir === "desc" ? desc : asc);

/** Case-insensitive text sort, NULLs always last. */
function byText(col: Column, dir: Dir): SQL[] {
  return [asc(sql`(${col} is null)`), dirFn(dir)(sql`lower(${col})`)];
}
/** Date/number sort, NULLs always last (so "soonest follow-up" ignores blanks). */
function byValue(col: Column, dir: Dir): SQL[] {
  return [asc(sql`(${col} is null)`), dirFn(dir)(col)];
}
/** Ordinal sort by a defined vocabulary order (e.g. Low→…→Decision Maker). */
function byOrder(col: Column, order: readonly string[], dir: Dir): SQL[] {
  let expr = sql`(case`;
  order.forEach((v, i) => { expr = sql`${expr} when ${col} = ${v} then ${i}`; });
  expr = sql`${expr} else ${order.length} end)`;
  return [dirFn(dir)(expr)];
}

function applySort(sp: SP, map: SortMap, fallback: SQL[]): SQL[] {
  const key = spStr(sp, "sort");
  const dir: Dir = spStr(sp, "dir") === "desc" ? "desc" : "asc";
  if (key && map[key]) return map[key](dir);
  return fallback;
}

// ---------- Accounts ----------
export async function listAccounts(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.accounts);
  const q = spStr(sp, "q");
  if (q) conds.push(like(s.accounts.name, `%${q}%`));
  // Status is multi-select: pick every status you want shown.
  const statuses = spAll(sp, "status");
  if (statuses.length) conds.push(inArray(s.accounts.status, statuses));
  const vertical = spStr(sp, "vertical");
  if (vertical) conds.push(eq(s.accounts.vertical, vertical));
  const area = spStr(sp, "area");
  if (area) conds.push(eq(s.accounts.area, area));
  const loc = spNum(sp, "locationId");
  if (loc) conds.push(eq(s.accounts.clinicLocationId, loc));
  const cf = spStr(sp, "createdFrom");
  if (cf) conds.push(gte(s.accounts.createdAt, cf));
  const ct = spStr(sp, "createdTo");
  if (ct) conds.push(lt(s.accounts.createdAt, up(ct)));
  if (spStr(sp, "followupOverdue")) {
    conds.push(and(isNotNull(s.accounts.nextFollowUpAt), lt(s.accounts.nextFollowUpAt, todayISO()))!);
  }
  // Businesses that became partners in a window — the drill-down behind
  // Partnerships Confirmed.
  const pf = spStr(sp, "partnerFrom");
  if (pf) conds.push(and(isNotNull(s.accounts.partnerSince), gte(s.accounts.partnerSince, pf))!);
  const pt = spStr(sp, "partnerTo");
  if (pt) conds.push(lt(s.accounts.partnerSince, up(pt)));

  return db
    .select({
      id: s.accounts.id, name: s.accounts.name, vertical: s.accounts.vertical,
      area: s.accounts.area, status: s.accounts.status, phone: s.accounts.phone,
      source: s.accounts.source, relationshipStrength: s.accounts.relationshipStrength,
      lastContactedAt: s.accounts.lastContactedAt, nextFollowUpAt: s.accounts.nextFollowUpAt,
      createdAt: s.accounts.createdAt, doNotContact: s.accounts.doNotContact,
    })
    .from(s.accounts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      name: (d) => byText(s.accounts.name, d),
      vertical: (d) => byText(s.accounts.vertical, d),
      area: (d) => byText(s.accounts.area, d),
      status: (d) => byOrder(s.accounts.status, ACCOUNT_STATUSES, d),
      relationship: (d) => byOrder(s.accounts.relationshipStrength, RELATIONSHIP_STRENGTHS, d),
      lastContacted: (d) => byValue(s.accounts.lastContactedAt, d),
      followup: (d) => byValue(s.accounts.nextFollowUpAt, d),
    }, [asc(s.accounts.name)]))
    .limit(LIMIT);
}

// ---------- Contacts ----------
export async function listContacts(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.contacts);
  const q = spStr(sp, "q");
  if (q) conds.push(or(like(s.contacts.firstName, `%${q}%`), like(s.contacts.lastName, `%${q}%`))!);
  const accountId = spNum(sp, "accountId");
  if (accountId) conds.push(eq(s.contacts.accountId, accountId));
  const type = spStr(sp, "contactType");
  if (type) conds.push(eq(s.contacts.contactType, type));
  const cf = spStr(sp, "createdFrom");
  if (cf) conds.push(gte(s.contacts.createdAt, cf));
  const ct = spStr(sp, "createdTo");
  if (ct) conds.push(lt(s.contacts.createdAt, up(ct)));

  return db
    .select({
      id: s.contacts.id, firstName: s.contacts.firstName, lastName: s.contacts.lastName,
      title: s.contacts.title, contactType: s.contacts.contactType, phone: s.contacts.phone,
      email: s.contacts.email, influenceLevel: s.contacts.influenceLevel,
      relationshipStatus: s.contacts.relationshipStatus, nextFollowUpAt: s.contacts.nextFollowUpAt,
      accountId: s.contacts.accountId, accountName: s.accounts.name,
    })
    .from(s.contacts)
    .leftJoin(s.accounts, eq(s.contacts.accountId, s.accounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      name: (d) => [dirFn(d)(sql`lower(${s.contacts.firstName})`), dirFn(d)(sql`lower(${s.contacts.lastName})`)],
      business: (d) => byText(s.accounts.name, d),
      type: (d) => byText(s.contacts.contactType, d),
      influence: (d) => byOrder(s.contacts.influenceLevel, INFLUENCE_LEVELS, d),
      relationship: (d) => byOrder(s.contacts.relationshipStatus, RELATIONSHIP_STATUSES, d),
      phone: (d) => byText(s.contacts.phone, d),
      followup: (d) => byValue(s.contacts.nextFollowUpAt, d),
    }, [asc(s.contacts.firstName)]))
    .limit(LIMIT);
}

// ---------- Activities ----------
export async function listActivities(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.activities);
  const from = spStr(sp, "from");
  if (from) conds.push(gte(s.activities.occurredAt, from));
  const to = spStr(sp, "to");
  if (to) conds.push(lt(s.activities.occurredAt, up(to)));
  const type = spStr(sp, "type");
  if (type) conds.push(eq(s.activities.type, type));
  const typeGroup = spStr(sp, "typeGroup");
  if (typeGroup === "contact") conds.push(inArray(s.activities.type, [...CONTACT_ACTIVITY_TYPES]));
  if (typeGroup === "inperson") conds.push(inArray(s.activities.type, [...IN_PERSON_ACTIVITY_TYPES]));
  if (typeGroup === "phone") conds.push(inArray(s.activities.type, ["Phone Call", "Voicemail"]));
  if (typeGroup === "reportingcalls") conds.push(inArray(s.activities.type, [...REPORTING_CALL_TYPES]));
  const outcome = spStr(sp, "outcome");
  if (outcome) conds.push(eq(s.activities.outcome, outcome));
  if (spStr(sp, "outcomeGroup") === "partnership") conds.push(inArray(s.activities.outcome, [...PARTNERSHIP_CONVO_OUTCOMES]));
  // Same derived rule the Follow-Ups Completed metric counts, so the number and
  // this list can never disagree.
  if (spStr(sp, "followups")) conds.push(followUpCondition());
  for (const key of ["accountId", "contactId", "leadId", "opportunityId", "eventId", "partnerId", "campaignId", "projectId"] as const) {
    const v = spNum(sp, key);
    if (v) conds.push(eq(s.activities[key], v));
  }

  return db
    .select({
      id: s.activities.id, type: s.activities.type, outcome: s.activities.outcome,
      occurredAt: s.activities.occurredAt, notes: s.activities.notes,
      nextFollowUpAt: s.activities.nextFollowUpAt,
      accountId: s.activities.accountId, accountName: s.accounts.name,
      contactId: s.activities.contactId, contactFirst: s.contacts.firstName, contactLast: s.contacts.lastName,
      leadId: s.activities.leadId, leadFirst: s.leads.firstName, leadLast: s.leads.lastName,
      opportunityId: s.activities.opportunityId, eventId: s.activities.eventId,
    })
    .from(s.activities)
    .leftJoin(s.accounts, eq(s.activities.accountId, s.accounts.id))
    .leftJoin(s.contacts, eq(s.activities.contactId, s.contacts.id))
    .leftJoin(s.leads, eq(s.activities.leadId, s.leads.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      when: (d) => byValue(s.activities.occurredAt, d),
      type: (d) => byText(s.activities.type, d),
      outcome: (d) => byText(s.activities.outcome, d),
      business: (d) => byText(s.accounts.name, d),
      contact: (d) => byText(s.contacts.firstName, d),
    }, [desc(s.activities.occurredAt)]))
    .limit(LIMIT);
}

// ---------- Opportunities ----------
export async function listOpportunities(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.opportunities);
  const stage = spStr(sp, "stage");
  if (stage) conds.push(eq(s.opportunities.stage, stage));
  const type = spStr(sp, "type");
  if (type) conds.push(eq(s.opportunities.type, type));
  if (spStr(sp, "open")) conds.push(inArray(s.opportunities.stage, [...OPEN_STAGES]));
  if (spStr(sp, "stale")) {
    // Stale = still open but stage hasn't moved in 14+ days
    conds.push(inArray(s.opportunities.stage, [...OPEN_STAGES]));
    conds.push(lt(s.opportunities.stageChangedAt, addDays(todayISO(), -14)));
  }
  const accountId = spNum(sp, "accountId");
  if (accountId) conds.push(eq(s.opportunities.accountId, accountId));
  const contactId = spNum(sp, "contactId");
  if (contactId) conds.push(eq(s.opportunities.contactId, contactId));
  const campaignId = spNum(sp, "campaignId");
  if (campaignId) conds.push(eq(s.opportunities.campaignId, campaignId));
  const loc = spNum(sp, "locationId");
  if (loc) conds.push(eq(s.opportunities.clinicLocationId, loc));
  const vertical = spStr(sp, "vertical");
  if (vertical) conds.push(eq(s.accounts.vertical, vertical));
  const cf = spStr(sp, "createdFrom");
  if (cf) conds.push(gte(s.opportunities.createdAt, cf));
  const ct = spStr(sp, "createdTo");
  if (ct) conds.push(lt(s.opportunities.createdAt, up(ct)));

  return db
    .select({
      id: s.opportunities.id, name: s.opportunities.name, type: s.opportunities.type,
      stage: s.opportunities.stage, expectedEventDate: s.opportunities.expectedEventDate,
      nextStep: s.opportunities.nextStep, nextFollowUpAt: s.opportunities.nextFollowUpAt,
      stageChangedAt: s.opportunities.stageChangedAt, createdAt: s.opportunities.createdAt,
      accountId: s.opportunities.accountId, accountName: s.accounts.name,
      vertical: s.accounts.vertical,
    })
    .from(s.opportunities)
    .leftJoin(s.accounts, eq(s.opportunities.accountId, s.accounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      name: (d) => byText(s.opportunities.name, d),
      business: (d) => byText(s.accounts.name, d),
      type: (d) => byText(s.opportunities.type, d),
      stage: (d) => byOrder(s.opportunities.stage, OPPORTUNITY_STAGES, d),
      eventDate: (d) => byValue(s.opportunities.expectedEventDate, d),
      followup: (d) => byValue(s.opportunities.nextFollowUpAt, d),
    }, [desc(s.opportunities.createdAt)]))
    .limit(LIMIT);
}

// ---------- Events ----------
export async function listEvents(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.events);
  const status = spStr(sp, "status");
  if (status) conds.push(eq(s.events.status, status));
  const type = spStr(sp, "type");
  if (type) conds.push(eq(s.events.type, type));
  const from = spStr(sp, "from");
  if (from) conds.push(gte(s.events.startsAt, from));
  const to = spStr(sp, "to");
  if (to) conds.push(lt(s.events.startsAt, up(to)));
  // Meetings and events are separate kinds and never counted together, so their
  // drill-downs have to split the same way or a number won't match its list.
  const meetingsView = !!spStr(sp, "meetings");
  if (meetingsView) {
    conds.push(meetingsOnly());
  } else if (spStr(sp, "bookedFrom") || spStr(sp, "bookedTo") || spStr(sp, "heldFrom") || spStr(sp, "heldTo")) {
    conds.push(outreachEventsOnly());
  }
  const bf = spStr(sp, "bookedFrom");
  if (bf) conds.push(gte(s.events.bookedAt, bf));
  const bt = spStr(sp, "bookedTo");
  if (bt) conds.push(lt(s.events.bookedAt, up(bt)));
  // "Held" = completed (or awaiting follow-up) with start date in range
  const hf = spStr(sp, "heldFrom");
  const ht = spStr(sp, "heldTo");
  if (hf || ht) {
    conds.push(inArray(s.events.status, ["Completed", "Follow-Up Needed"]));
    if (hf) conds.push(gte(s.events.startsAt, hf));
    if (ht) conds.push(lt(s.events.startsAt, up(ht)));
  }
  if (spStr(sp, "upcoming")) {
    conds.push(gte(s.events.startsAt, todayISO()));
    conds.push(inArray(s.events.status, ["Booked", "Confirmed", "Date Pending", "Planning"]));
  }
  // Past events still waiting on outcome entry
  if (spStr(sp, "needsOutcome")) {
    conds.push(inArray(s.events.status, ["Booked", "Confirmed"]));
    conds.push(isNotNull(s.events.startsAt));
    conds.push(lt(s.events.startsAt, nowISO()));
  }
  for (const key of ["accountId", "contactId", "opportunityId", "campaignId", "partnerId"] as const) {
    const v = spNum(sp, key);
    if (v) conds.push(eq(s.events[key], v));
  }
  const loc = spNum(sp, "locationId");
  if (loc) conds.push(eq(s.events.clinicLocationId, loc));

  return db
    .select({
      id: s.events.id, name: s.events.name, type: s.events.type, status: s.events.status,
      startsAt: s.events.startsAt, bookedAt: s.events.bookedAt,
      expectedAttendees: s.events.expectedAttendees, actualAttendees: s.events.actualAttendees,
      screeningsCompleted: s.events.screeningsCompleted, revenue: s.events.revenue,
      followUpRequired: s.events.followUpRequired, followUpDueAt: s.events.followUpDueAt,
      accountId: s.events.accountId, accountName: s.accounts.name,
      locationText: s.events.locationText,
    })
    .from(s.events)
    .leftJoin(s.accounts, eq(s.events.accountId, s.accounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      name: (d) => byText(s.events.name, d),
      type: (d) => byText(s.events.type, d),
      host: (d) => byText(s.accounts.name, d),
      date: (d) => byValue(s.events.startsAt, d),
      status: (d) => byOrder(s.events.status, EVENT_STATUSES, d),
      attendees: (d) => byValue(s.events.actualAttendees, d),
      screenings: (d) => byValue(s.events.screeningsCompleted, d),
    }, [desc(s.events.startsAt)]))
    .limit(LIMIT);
}

// ---------- Leads ----------
export async function listLeads(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.leads);
  const from = spStr(sp, "from");
  if (from) conds.push(gte(s.leads.createdAt, from));
  const to = spStr(sp, "to");
  if (to) conds.push(lt(s.leads.createdAt, up(to)));
  const source = spStr(sp, "source");
  if (source) conds.push(eq(s.leads.source, source));
  const apptStatus = spStr(sp, "apptStatus");
  if (apptStatus) conds.push(eq(s.leads.apptStatus, apptStatus));
  const interest = spStr(sp, "interest");
  if (interest) conds.push(eq(s.leads.interestLevel, interest));
  for (const key of ["campaignId", "eventId", "partnerId", "accountId"] as const) {
    const v = spNum(sp, key);
    if (v) conds.push(eq(s.leads[key], v));
  }
  const loc = spNum(sp, "locationId");
  if (loc) conds.push(eq(s.leads.preferredLocationId, loc));

  return db
    .select({
      id: s.leads.id, firstName: s.leads.firstName, lastName: s.leads.lastName,
      phone: s.leads.phone, email: s.leads.email, source: s.leads.source,
      interestLevel: s.leads.interestLevel, apptStatus: s.leads.apptStatus,
      createdAt: s.leads.createdAt,
      campaignId: s.leads.campaignId, campaignName: s.campaigns.name,
      eventId: s.leads.eventId, eventName: s.events.name,
    })
    .from(s.leads)
    .leftJoin(s.campaigns, eq(s.leads.campaignId, s.campaigns.id))
    .leftJoin(s.events, eq(s.leads.eventId, s.events.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      name: (d) => [dirFn(d)(sql`lower(${s.leads.firstName})`), dirFn(d)(sql`lower(${s.leads.lastName})`)],
      source: (d) => byText(s.leads.source, d),
      interest: (d) => byOrder(s.leads.interestLevel, INTEREST_LEVELS, d),
      apptStatus: (d) => byOrder(s.leads.apptStatus, LEAD_APPT_STATUSES, d),
      phone: (d) => byText(s.leads.phone, d),
      added: (d) => byValue(s.leads.createdAt, d),
    }, [desc(s.leads.createdAt)]))
    .limit(LIMIT);
}

// ---------- Appointments ----------
export async function listAppointments(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.appointments);
  const from = spStr(sp, "from");
  if (from) conds.push(gte(s.appointments.scheduledAt, from));
  const to = spStr(sp, "to");
  if (to) conds.push(lt(s.appointments.scheduledAt, up(to)));
  const cf = spStr(sp, "cfrom");
  if (cf) conds.push(gte(s.appointments.createdAt, cf));
  const ct = spStr(sp, "cto");
  if (ct) conds.push(lt(s.appointments.createdAt, up(ct)));
  const status = spStr(sp, "status");
  if (status) conds.push(eq(s.appointments.status, status));
  const source = spStr(sp, "source");
  if (source) conds.push(eq(s.appointments.source, source));
  if (spStr(sp, "collected")) conds.push(eq(s.appointments.collected, true));
  for (const key of ["eventId", "campaignId", "partnerId", "accountId", "leadId"] as const) {
    const v = spNum(sp, key);
    if (v) conds.push(eq(s.appointments[key], v));
  }
  const loc = spNum(sp, "locationId");
  if (loc) conds.push(eq(s.appointments.locationId, loc));
  // "none" is a real filter, not the absence of one: the New Patients by Office
  // report has a row for appointments with no clinic set, and its drill-down has
  // to show exactly those rather than everything.
  if (spStr(sp, "locationId") === "none") conds.push(isNull(s.appointments.locationId));

  return db
    .select({
      id: s.appointments.id, personName: s.appointments.personName, status: s.appointments.status,
      scheduledAt: s.appointments.scheduledAt, createdAt: s.appointments.createdAt,
      source: s.appointments.source, offer: s.appointments.offer,
      revenue: s.appointments.revenue, collected: s.appointments.collected,
      leadId: s.appointments.leadId,
      campaignId: s.appointments.campaignId, campaignName: s.campaigns.name,
      eventId: s.appointments.eventId, eventName: s.events.name,
      locationId: s.appointments.locationId, locationName: s.locations.name,
    })
    .from(s.appointments)
    .leftJoin(s.campaigns, eq(s.appointments.campaignId, s.campaigns.id))
    .leftJoin(s.events, eq(s.appointments.eventId, s.events.id))
    .leftJoin(s.locations, eq(s.appointments.locationId, s.locations.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...applySort(sp, {
      person: (d) => byText(s.appointments.personName, d),
      scheduled: (d) => byValue(s.appointments.scheduledAt, d),
      status: (d) => byOrder(s.appointments.status, APPOINTMENT_STATUSES, d),
      source: (d) => byText(s.appointments.source, d),
      location: (d) => byText(s.locations.name, d),
      charged: (d) => byValue(s.appointments.revenue, d),
      collected: (d) => byValue(s.appointments.collected, d),
    }, [desc(s.appointments.scheduledAt)]))
    .limit(LIMIT);
}

// ---------- Tasks ----------
export async function listTasks(sp: SP) {
  const conds: SQL[] = await scopeStart(sp, s.tasks);
  const today = todayISO();
  const due = spStr(sp, "due");
  if (due === "overdue") {
    conds.push(eq(s.tasks.status, "Open"), isNotNull(s.tasks.dueDate), lt(s.tasks.dueDate, today));
  } else if (due === "today") {
    conds.push(eq(s.tasks.status, "Open"), gte(s.tasks.dueDate, today), lt(s.tasks.dueDate, up(today)));
  }
  const status = spStr(sp, "status");
  if (status) conds.push(eq(s.tasks.status, status));
  for (const key of ["accountId", "contactId", "opportunityId", "eventId"] as const) {
    const v = spNum(sp, key);
    if (v) conds.push(eq(s.tasks[key], v));
  }

  return db
    .select({
      id: s.tasks.id, title: s.tasks.title, dueDate: s.tasks.dueDate, status: s.tasks.status,
      notes: s.tasks.notes, completedAt: s.tasks.completedAt,
      accountId: s.tasks.accountId, accountName: s.accounts.name,
      contactId: s.tasks.contactId, contactFirst: s.contacts.firstName, contactLast: s.contacts.lastName,
      opportunityId: s.tasks.opportunityId, eventId: s.tasks.eventId,
      // Carried so a row can open the activity wizard already pointed at the
      // right record — a follow-up on a lead must log against that lead.
      leadId: s.tasks.leadId, projectId: s.tasks.projectId,
      leadFirst: s.leads.firstName, leadLast: s.leads.lastName,
    })
    .from(s.tasks)
    .leftJoin(s.accounts, eq(s.tasks.accountId, s.accounts.id))
    .leftJoin(s.contacts, eq(s.tasks.contactId, s.contacts.id))
    .leftJoin(s.leads, eq(s.tasks.leadId, s.leads.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(s.tasks.status), asc(s.tasks.dueDate))
    .limit(LIMIT);
}
