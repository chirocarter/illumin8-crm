"use server";

// All mutations live here. Every action revalidates the whole app (single-user
// tool — simplicity over cache micro-management) and redirects to the record.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { nowISO, todayISO, addDays } from "@/lib/dates";
import { hashPassword, requireAdmin, requireUser, verifyPassword } from "@/lib/auth";
import { normalizePublicForm } from "@/lib/taxonomy";
import { activeCityId, CITY_COOKIE } from "@/lib/scope";

/**
 * City + owner stamped onto every record created here: the city the user is
 * currently working in, and the user themselves. Also enforces the session, so
 * an action that stamps doesn't need a separate requireUser().
 */
async function stamp(): Promise<{ cityId: number | null; userId: number }> {
  const user = await requireUser();
  return { cityId: await activeCityId(), userId: user.id };
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
      phone: str(fd, "newContactPhone"),
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
  await db.update(s.partners).set(partnerValues(fd)).where(eq(s.partners.id, id));
  done(`/partners/${id}`);
}

/** Quick action: log a drop box pickup — updates counters and schedules the next one. */
export async function recordDropBoxPickup(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
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
  await db.update(s.leads).set(leadValues(fd)).where(eq(s.leads.id, id));
  done(`/leads/${id}`);
}

/** Promote a lead to a full contact (e.g. a screening lead who turns out to be
    an office manager). Copies their info, keeps the lead for attribution. */
export async function convertLeadToContact(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
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
  const values = apptValues(fd);
  await db.update(s.appointments).set(values).where(eq(s.appointments.id, id));
  await syncLead(values.leadId, values.status);
  done(str(fd, "returnTo") ?? "/appointments");
}

export async function setAppointmentStatus(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
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
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
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
  await db.update(s.projects).set(projectValues(fd)).where(eq(s.projects.id, id));
  done(`/projects/${id}`);
}

export async function setProjectStatus(fd: FormData) {
  await requireUser();
  const id = num(fd, "id")!;
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

  let imported = 0;
  if (entity === "accounts") {
    for (const r of rows.slice(1)) {
      const name = get(r, "name", "businessname", "business", "company");
      if (!name) continue;
      await db.insert(s.accounts).values({
        name,
        vertical: get(r, "vertical", "industry", "type") ?? "Other",
        area: get(r, "area", "location") ?? "Other",
        address: get(r, "address"),
        website: get(r, "website", "url"),
        phone: get(r, "phone", "phonenumber"),
        email: get(r, "email"),
        status: get(r, "status") ?? "New Prospect",
        source: get(r, "source") ?? "CSV Import",
        notes: get(r, "notes"),
        ...own,
      });
      imported++;
    }
  } else if (entity === "contacts") {
    for (const r of rows.slice(1)) {
      const first = get(r, "firstname", "first");
      const full = get(r, "name", "fullname");
      if (!first && !full) continue;
      const [f, ...rest] = (first ?? full!).split(" ");
      await db.insert(s.contacts).values({
        firstName: first ?? f,
        lastName: get(r, "lastname", "last") ?? (first ? "" : rest.join(" ")),
        title: get(r, "title", "role"),
        phone: get(r, "phone", "phonenumber"),
        email: get(r, "email"),
        contactType: get(r, "contacttype", "type") ?? "Other",
        source: get(r, "source") ?? "CSV Import",
        notes: get(r, "notes"),
        ...own,
      });
      imported++;
    }
  }
  done(`/settings/import?imported=${imported}`);
}
