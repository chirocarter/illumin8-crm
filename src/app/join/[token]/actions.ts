"use server";

// PUBLIC action — the one mutation that runs without a signed-in user.
// It can only create a lead (and, for business-intake campaigns, the
// business record it belongs to), and only against a valid campaign token.
import { redirect } from "next/navigation";
import { db, schema as s, writeAtomically } from "@/db";
import { and, eq, like } from "drizzle-orm";
import { normalizePublicForm, isScreeningForm, SCREENING_SYMPTOMS } from "@/lib/taxonomy";
import { formatPhone, phoneKey } from "@/lib/phone";
import { screeningState } from "@/lib/screening-intake";

const clean = (fd: FormData, key: string, max: number) =>
  String(fd.get(key) ?? "").trim().slice(0, max);

type Campaign = typeof s.campaigns.$inferSelect;

/**
 * The two screening intake forms. Always a lead (source "Screening", attributed
 * to the campaign AND its event); for "pick a time", also one booking on the
 * campaign's time sheet.
 *
 * CAPACITY is enforced by the booking insert itself: it only writes a row while
 * the window has fewer bookings than the campaign allows, in one statement, so
 * two people taking the last spot at the same moment can't both get it. The
 * loser's lead is removed again and they're asked to pick another time — a
 * lead that claimed a window it didn't get would mislead whoever calls them.
 */
async function submitScreening(fd: FormData, campaign: Campaign, token: string, person: {
  firstName: string; lastName: string; phone: string | null; email: string;
}) {
  const { firstName, lastName, phone, email } = person;
  if (fd.get("confirm") !== "yes" || !firstName || !lastName || phoneKey(phone).length < 7) {
    redirect(`/join/${token}?error=1`);
  }

  const state = await screeningState(campaign);
  if (state.closed) redirect(`/join/${token}`); // the page explains why

  // Only boxes from the fixed list are kept. This is not a health record: no
  // free text, nothing beyond which of these were ticked.
  const symptoms = fd.getAll("symptom").map(String)
    .filter((v) => (SCREENING_SYMPTOMS as readonly string[]).includes(v));

  let slot: string | null = null;
  let waitlist = false;
  if (state.windows.length) {
    const picked = state.windows.find((w) => w.start === clean(fd, "slot", 30));
    // A window that looks full here may still free up or fill before the
    // insert — the insert decides, not this snapshot.
    if (picked) slot = picked.start;
    else if (state.windows.some((w) => !w.full)) redirect(`/join/${token}?error=pick`);
    else waitlist = true;
  }

  const own = { cityId: campaign.cityId, userId: campaign.userId };
  const bits = [`Wants to take part in the spinal health screening${state.event ? ` at ${state.event.name}` : ""}`];
  if (symptoms.length) bits.push(`Symptoms: ${symptoms.join(", ")}`);
  if (waitlist) bits.push("Waitlist — every screening time was full");

  const [lead] = await db.insert(s.leads).values({
    firstName, lastName,
    phone: phone || null,
    email: email || null,
    source: "Screening",
    campaignId: campaign.id,
    eventId: campaign.eventId,   // counts for the event, and its host in the Partner Report
    accountId: campaign.accountId,
    interestLevel: "Warm",
    apptStatus: "Not Contacted",
    notes: `Self-submitted via spinal health screening sign-up (${campaign.name}) — ${bits.join(" · ")}`,
    ...own,
  }).returning({ id: s.leads.id });

  if (slot) {
    const [booked] = await writeAtomically([{
      sql: `INSERT INTO screening_bookings (campaign_id, lead_id, slot_start, city_id, user_id)
            SELECT ?, ?, ?, ?, ?
            WHERE (SELECT count(*) FROM screening_bookings WHERE campaign_id = ? AND slot_start = ?) < ?`,
      args: [campaign.id, lead.id, slot, own.cityId, own.userId, campaign.id, slot, Math.max(1, campaign.slotCapacity)],
    }]);
    if (!booked) {
      await db.delete(s.leads).where(eq(s.leads.id, lead.id));
      redirect(`/join/${token}?error=slot`);
    }
  }

  redirect(`/join/thanks?f=screening${slot ? `&t=${encodeURIComponent(slot)}` : ""}${waitlist ? "&w=1" : ""}`);
}

export async function submitPublicLead(fd: FormData) {
  // Honeypot: real people never fill a hidden "company" field
  if (clean(fd, "company", 10).length > 0) redirect("/join/thanks");

  const token = clean(fd, "token", 40);
  const campaign = token
    ? await db.query.campaigns.findFirst({ where: eq(s.campaigns.publicToken, token) })
    : null;
  if (!campaign) redirect("/join/thanks"); // silently drop bad tokens

  const formType = normalizePublicForm(campaign!.publicForm);
  const isBusiness = formType === "partnership" || formType === "lunch";
  const isContact = formType === "contact";

  // There's no session here, so ownership is inherited from the campaign whose
  // QR code was scanned: its city, and whoever created it.
  const own = { cityId: campaign!.cityId, userId: campaign!.userId };

  const detailBits: string[] = [];

  const firstName = clean(fd, "firstName", 80);
  const lastName = clean(fd, "lastName", 80);
  const phone = formatPhone(clean(fd, "phone", 40));
  const email = clean(fd, "email", 120);

  if (isScreeningForm(formType)) {
    return submitScreening(fd, campaign!, token, { firstName, lastName, phone, email });
  }

  // The general contact form promises a call back, so a phone number is the one
  // thing it can't do without. Seven digits rules out "n/a" and similar while
  // still accepting an international number, which formatPhone leaves as typed.
  // The other forms keep their original rule: a name plus any way to reach you.
  if (isContact) {
    if (!firstName || phoneKey(phone).length < 7) redirect(`/join/${token}?error=1`);
  } else if (!firstName || (!phone && !email)) {
    redirect(`/join/${token}?error=1`);
  }

  if (isContact) {
    // First in the notes, so whoever calls back sees it before anything else.
    // Only a ticked box is recorded: an unticked one can't tell "no" from "skipped".
    if (fd.get("existingPatient") === "yes") detailBits.push("Already an Illumin8 patient");
    const message = clean(fd, "message", 1000);
    if (message) detailBits.push(`Question / comment: ${message}`);
  }

  let accountId = campaign!.accountId;

  if (isBusiness) {
    const businessName = clean(fd, "businessName", 120);
    if (!businessName) redirect(`/join/${token}?error=1`);

    const role = clean(fd, "role", 80);
    if (role) detailBits.push(`Role: ${role}`);

    if (formType === "partnership") {
      const interests = fd.getAll("interest").map((v) => String(v).trim()).filter(Boolean).slice(0, 6);
      const message = clean(fd, "message", 500);
      if (interests.length) detailBits.push(`Interested in: ${interests.join(", ")}`);
      if (message) detailBits.push(`Message: ${message}`);
    } else {
      // lunch & learn
      const employees = clean(fd, "employees", 20);
      const meetingSpace = clean(fd, "meetingSpace", 20);
      const timeframe = clean(fd, "timeframe", 40);
      if (employees) detailBits.push(`Team size: ${employees}`);
      if (meetingSpace) detailBits.push(`Room for lunch & learn: ${meetingSpace}`);
      if (timeframe) detailBits.push(`Timeframe: ${timeframe}`);
    }

    // Reuse the business if we already know it in this city (SQLite LIKE =
    // case-insensitive). Same-named businesses in another market stay separate.
    const existing = await db.query.accounts.findFirst({
      where: own.cityId
        ? and(like(s.accounts.name, businessName), eq(s.accounts.cityId, own.cityId))
        : like(s.accounts.name, businessName),
    });
    if (existing) {
      accountId = existing.id;
    } else {
      const [acct] = await db.insert(s.accounts).values({
        name: businessName,
        status: formType === "partnership" ? "Partner Candidate" : "Interested",
        source: `QR Code (${campaign!.name})`,
        ownerName: `${firstName} ${lastName}`.trim(),
        phone: phone || null,
        email: email || null,
        notes: `Self-submitted via ${formType === "partnership" ? "partnership" : "lunch & learn"} QR form.${detailBits.length ? " " + detailBits.join(" · ") : ""}`,
        ...own,
      }).returning();
      accountId = acct.id;
    }

    // The person who filled it in becomes a contact at that business (once).
    if (accountId) {
      const dupe = await db.query.contacts.findFirst({
        where: and(eq(s.contacts.accountId, accountId), like(s.contacts.firstName, firstName), like(s.contacts.lastName, lastName)),
      });
      if (!dupe) {
        await db.insert(s.contacts).values({
          firstName,
          lastName,
          title: role || null,
          accountId,
          phone: phone || null,
          email: email || null,
          contactType: /owner/i.test(role) ? "Owner" : /hr/i.test(role) ? "HR" : /manager/i.test(role) ? "Manager" : "Other",
          source: `QR Code (${campaign!.name})`,
          ...own,
        });
      }
    }
  }

  await db.insert(s.leads).values({
    firstName,
    lastName,
    phone: phone || null,
    email: email || null,
    source: "QR Code",
    campaignId: campaign!.id,
    accountId,
    preferredLocationId: (() => {
      const n = Number(fd.get("preferredLocationId"));
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    interestLevel: "Warm",
    apptStatus: "Not Contacted",
    notes: `Self-submitted via ${isContact ? "general contact form" : "QR sign-up"} (${campaign!.name})${detailBits.length ? " — " + detailBits.join(" · ") : ""}`,
    ...own,
  });

  // The thank-you copy differs: a contact form isn't a sign-up to be scheduled.
  redirect(isContact ? "/join/thanks?f=contact" : "/join/thanks");
}
