"use server";

// All mutations live here. Every action revalidates the whole app (single-user
// tool — simplicity over cache micro-management) and redirects to the record.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db, schema as s } from "@/db";
import { count, eq } from "drizzle-orm";
import { nowISO, todayISO, addDays } from "@/lib/dates";
import { hashPassword, requireAdmin, requireUser, verifyPassword } from "@/lib/auth";
import {
  ACCOUNT_STATUSES, INTEREST_LEVELS, LEAD_APPT_STATUSES,
  RELATIONSHIP_STRENGTHS, normalizePublicForm,
} from "@/lib/taxonomy";
import { activeCityId, canAccessCity, CITY_COOKIE } from "@/lib/scope";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * City + owner stamped onto every record created here: the city the user is
 * currently working in, and the user themselves. Also enforces the session, so
 * an action that stamps doesn't need a separate requireUser().
 */
async function stamp(): Promise<{ cityId: number | null; userId: number }> {
  const user = await requireUser();
  return { cityId: await activeCityId(), userId: user.id };
}

/**
 * Authorization for writes. `requireUser()` only proves someone is signed in;
 * without this, any user could overwrite another city's record by posting a
 * different id. Call before every update/delete that takes an id from the form.
 *
 * Throws (rather than redirecting) so a forged request fails loudly instead of
 * silently succeeding.
 */
type OwnedTable = SQLiteTable & { id: SQLiteColumn; cityId: SQLiteColumn };
async function assertOwned(table: OwnedTable, id: number): Promise<void> {
  await requireUser();
  const [row] = await db.select({ cityId: table.cityId }).from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw new Error("Not found");
  if (!(await canAccessCity(row.cityId as number | null))) throw new Error("Not authorized");
}

// ---- FormData helpers ----
const str = (fd: FormData, k: string): string | null => {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};
const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (fd: FormData, k: string): boolean => fd.get(k) === "on" || fd.get(k) === "true";

function done(path?: string): never {
  revalidatePath("/", "layout");
  redirect(path ?? "/");
}

// =============== Accounts ===============
function accountValues(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Untitled Business",
    vertical: str(fd, "vertical") ?? "Other",
    area: str(fd, "area") ?? "Other",
    address: str(fd, "address"),
    website: str(fd, "website"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    status: str(fd, "status") ?? "New Prospect",
    source: str(fd, "source"),
    ownerName: str(fd, "ownerName"),
    notes: str(fd, "notes"),
    clinicLocationId: num(fd, "clinicLocationId"),
    partnershipScore: num(fd, "partnershipScore") ?? 3,
    eventScore: num(fd, "eventScore") ?? 3,
    relationshipStrength: str(fd, "relationshipStrength") ?? "Cold",
    doNotContact: bool(fd, "doNotContact"),
    nextFollowUpAt: str(fd, "nextFollowUpAt"),
  };
}

export async function createAccount(fd: FormData) {
  const [row] = await db.insert(s.accounts).values({ ...accountValues(fd), ...(await stamp()) }).returning();
  done(`/accounts/${row.id}`);
}

export async function updateAccount(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.accounts, id);
  await db.update(s.accounts).set(accountValues(fd)).where(eq(s.accounts.id, id));
  done(`/accounts/${id}`);
}

// =============== Contacts ===============
function contactValues(fd: FormData) {
  return {
    firstName: str(fd, "firstName") ?? "Unknown",
    lastName: str(fd, "lastName") ?? "",
    title: str(fd, "title"),
    accountId: num(fd, "accountId"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    preferredMethod: str(fd, "preferredMethod"),
    contactType: str(fd, "contactType") ?? "Other",
    influenceLevel: str(fd, "influenceLevel") ?? "Medium",
    relationshipStatus: str(fd, "relationshipStatus") ?? "New",
    notes: str(fd, "notes"),
    source: str(fd, "source"),
    nextFollowUpAt: str(fd, "nextFollowUpAt"),
  };
}

export async function createContact(fd: FormData) {
  const [row] = await db.insert(s.contacts).values({ ...contactValues(fd), ...(await stamp()) }).returning();
  done(`/contacts/${row.id}`);
}

export async function updateContact(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.contacts, id);
  await db.update(s.contacts).set(contactValues(fd)).where(eq(s.contacts.id, id));
  done(`/contacts/${id}`);
}

// =============== Activities ===============
/** Lead source inferred from the activity type when a lead is created inline. */
const LEAD_SOURCE_BY_ACTIVITY: Record<string, string> = {
  "Screening Event": "Screening",
  "Drop Box Visit": "Drop Box",
  "Lunch and Learn": "Event",
  "In-Person Visit": "Walk-In",
};

function splitName(full: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = full.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

export async function logActivity(fd: FormData) {
  // One stamp for everything this submission creates — the activity and any
  // business, contact, event, lead or appointment spun up alongside it.
  const own = await stamp();
  const type = str(fd, "type") ?? "Note";
  const occurredAt = str(fd, "occurredAt") ?? nowISO();
  const nextFollowUpAt = str(fd, "nextFollowUpAt");

  // Create records inline when the person/business isn't in the system yet.
  let accountId = num(fd, "accountId");
  const newAccountName = str(fd, "newAccountName");
  if (!accountId && newAccountName) {
    const [acct] = await db.insert(s.accounts).values({
      name: newAccountName,
      status: "Contacted",
      source: "Added while logging activity",
      ...own,
    }).returning();
    accountId = acct.id;
  }

  let contactId = num(fd, "contactId");
  const newContactName = str(fd, "newContactName");
  if (!contactId && newContactName) {
    const [contact] = await db.insert(s.contacts).values({
      ...splitName(newContactName),
      title: str(fd, "newContactTitle"),
      phone: str(fd, "newContactPhone"),
      email: str(fd, "newContactEmail"),
      accountId,
      source: "Added while logging activity",
      ...own,
    }).returning();
    contactId = contact.id;
  }

  // When the outcome is "Booked Event", capture the event inline and link it.
  let eventId = num(fd, "eventId");
  const newEventType = str(fd, "newEventType");
  if (!eventId && newEventType) {
    const acct = accountId ? await db.query.accounts.findFirst({ where: eq(s.accounts.id, accountId) }) : null;
    const startsAt = str(fd, "newEventStartsAt");
    const eventName = str(fd, "newEventName") ?? `${newEventType}${acct ? ` — ${acct.name}` : ""}`;
    const [event] = await db.insert(s.events).values({
      name: eventName,
      type: newEventType,
      accountId,
      contactId,
      opportunityId: num(fd, "opportunityId"),
      campaignId: num(fd, "campaignId"),
      partnerId: num(fd, "partnerId"),
      clinicLocationId: num(fd, "newEventLocationId"),
      startsAt,
      endsAt: (() => {
        const end = str(fd, "newEventEndsAt");
        return end && startsAt && end > startsAt ? end : null;
      })(),
      // Booked today regardless of whether a firm time is set yet.
      status: startsAt ? "Booked" : "Date Pending",
      bookedAt: nowISO(),
      expectedAttendees: num(fd, "newEventExpected") ?? 0,
      notes: "Booked via activity log.",
      ...own,
    }).returning();
    eventId = event.id;
  }

  // Results flow: Screening Event / Lunch and Learn create a completed Event,
  // the individual leads captured, and one appointment record per booked appt.
  if (!eventId && (type === "Screening Event" || type === "Lunch and Learn")) {
    const acct = accountId ? await db.query.accounts.findFirst({ where: eq(s.accounts.id, accountId) }) : null;
    const isScreening = type === "Screening Event";
    const eventType = isScreening ? "Gym Screening" : "Lunch and Learn";
    const screened = num(fd, "resultScreened") ?? 0;
    const [event] = await db.insert(s.events).values({
      name: `${eventType}${acct ? ` — ${acct.name}` : ""}`,
      type: eventType,
      accountId,
      contactId,
      campaignId: num(fd, "campaignId"),
      partnerId: num(fd, "partnerId"),
      startsAt: occurredAt,
      status: "Completed", // it already happened
      bookedAt: nowISO(),
      actualAttendees: screened,
      screeningsCompleted: isScreening ? screened : 0,
      notes: "Logged via activity.",
      ...own,
    }).returning();
    eventId = event.id;

    const source = isScreening ? "Screening" : "Event";
    // Each captured person → a lead. If they booked, also an appointment with
    // its own date, location, amount charged, and whether it's been collected.
    type Person = { name: string; phone?: string; booked?: boolean; apptDate?: string; locationId?: string; revenue?: string; collected?: boolean };
    const people: Person[] = (() => {
      try { return JSON.parse(str(fd, "resultPeople") ?? "[]"); } catch { return []; }
    })();
    for (const p of people) {
      if (!p.name?.trim()) continue;
      const bookedLocId = Number(p.locationId);
      const [lead] = await db.insert(s.leads).values({
        ...splitName(p.name),
        phone: p.phone?.trim() || null,
        source,
        apptStatus: p.booked ? "Booked" : "Not Contacted",
        campaignId: num(fd, "campaignId"),
        partnerId: num(fd, "partnerId"),
        eventId,
        accountId,
        // booked at a clinic → that's their preferred location
        preferredLocationId: p.booked && Number.isFinite(bookedLocId) && bookedLocId > 0 ? bookedLocId : null,
        ...own,
      }).returning();

      if (p.booked) {
        const rev = Number(p.revenue);
        const locId = Number(p.locationId);
        await db.insert(s.appointments).values({
          leadId: lead.id,
          personName: p.name.trim(),
          source,
          eventId,
          accountId,
          campaignId: num(fd, "campaignId"),
          partnerId: num(fd, "partnerId"),
          locationId: Number.isFinite(locId) && locId > 0 ? locId : null,
          scheduledAt: p.apptDate?.trim() ? p.apptDate : occurredAt,
          revenue: Number.isFinite(rev) ? rev : 0,
          collected: !!p.collected,
          status: "Booked",
          ...own,
        });
      }
    }
  }

  let leadId = num(fd, "leadId");
  const newLeadName = str(fd, "newLeadName");
  if (!leadId && newLeadName) {
    const [lead] = await db.insert(s.leads).values({
      ...splitName(newLeadName),
      phone: str(fd, "newLeadPhone"),
      source: LEAD_SOURCE_BY_ACTIVITY[type] ?? "Other",
      apptStatus: "Contacted",
      campaignId: num(fd, "campaignId"),
      eventId,
      partnerId: num(fd, "partnerId"),
      accountId,
      ...own,
    }).returning();
    leadId = lead.id;
  }

  const [activity] = await db.insert(s.activities).values({
    type,
    outcome: str(fd, "outcome"),
    accountId,
    contactId,
    leadId,
    opportunityId: num(fd, "opportunityId"),
    eventId,
    partnerId: num(fd, "partnerId"),
    campaignId: num(fd, "campaignId"),
    projectId: num(fd, "projectId"),
    occurredAt,
    nextFollowUpAt,
    notes: str(fd, "notes"),
    ...own,
  }).returning();

  // Extra contacts entered one-by-one on a communication / drop-in touch —
  // each becomes a contact tied to this activity's business (if any).
  const extraRaw = str(fd, "extraContacts");
  if (extraRaw) {
    let parsed: { name?: string; title?: string; phone?: string; email?: string }[] = [];
    try { parsed = JSON.parse(extraRaw); } catch { parsed = []; }
    for (const p of parsed) {
      if (!p.name?.trim()) continue;
      await db.insert(s.contacts).values({
        ...splitName(p.name),
        title: p.title?.trim() || null,
        phone: p.phone?.trim() || null,
        email: p.email?.trim() || null,
        accountId,
        source: "Added while logging activity",
        ...own,
      });
    }
  }

  // Standing update captured on the "where do things stand" step. Sent only
  // when actually changed, so an untouched screen never rewrites a record.
  // Applies to the business when there is one, otherwise to the lead.
  const newRelationship = str(fd, "newRelationship");
  const newStatus = str(fd, "newStatus");
  if (accountId) {
    if (newRelationship && (RELATIONSHIP_STRENGTHS as readonly string[]).includes(newRelationship)) {
      await db.update(s.accounts).set({ relationshipStrength: newRelationship }).where(eq(s.accounts.id, accountId));
    }
    if (newStatus && (ACCOUNT_STATUSES as readonly string[]).includes(newStatus)) {
      await db.update(s.accounts).set({ status: newStatus }).where(eq(s.accounts.id, accountId));
    }
  } else if (leadId) {
    if (newRelationship && (INTEREST_LEVELS as readonly string[]).includes(newRelationship)) {
      await db.update(s.leads).set({ interestLevel: newRelationship }).where(eq(s.leads.id, leadId));
    }
    if (newStatus && (LEAD_APPT_STATUSES as readonly string[]).includes(newStatus)) {
      await db.update(s.leads).set({ apptStatus: newStatus }).where(eq(s.leads.id, leadId));
    }
  }

  // Keep "last contacted" fresh on the related records.
  if (accountId) {
    await db.update(s.accounts)
      .set({ lastContactedAt: occurredAt, ...(nextFollowUpAt ? { nextFollowUpAt } : {}) })
      .where(eq(s.accounts.id, accountId));
  }
  if (contactId) {
    await db.update(s.contacts)
      .set({ lastContactedAt: occurredAt, ...(nextFollowUpAt ? { nextFollowUpAt } : {}) })
      .where(eq(s.contacts.id, contactId));
  }

  // Drop Box Visit: roll the collected cards into the partner's running total.
  const dropCards = num(fd, "dropCards");
  if (type === "Drop Box Visit" && accountId && dropCards) {
    const partner = await db.query.partners.findFirst({ where: eq(s.partners.accountId, accountId) });
    if (partner) {
      await db.update(s.partners).set({
        cardsCollected: partner.cardsCollected + dropCards,
        lastPickupAt: occurredAt,
        nextPickupDueAt: addDays(todayISO(), 7),
        dropBoxStatus: "Placed",
      }).where(eq(s.partners.id, partner.id));
    }
  }

  // Optionally spawn a follow-up task straight from the activity.
  if (nextFollowUpAt && bool(fd, "createTask")) {
    const projectId = num(fd, "projectId");
    // You follow up with a PERSON, so they're named first; the business trails
    // as context. That order also means the calendar's truncation drops the
    // business rather than the name you're looking for.
    const [acct, contact, lead, project] = await Promise.all([
      accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, accountId) }) : null,
      contactId ? db.query.contacts.findFirst({ where: eq(s.contacts.id, contactId) }) : null,
      leadId ? db.query.leads.findFirst({ where: eq(s.leads.id, leadId) }) : null,
      projectId ? db.query.projects.findFirst({ where: eq(s.projects.id, projectId) }) : null,
    ]);
    const person = contact
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : lead ? `${lead.firstName} ${lead.lastName}`.trim() : null;
    const who = person
      ? (acct ? `${person} · ${acct.name}` : person)
      : acct?.name ?? project?.name ?? null;
    await db.insert(s.tasks).values({
      title: str(fd, "taskTitle") ?? `Follow up${who ? `: ${who}` : ""}`,
      dueDate: nextFollowUpAt,
      accountId, contactId,
      opportunityId: num(fd, "opportunityId"),
      eventId,
      projectId,
      activityId: activity.id,
      ...own,
    });
  }

  const back = str(fd, "returnTo");
  done(back ?? "/activities");
}

// =============== Tasks ===============
export async function createTask(fd: FormData) {
  await db.insert(s.tasks).values({
    title: str(fd, "title") ?? "Untitled task",
    dueDate: str(fd, "dueDate"),
    accountId: num(fd, "accountId"),
    contactId: num(fd, "contactId"),
    opportunityId: num(fd, "opportunityId"),
    eventId: num(fd, "eventId"),
    projectId: num(fd, "projectId"),
    notes: str(fd, "notes"),
    ...(await stamp()),
  });
  done(str(fd, "returnTo") ?? "/tasks");
}

export async function updateTask(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.tasks, id);
  await db.update(s.tasks).set({
    title: str(fd, "title") ?? "Untitled task",
    dueDate: str(fd, "dueDate"),
    notes: str(fd, "notes"),
  }).where(eq(s.tasks.id, id));
  done("/tasks");
}

export async function setTaskStatus(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.tasks, id);
  const status = str(fd, "status") ?? "Open";
  await db.update(s.tasks).set({
    status,
    completedAt: status === "Completed" ? nowISO() : null,
  }).where(eq(s.tasks.id, id));
  done(str(fd, "returnTo") ?? "/tasks");
}

// =============== Opportunities ===============
function oppValues(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Untitled Opportunity",
    accountId: num(fd, "accountId"),
    contactId: num(fd, "contactId"),
    type: str(fd, "type") ?? "Other",
    expectedEventDate: str(fd, "expectedEventDate"),
    nextStep: str(fd, "nextStep"),
    nextFollowUpAt: str(fd, "nextFollowUpAt"),
    campaignId: num(fd, "campaignId"),
    clinicLocationId: num(fd, "clinicLocationId"),
    notes: str(fd, "notes"),
    lossReason: str(fd, "lossReason"),
  };
}

export async function createOpportunity(fd: FormData) {
  const [row] = await db.insert(s.opportunities).values({
    ...oppValues(fd),
    stage: str(fd, "stage") ?? "Prospect Identified",
    ...(await stamp()),
  }).returning();
  done(`/opportunities/${row.id}`);
}

export async function updateOpportunity(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.opportunities, id);
  const existing = await db.query.opportunities.findFirst({ where: eq(s.opportunities.id, id) });
  const stage = str(fd, "stage") ?? existing?.stage ?? "Prospect Identified";
  await db.update(s.opportunities).set({
    ...oppValues(fd),
    stage,
    stageChangedAt: existing && stage !== existing.stage ? nowISO() : existing?.stageChangedAt,
  }).where(eq(s.opportunities.id, id));
  done(`/opportunities/${id}`);
}

export async function setOpportunityStage(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.opportunities, id);
  const stage = str(fd, "stage")!;
  await db.update(s.opportunities).set({
    stage,
    stageChangedAt: nowISO(),
    ...(str(fd, "lossReason") ? { lossReason: str(fd, "lossReason") } : {}),
  }).where(eq(s.opportunities.id, id));
  done(str(fd, "returnTo") ?? "/pipeline");
}

// =============== Partners ===============
function partnerValues(fd: FormData) {
  return {
    accountId: num(fd, "accountId")!,
    partnerType: str(fd, "partnerType") ?? "Business Partner",
    status: str(fd, "status") ?? "Prospective",
    startDate: str(fd, "startDate"),
    mainContactId: num(fd, "mainContactId"),
    clinicLocationId: num(fd, "clinicLocationId"),
    benefits: str(fd, "benefits"),
    notes: str(fd, "notes"),
    dropBoxActive: bool(fd, "dropBoxActive"),
    dropBoxStatus: str(fd, "dropBoxStatus"),
    lastPickupAt: str(fd, "lastPickupAt"),
    nextPickupDueAt: str(fd, "nextPickupDueAt"),
    lunchOffer: str(fd, "lunchOffer"),
    cateringInfo: str(fd, "cateringInfo"),
    cardsCollected: num(fd, "cardsCollected") ?? 0,
    revenueSpent: num(fd, "revenueSpent") ?? 0,
  };
}

export async function createPartner(fd: FormData) {
  const [row] = await db.insert(s.partners).values({ ...partnerValues(fd), ...(await stamp()) }).returning();
  done(`/partners/${row.id}`);
}

export async function updatePartner(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.partners, id);
  await db.update(s.partners).set(partnerValues(fd)).where(eq(s.partners.id, id));
  done(`/partners/${id}`);
}

/** Quick action: log a drop box pickup — updates counters and schedules the next one. */
export async function recordDropBoxPickup(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.partners, id);
  const cards = num(fd, "cards") ?? 0;
  const partner = await db.query.partners.findFirst({ where: eq(s.partners.id, id) });
  if (!partner) done("/partners");
  await db.update(s.partners).set({
    cardsCollected: partner!.cardsCollected + cards,
    lastPickupAt: nowISO(),
    nextPickupDueAt: addDays(todayISO(), 7),
    dropBoxStatus: "Placed",
  }).where(eq(s.partners.id, id));
  await db.insert(s.activities).values({
    type: "Drop Box Visit",
    outcome: "Follow-Up Needed",
    accountId: partner!.accountId,
    partnerId: id,
    occurredAt: nowISO(),
    notes: `Drop box pickup — collected ${cards} cards.`,
    ...(await stamp()),
  });
  done(`/partners/${id}`);
}

// =============== Campaigns ===============
function campaignValues(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Untitled Campaign",
    type: str(fd, "type") ?? "Other",
    partnerId: num(fd, "partnerId"),
    accountId: num(fd, "accountId"),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    status: str(fd, "status") ?? "Active",
    trackingUrl: str(fd, "trackingUrl"),
    offer: str(fd, "offer"),
    notes: str(fd, "notes"),
    publicForm: normalizePublicForm(str(fd, "publicForm")),
  };
}

export async function createCampaign(fd: FormData) {
  const [row] = await db.insert(s.campaigns).values({
    ...campaignValues(fd),
    publicToken: randomBytes(6).toString("base64url"), // powers the QR sign-up page
    ...(await stamp()),
  }).returning();
  done(`/campaigns/${row.id}`);
}

export async function updateCampaign(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.campaigns, id);
  await db.update(s.campaigns).set(campaignValues(fd)).where(eq(s.campaigns.id, id));
  done(`/campaigns/${id}`);
}

// =============== Events ===============
function eventValues(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Untitled Event",
    type: str(fd, "type") ?? "Other",
    accountId: num(fd, "accountId"),
    contactId: num(fd, "contactId"),
    opportunityId: num(fd, "opportunityId"),
    campaignId: num(fd, "campaignId"),
    partnerId: num(fd, "partnerId"),
    clinicLocationId: num(fd, "clinicLocationId"),
    locationText: str(fd, "locationText"),
    startsAt: str(fd, "startsAt"),
    // Ignore an end that isn't after the start — a backwards block would render
    // as a negative-height slot on the calendar.
    endsAt: (() => {
      const start = str(fd, "startsAt"), end = str(fd, "endsAt");
      return end && start && end > start ? end : null;
    })(),
    expectedAttendees: num(fd, "expectedAttendees") ?? 0,
    notes: str(fd, "notes"),
    followUpRequired: bool(fd, "followUpRequired"),
    followUpDueAt: str(fd, "followUpDueAt"),
  };
}

const BOOKED = ["Booked", "Confirmed", "Completed", "Follow-Up Needed"];

export async function createEvent(fd: FormData) {
  const status = str(fd, "status") ?? "Idea";
  const [row] = await db.insert(s.events).values({
    ...eventValues(fd),
    status,
    bookedAt: BOOKED.includes(status) ? nowISO() : null,
    ...(await stamp()),
  }).returning();
  done(`/events/${row.id}`);
}

export async function updateEvent(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.events, id);
  const existing = await db.query.events.findFirst({ where: eq(s.events.id, id) });
  const status = str(fd, "status") ?? existing?.status ?? "Idea";
  await db.update(s.events).set({
    ...eventValues(fd),
    status,
    // stamp bookedAt the first time an event reaches a booked status
    bookedAt: existing?.bookedAt ?? (BOOKED.includes(status) ? nowISO() : null),
  }).where(eq(s.events.id, id));
  done(`/events/${id}`);
}

/** Post-event outcome entry: attendance, screenings, notes, follow-up. */
export async function saveEventOutcome(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.events, id);
  const existing = await db.query.events.findFirst({ where: eq(s.events.id, id) });
  const followUpRequired = bool(fd, "followUpRequired");
  await db.update(s.events).set({
    actualAttendees: num(fd, "actualAttendees") ?? 0,
    screeningsCompleted: num(fd, "screeningsCompleted") ?? 0,
    revenue: num(fd, "revenue") ?? 0,
    outcomeNotes: str(fd, "outcomeNotes"),
    followUpRequired,
    followUpDueAt: str(fd, "followUpDueAt"),
    status: followUpRequired ? "Follow-Up Needed" : "Completed",
    bookedAt: existing?.bookedAt ?? nowISO(),
  }).where(eq(s.events.id, id));
  done(`/events/${id}`);
}

// =============== Leads ===============
function leadValues(fd: FormData) {
  return {
    firstName: str(fd, "firstName") ?? "Unknown",
    lastName: str(fd, "lastName") ?? "",
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    source: str(fd, "source"),
    campaignId: num(fd, "campaignId"),
    eventId: num(fd, "eventId"),
    partnerId: num(fd, "partnerId"),
    accountId: num(fd, "accountId"),
    interestLevel: str(fd, "interestLevel") ?? "Unknown",
    apptStatus: str(fd, "apptStatus") ?? "Not Contacted",
    preferredLocationId: num(fd, "preferredLocationId"),
    notes: str(fd, "notes"),
  };
}

export async function createLead(fd: FormData) {
  const [row] = await db.insert(s.leads).values({ ...leadValues(fd), ...(await stamp()) }).returning();
  const again = str(fd, "addAnother");
  done(again ? `/leads/new${again}` : `/leads/${row.id}`);
}

export async function updateLead(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.leads, id);
  await db.update(s.leads).set(leadValues(fd)).where(eq(s.leads.id, id));
  done(`/leads/${id}`);
}

/** Promote a lead to a full contact (e.g. a screening lead who turns out to be
    an office manager). Copies their info, keeps the lead for attribution. */
export async function convertLeadToContact(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.leads, id);
  const lead = await db.query.leads.findFirst({ where: eq(s.leads.id, id) });
  if (!lead) done("/leads");
  const [contact] = await db.insert(s.contacts).values({
    firstName: lead!.firstName,
    lastName: lead!.lastName,
    phone: lead!.phone,
    email: lead!.email,
    accountId: lead!.accountId,
    contactType: "Other",
    source: lead!.source ? `Converted from lead (${lead!.source})` : "Converted from lead",
    notes: lead!.notes,
    ...(await stamp()),
    cityId: lead!.cityId, // the contact belongs where the lead came from
  }).returning();
  await db.update(s.leads).set({
    notes: `${lead!.notes ? lead!.notes + " · " : ""}Promoted to contact on ${todayISO()}.`,
  }).where(eq(s.leads.id, id));
  done(`/contacts/${contact.id}`);
}

// =============== Reclassifying records ===============
//
// For fixing the wrong *kind* of record — a person imported as a business, a
// business captured as a lead. Unlike convertLeadToContact (which promotes a
// lead and keeps it for attribution), these MOVE the record: history is
// re-pointed at the new record and the original is removed, because the
// original was simply a mistake.

/** Re-points rows from one FK column to another, e.g. accountId -> contactId. */
async function repoint(
  refs: { table: SQLiteTable; from: SQLiteColumn; fromField: string; toField: string }[],
  oldId: number, newId: number,
) {
  for (const r of refs) {
    await db.update(r.table)
      .set({ [r.fromField]: null, [r.toField]: newId } as never)
      .where(eq(r.from, oldId));
  }
}

/** A business row that was really a person. */
export async function convertAccountToContact(fd: FormData) {
  const id = num(fd, "id")!;
  await assertOwned(s.accounts, id);
  const acct = await db.query.accounts.findFirst({ where: eq(s.accounts.id, id) });
  if (!acct) done("/accounts");

  const [contact] = await db.insert(s.contacts).values({
    // The business name IS the person's name in this mistake.
    ...splitName(acct!.name),
    phone: acct!.phone,
    email: acct!.email,
    contactType: "Other",
    source: acct!.source ?? "Reclassified from business",
    notes: [acct!.notes, acct!.ownerName ? `Was listed as business owner: ${acct!.ownerName}` : null]
      .filter(Boolean).join(" · ") || null,
    ...(await stamp()),
    cityId: acct!.cityId,
    userId: acct!.userId ?? (await requireUser()).id,
  }).returning();

  await repoint([
    { table: s.activities, from: s.activities.accountId, fromField: "accountId", toField: "contactId" },
    { table: s.tasks, from: s.tasks.accountId, fromField: "accountId", toField: "contactId" },
    { table: s.opportunities, from: s.opportunities.accountId, fromField: "accountId", toField: "contactId" },
    { table: s.events, from: s.events.accountId, fromField: "accountId", toField: "contactId" },
    { table: s.appointments, from: s.appointments.accountId, fromField: "accountId", toField: "contactId" },
  ], id, contact.id);

  // Anything still tied to the old business row is detached / removed.
  await deleteViaPlan("account", id);
  done(`/contacts/${contact.id}`);
}

/** A person row that was really a business. */
export async function convertContactToAccount(fd: FormData) {
  const id = num(fd, "id")!;
  await assertOwned(s.contacts, id);
  const c = await db.query.contacts.findFirst({ where: eq(s.contacts.id, id) });
  if (!c) done("/contacts");

  const [acct] = await db.insert(s.accounts).values({
    name: `${c!.firstName} ${c!.lastName}`.trim(),
    phone: c!.phone,
    email: c!.email,
    status: "New Prospect",
    source: c!.source ?? "Reclassified from contact",
    notes: c!.notes,
    ...(await stamp()),
    cityId: c!.cityId,
    userId: c!.userId ?? (await requireUser()).id,
  }).returning();

  await repoint([
    { table: s.activities, from: s.activities.contactId, fromField: "contactId", toField: "accountId" },
    { table: s.tasks, from: s.tasks.contactId, fromField: "contactId", toField: "accountId" },
    { table: s.opportunities, from: s.opportunities.contactId, fromField: "contactId", toField: "accountId" },
    { table: s.events, from: s.events.contactId, fromField: "contactId", toField: "accountId" },
    { table: s.appointments, from: s.appointments.contactId, fromField: "contactId", toField: "accountId" },
  ], id, acct.id);

  await deleteViaPlan("contact", id);
  done(`/accounts/${acct.id}`);
}

/** A lead that was really a business. */
export async function convertLeadToAccount(fd: FormData) {
  const id = num(fd, "id")!;
  await assertOwned(s.leads, id);
  const lead = await db.query.leads.findFirst({ where: eq(s.leads.id, id) });
  if (!lead) done("/leads");

  const [acct] = await db.insert(s.accounts).values({
    name: `${lead!.firstName} ${lead!.lastName}`.trim(),
    phone: lead!.phone,
    email: lead!.email,
    status: "New Prospect",
    source: lead!.source ? `Converted from lead (${lead!.source})` : "Converted from lead",
    notes: lead!.notes,
    ...(await stamp()),
    cityId: lead!.cityId,
    userId: lead!.userId ?? (await requireUser()).id,
  }).returning();

  await repoint([
    { table: s.activities, from: s.activities.leadId, fromField: "leadId", toField: "accountId" },
    { table: s.appointments, from: s.appointments.leadId, fromField: "leadId", toField: "accountId" },
  ], id, acct.id);

  await deleteViaPlan("lead", id);
  done(`/accounts/${acct.id}`);
}

// =============== Appointments ===============
function apptValues(fd: FormData) {
  return {
    leadId: num(fd, "leadId"),
    contactId: num(fd, "contactId"),
    personName: str(fd, "personName") ?? "",
    source: str(fd, "source"),
    eventId: num(fd, "eventId"),
    campaignId: num(fd, "campaignId"),
    partnerId: num(fd, "partnerId"),
    accountId: num(fd, "accountId"),
    locationId: num(fd, "locationId"),
    scheduledAt: str(fd, "scheduledAt"),
    status: str(fd, "status") ?? "Booked",
    offer: str(fd, "offer"),
    revenue: num(fd, "revenue") ?? 0, // amount charged
    collected: bool(fd, "collected"),
    notes: str(fd, "notes"),
  };
}

/** Appointment status → matching lead status, so attribution stays consistent. */
const LEAD_STATUS_SYNC: Record<string, string> = {
  Booked: "Booked", Confirmed: "Booked", Showed: "Showed",
  "No-Show": "No-Show", Rescheduled: "Rescheduled",
};

async function syncLead(leadId: number | null, apptStatus: string) {
  if (!leadId) return;
  const mapped = LEAD_STATUS_SYNC[apptStatus];
  if (mapped) await db.update(s.leads).set({ apptStatus: mapped }).where(eq(s.leads.id, leadId));
}

export async function createAppointment(fd: FormData) {
  await requireUser();
  const values = apptValues(fd);
  if (!values.personName && values.leadId) {
    const lead = await db.query.leads.findFirst({ where: eq(s.leads.id, values.leadId) });
    if (lead) values.personName = `${lead.firstName} ${lead.lastName}`.trim();
  }
  const [row] = await db.insert(s.appointments).values({ ...values, ...(await stamp()) }).returning();
  await syncLead(values.leadId, values.status);
  done(`/appointments?highlight=${row.id}`);
}

export async function updateAppointment(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.appointments, id);
  const values = apptValues(fd);
  await db.update(s.appointments).set(values).where(eq(s.appointments.id, id));
  await syncLead(values.leadId, values.status);
  done(str(fd, "returnTo") ?? "/appointments");
}

export async function setAppointmentStatus(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.appointments, id);
  const status = str(fd, "status")!;
  const appt = await db.query.appointments.findFirst({ where: eq(s.appointments.id, id) });
  await db.update(s.appointments).set({ status }).where(eq(s.appointments.id, id));
  await syncLead(appt?.leadId ?? null, status);
  done(str(fd, "returnTo") ?? "/appointments");
}

// =============== Cities ===============
/**
 * Switch the city you're working in. Stored in a cookie rather than on the user
 * so it's a view state, not a permission — admins only, since members are
 * pinned to their assigned city.
 */
export async function switchCity(fd: FormData) {
  await requireAdmin();
  const id = num(fd, "cityId");
  const city = id ? await db.query.cities.findFirst({ where: eq(s.cities.id, id) }) : null;
  if (city) {
    (await cookies()).set(CITY_COOKIE, String(city.id), {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
  }
  done(str(fd, "returnTo") ?? "/settings?saved=1");
}

export async function addCity(fd: FormData) {
  await requireAdmin();
  const name = str(fd, "name");
  if (name) await db.insert(s.cities).values({ name });
  done("/settings?saved=1");
}

export async function setUserCity(fd: FormData) {
  await requireAdmin();
  await db.update(s.users).set({ cityId: num(fd, "cityId") }).where(eq(s.users.id, num(fd, "id")!));
  done("/settings?saved=1");
}

// =============== Settings ===============
export async function addLocation(fd: FormData) {
  await requireUser();
  // A clinic location belongs to the city you're currently working in.
  await db.insert(s.locations).values({
    name: str(fd, "name") ?? "New Location",
    address: str(fd, "address"),
    cityId: num(fd, "cityId") ?? (await activeCityId()),
  });
  done("/settings");
}

export async function toggleLocation(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  const loc = await db.query.locations.findFirst({ where: eq(s.locations.id, id) });
  await db.update(s.locations).set({ active: !loc?.active }).where(eq(s.locations.id, id));
  done("/settings");
}

export async function saveGoals(fd: FormData) {
  await requireUser();
  const goals = await db.query.reportGoals.findMany();
  for (const g of goals) {
    const target = num(fd, `goal_${g.id}`);
    if (target !== null) {
      await db.update(s.reportGoals).set({ weeklyTarget: target }).where(eq(s.reportGoals.id, g.id));
    }
  }
  done("/settings");
}

export async function addTag(fd: FormData) {
  await requireUser();
  const name = str(fd, "name");
  if (name) await db.insert(s.tags).values({ name }).onConflictDoNothing();
  done("/settings");
}

export async function deleteTag(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await db.delete(s.accountTags).where(eq(s.accountTags.tagId, id));
  await db.delete(s.contactTags).where(eq(s.contactTags.tagId, id));
  await db.delete(s.tags).where(eq(s.tags.id, id));
  done("/settings");
}

export async function updateProfile(fd: FormData) {
  await requireUser();
  const user = await requireUser();
  const name = str(fd, "name");
  const newPassword = str(fd, "newPassword");
  const currentPassword = str(fd, "currentPassword");
  const set: Partial<typeof s.users.$inferInsert> = {};
  if (name) set.name = name;
  if (newPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      redirect("/settings?error=password");
    }
    set.passwordHash = hashPassword(newPassword);
  }
  if (Object.keys(set).length) await db.update(s.users).set(set).where(eq(s.users.id, user.id));
  done("/settings?saved=1");
}

// =============== Projects ===============
function projectValues(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Untitled Project",
    description: str(fd, "description"),
    status: str(fd, "status") ?? "Active",
    nextStep: str(fd, "nextStep"),
    targetDate: str(fd, "targetDate"),
    accountId: num(fd, "accountId"),
  };
}

export async function createProject(fd: FormData) {
  const [row] = await db.insert(s.projects).values({ ...projectValues(fd), ...(await stamp()) }).returning();
  done(`/projects/${row.id}`);
}

export async function updateProject(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.projects, id);
  await db.update(s.projects).set(projectValues(fd)).where(eq(s.projects.id, id));
  done(`/projects/${id}`);
}

export async function setProjectStatus(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await assertOwned(s.projects, id);
  await db.update(s.projects).set({ status: str(fd, "status") ?? "Active" }).where(eq(s.projects.id, id));
  done(`/projects/${id}`);
}

// =============== Documents ===============
const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8 MB — flyers, PDFs, images

export async function uploadDocument(fd: FormData) {
  await requireUser();
  const file = fd.get("file") as File | null;
  const returnTo = str(fd, "returnTo") ?? "/documents";
  if (!file || file.size === 0) redirect(`${returnTo}?docerror=missing`);
  if (file!.size > MAX_DOC_BYTES) redirect(`${returnTo}?docerror=toobig`);

  const data = Buffer.from(await file!.arrayBuffer());
  await db.insert(s.documents).values({
    name: str(fd, "name") ?? file!.name.replace(/\.[^.]+$/, ""),
    fileName: file!.name,
    mimeType: file!.type || "application/octet-stream",
    size: file!.size,
    data,
    folderId: num(fd, "folderId"),
    projectId: num(fd, "projectId"),
    campaignId: num(fd, "campaignId"),
    accountId: num(fd, "accountId"),
  });
  done(returnTo);
}

export async function deleteDocument(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await db.delete(s.documents).where(eq(s.documents.id, id));
  done(str(fd, "returnTo") ?? "/documents");
}

// ---- Document folders ----
export async function createFolder(fd: FormData) {
  await requireUser();
  const name = str(fd, "name");
  if (!name) done(str(fd, "returnTo") ?? "/documents");
  const [row] = await db.insert(s.documentFolders).values({ name: name! }).returning();
  done(`/documents?folder=${row.id}`);
}

export async function renameFolder(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  const name = str(fd, "name");
  if (name) await db.update(s.documentFolders).set({ name }).where(eq(s.documentFolders.id, id));
  done(`/documents?folder=${id}`);
}

/** Deleting a folder never deletes files — they fall back to Unfiled. */
export async function deleteFolder(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await db.update(s.documents).set({ folderId: null }).where(eq(s.documents.folderId, id));
  await db.delete(s.documentFolders).where(eq(s.documentFolders.id, id));
  done("/documents");
}

export async function moveDocument(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
  await db.update(s.documents).set({ folderId: num(fd, "folderId") }).where(eq(s.documents.id, id));
  done(str(fd, "returnTo") ?? "/documents");
}

// =============== Team / users (admin only) ===============
export async function addUser(fd: FormData) {
  await requireAdmin();
  const email = str(fd, "email")?.toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const role = str(fd, "role") === "admin" ? "admin" : "user";
  if (!email || !name || !password || password.length < 8) {
    redirect("/settings?error=userinput");
  }
  const existing = await db.query.users.findFirst({ where: eq(s.users.email, email!) });
  if (existing) redirect("/settings?error=userexists");
  await db.insert(s.users).values({
    email: email!, name: name!, passwordHash: hashPassword(password!), role,
    // Which market they work. Non-admins are locked to it.
    cityId: num(fd, "cityId") ?? (await activeCityId()),
  });
  done("/settings?saved=1");
}

export async function deleteUser(fd: FormData) {
  const me = await requireAdmin();
  const id = num(fd, "id")!;
  if (id === me.id) redirect("/settings?error=self");
  await db.delete(s.users).where(eq(s.users.id, id));
  done("/settings?saved=1");
}

export async function setUserRole(fd: FormData) {
  const me = await requireAdmin();
  const id = num(fd, "id")!;
  if (id === me.id) redirect("/settings?error=self"); // can't demote yourself — keeps at least one admin
  const role = str(fd, "role") === "admin" ? "admin" : "user";
  await db.update(s.users).set({ role }).where(eq(s.users.id, id));
  done("/settings?saved=1");
}

// =============== Today's Focus ===============
/**
 * Marks a Today's Focus item done by clearing whatever put it on the list —
 * so the item disappears because the underlying record changed, not because
 * anything was hidden.
 *
 * Only the three completable targets are accepted. Upcoming-event reminders
 * and drop box pickups deliberately have no Done: the first is a heads-up that
 * expires on its own, the second must record how many cards were collected.
 */
export async function completeFocusItem(fd: FormData) {
  const target = str(fd, "target");
  const id = num(fd, "id")!;

  if (target === "task") {
    await assertOwned(s.tasks, id);
    await db.update(s.tasks)
      .set({ status: "Completed", completedAt: nowISO() })
      .where(eq(s.tasks.id, id));
  } else if (target === "opportunityFollowUp") {
    await assertOwned(s.opportunities, id);
    // The follow-up happened; the opportunity itself stays open.
    await db.update(s.opportunities).set({ nextFollowUpAt: null }).where(eq(s.opportunities.id, id));
  } else if (target === "eventFollowUp") {
    await assertOwned(s.events, id);
    await db.update(s.events)
      .set({ followUpRequired: false, followUpDueAt: null })
      .where(eq(s.events.id, id));
  }

  done(str(fd, "returnTo") ?? "/");
}

// =============== Deleting records ===============
//
// Deleting never silently destroys history. Rows that merely *point* at the
// record (activities, tasks, opportunities…) are detached — they survive with
// the link cleared. Rows that cannot exist without it (the partner record, tag
// links, whose FK is NOT NULL) are removed alongside it. Callers see both
// counts before confirming.

// `field` is the Drizzle property name (what .set() expects); `col` is the
// column object (what .where() expects). Both are needed.
type SoftRef = { col: SQLiteColumn; table: SQLiteTable; field: string; label: string };
type HardRef = SoftRef;

const DELETE_PLAN: Record<string, { detach: SoftRef[]; remove: HardRef[] }> = {
  account: {
    detach: [
      { table: s.contacts, col: s.contacts.accountId, field: "accountId", label: "contacts" },
      { table: s.opportunities, col: s.opportunities.accountId, field: "accountId", label: "opportunities" },
      { table: s.events, col: s.events.accountId, field: "accountId", label: "events" },
      { table: s.activities, col: s.activities.accountId, field: "accountId", label: "activities" },
      { table: s.tasks, col: s.tasks.accountId, field: "accountId", label: "tasks" },
      { table: s.campaigns, col: s.campaigns.accountId, field: "accountId", label: "campaigns" },
      { table: s.appointments, col: s.appointments.accountId, field: "accountId", label: "appointments" },
      { table: s.leads, col: s.leads.accountId, field: "accountId", label: "leads" },
      { table: s.projects, col: s.projects.accountId, field: "accountId", label: "projects" },
      { table: s.documents, col: s.documents.accountId, field: "accountId", label: "documents" },
    ],
    // partners.accountId and account_tags.accountId are NOT NULL — they cannot
    // be detached, so they go with the business.
    remove: [
      { table: s.partners, col: s.partners.accountId, field: "accountId", label: "partner record" },
      { table: s.accountTags, col: s.accountTags.accountId, field: "accountId", label: "tag links" },
    ],
  },
  contact: {
    detach: [
      { table: s.opportunities, col: s.opportunities.contactId, field: "contactId", label: "opportunities" },
      { table: s.events, col: s.events.contactId, field: "contactId", label: "events" },
      { table: s.activities, col: s.activities.contactId, field: "contactId", label: "activities" },
      { table: s.tasks, col: s.tasks.contactId, field: "contactId", label: "tasks" },
      { table: s.appointments, col: s.appointments.contactId, field: "contactId", label: "appointments" },
      { table: s.partners, col: s.partners.mainContactId, field: "mainContactId", label: "partner main-contact links" },
    ],
    remove: [{ table: s.contactTags, col: s.contactTags.contactId, field: "contactId", label: "tag links" }],
  },
  lead: {
    detach: [
      { table: s.activities, col: s.activities.leadId, field: "leadId", label: "activities" },
      { table: s.appointments, col: s.appointments.leadId, field: "leadId", label: "appointments" },
    ],
    remove: [],
  },
  opportunity: {
    detach: [
      { table: s.events, col: s.events.opportunityId, field: "opportunityId", label: "events" },
      { table: s.activities, col: s.activities.opportunityId, field: "opportunityId", label: "activities" },
      { table: s.tasks, col: s.tasks.opportunityId, field: "opportunityId", label: "tasks" },
    ],
    remove: [],
  },
  event: {
    detach: [
      { table: s.activities, col: s.activities.eventId, field: "eventId", label: "activities" },
      { table: s.tasks, col: s.tasks.eventId, field: "eventId", label: "tasks" },
      { table: s.leads, col: s.leads.eventId, field: "eventId", label: "leads" },
      { table: s.appointments, col: s.appointments.eventId, field: "eventId", label: "appointments" },
    ],
    remove: [],
  },
  campaign: {
    detach: [
      { table: s.events, col: s.events.campaignId, field: "campaignId", label: "events" },
      { table: s.activities, col: s.activities.campaignId, field: "campaignId", label: "activities" },
      { table: s.leads, col: s.leads.campaignId, field: "campaignId", label: "leads" },
      { table: s.appointments, col: s.appointments.campaignId, field: "campaignId", label: "appointments" },
      { table: s.opportunities, col: s.opportunities.campaignId, field: "campaignId", label: "opportunities" },
      { table: s.documents, col: s.documents.campaignId, field: "campaignId", label: "documents" },
    ],
    remove: [],
  },
  partner: {
    detach: [
      { table: s.events, col: s.events.partnerId, field: "partnerId", label: "events" },
      { table: s.activities, col: s.activities.partnerId, field: "partnerId", label: "activities" },
      { table: s.leads, col: s.leads.partnerId, field: "partnerId", label: "leads" },
      { table: s.appointments, col: s.appointments.partnerId, field: "partnerId", label: "appointments" },
    ],
    remove: [],
  },
  project: {
    detach: [
      { table: s.activities, col: s.activities.projectId, field: "projectId", label: "activities" },
      { table: s.tasks, col: s.tasks.projectId, field: "projectId", label: "tasks" },
      { table: s.documents, col: s.documents.projectId, field: "projectId", label: "documents" },
    ],
    remove: [],
  },
};

const MAIN_TABLE: Record<string, SQLiteTable & { id: SQLiteColumn; cityId: SQLiteColumn }> = {
  account: s.accounts, contact: s.contacts, lead: s.leads, opportunity: s.opportunities,
  event: s.events, campaign: s.campaigns, partner: s.partners, project: s.projects,
};

/** What deleting this record would touch — powers the confirmation screen. */
export async function deletionImpact(kind: string, id: number) {
  const plan = DELETE_PLAN[kind];
  if (!plan) return { detach: [], remove: [] };
  const tally = async (r: SoftRef) =>
    Number((await db.select({ c: count() }).from(r.table).where(eq(r.col, id)))[0]?.c ?? 0);
  const detach = [] as { label: string; n: number }[];
  const remove = [] as { label: string; n: number }[];
  for (const r of plan.detach) { const n = await tally(r); if (n) detach.push({ label: r.label, n }); }
  for (const r of plan.remove) { const n = await tally(r); if (n) remove.push({ label: r.label, n }); }
  return { detach, remove };
}

/** Detach soft references, remove dependent rows, delete the record.
 *  Internal — callers must have already authorized the id. */
async function deleteViaPlan(kind: string, id: number) {
  const table = MAIN_TABLE[kind];
  const plan = DELETE_PLAN[kind];
  if (!table || !plan) return;
  for (const r of plan.detach) {
    await db.update(r.table).set({ [r.field]: null } as never).where(eq(r.col, id));
  }
  for (const r of plan.remove) await db.delete(r.table).where(eq(r.col, id));
  await db.delete(table).where(eq(table.id, id));
}

export async function deleteRecord(fd: FormData) {
  const kind = str(fd, "kind") ?? "";
  const id = num(fd, "id")!;
  const table = MAIN_TABLE[kind];
  if (!table || !DELETE_PLAN[kind]) redirect("/");
  await assertOwned(table, id); // same city / admin, or it throws
  await deleteViaPlan(kind, id);
  done(str(fd, "returnTo") ?? LIST_PATH[kind] ?? "/");
}

const LIST_PATH: Record<string, string> = {
  account: "/accounts", contact: "/contacts", lead: "/leads", opportunity: "/opportunities",
  event: "/events", campaign: "/campaigns", partner: "/partners", project: "/projects",
};

// =============== CSV import (accounts & contacts) ===============
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.length)) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.length)) rows.push(row);
  return rows;
}

/** Identity for duplicate detection. Deliberately name + phone + email, not
 *  name alone: the same business can legitimately appear twice with different
 *  contact details (e.g. on both a partners list and a leads list), and those
 *  are distinct records. Phone is reduced to digits so reformatting between
 *  exports ("+1 505 555 0100" vs "5055550100") still matches. */
const normText = (v: string | null) => (v ?? "").trim().toLowerCase();
const normPhone = (v: string | null) => (v ?? "").replace(/\D/g, "");
const accountKey = (name: string, phone: string | null, email: string | null) =>
  `${normText(name)}|${normPhone(phone)}|${normText(email)}`;
const contactKey = (first: string, last: string, phone: string | null, email: string | null) =>
  `${normText(first)}|${normText(last)}|${normPhone(phone)}|${normText(email)}`;

export async function importCSV(fd: FormData) {
  const own = await stamp(); // imports land in the city you're working in
  const entity = str(fd, "entity");
  const file = fd.get("file") as File | null;
  if (!file || !entity) done("/settings/import?error=missing");
  const rows = parseCSV(await file!.text());
  if (rows.length < 2) done("/settings/import?error=empty");
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const get = (r: string[], ...names: string[]) => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx >= 0 && r[idx]?.trim()) return r[idx].trim();
    }
    return null;
  };

  // Everything already on file, fetched once. Rows are added as we go, so a
  // file containing its own duplicates is caught too — not just re-imports.
  const seen = new Set<string>();
  const cityFilter = own.cityId ? eq(s.accounts.cityId, own.cityId) : undefined;

  let imported = 0, skipped = 0;
  if (entity === "accounts") {
    const existing = await db
      .select({ name: s.accounts.name, phone: s.accounts.phone, email: s.accounts.email })
      .from(s.accounts).where(cityFilter);
    for (const a of existing) seen.add(accountKey(a.name, a.phone, a.email));

    for (const r of rows.slice(1)) {
      const name = get(r, "name", "businessname", "business", "company");
      if (!name) continue;
      const phone = get(r, "phone", "phonenumber");
      const email = get(r, "email");
      const key = accountKey(name, phone, email);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      await db.insert(s.accounts).values({
        name,
        vertical: get(r, "vertical", "industry", "type") ?? "Other",
        area: get(r, "area", "location") ?? "Other",
        address: get(r, "address"),
        website: get(r, "website", "url"),
        phone,
        email,
        status: get(r, "status") ?? "New Prospect",
        source: get(r, "source") ?? "CSV Import",
        notes: get(r, "notes"),
        ...own,
      });
      imported++;
    }
  } else if (entity === "contacts") {
    const existing = await db
      .select({ firstName: s.contacts.firstName, lastName: s.contacts.lastName,
                phone: s.contacts.phone, email: s.contacts.email })
      .from(s.contacts).where(own.cityId ? eq(s.contacts.cityId, own.cityId) : undefined);
    for (const c of existing) seen.add(contactKey(c.firstName, c.lastName, c.phone, c.email));

    for (const r of rows.slice(1)) {
      const first = get(r, "firstname", "first");
      const full = get(r, "name", "fullname");
      if (!first && !full) continue;
      const [f, ...rest] = (first ?? full!).split(" ");
      const firstName = first ?? f;
      const lastName = get(r, "lastname", "last") ?? (first ? "" : rest.join(" "));
      const phone = get(r, "phone", "phonenumber");
      const email = get(r, "email");
      const key = contactKey(firstName, lastName, phone, email);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      await db.insert(s.contacts).values({
        firstName,
        lastName,
        title: get(r, "title", "role"),
        phone,
        email,
        contactType: get(r, "contacttype", "type") ?? "Other",
        source: get(r, "source") ?? "CSV Import",
        notes: get(r, "notes"),
        ...own,
      });
      imported++;
    }
  }
  done(`/settings/import?imported=${imported}&skipped=${skipped}`);
}
