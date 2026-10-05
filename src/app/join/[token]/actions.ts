"use server";

// PUBLIC action — the one mutation that runs without a signed-in user.
// It can only create a lead (and, for business-intake campaigns, the
// business record it belongs to), and only against a valid campaign token.
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { and, eq, like } from "drizzle-orm";
import { normalizePublicForm } from "@/lib/taxonomy";
import { formatPhone, phoneKey } from "@/lib/phone";

const clean = (fd: FormData, key: string, max: number) =>
  String(fd.get(key) ?? "").trim().slice(0, max);

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
    partnerId: campaign!.partnerId,
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
