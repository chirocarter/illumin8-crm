// Seeds realistic Illumin8 outreach data. All dates are relative to "today"
// so the dashboard and reports look alive whenever you run this.
// Works against the local file or Turso — same env switch as the app.
import { randomBytes, scryptSync } from "crypto";
import { count } from "drizzle-orm";
import * as s from "./schema";
import { loadEnvLocal } from "./env";

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** days offset from today at a given hour (negative = past) */
function day(offset: number, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return iso(d);
}
function dayOnly(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  loadEnvLocal();
  const { db } = await import("./index");

  const [existing] = await db.select({ c: count() }).from(s.users);
  if (Number(existing.c) > 0) {
    console.log("Database already seeded — run `npm run db:reset` to start fresh (local only).");
    return;
  }

  // ---- City + user + locations ----
  // Cities contain clinic locations. Everything seeded below is Albuquerque's;
  // the stamping pass at the end of this file assigns it.
  const [abq] = await db.insert(s.cities).values({ name: "Albuquerque" }).returning();

  await db.insert(s.users).values({
    email: "carter@illumin8chiro.com",
    name: "Carter",
    passwordHash: hashPassword("illumin8"),
    role: "admin",
    cityId: abq.id,
  });

  const [neHeights, westside, downtown] = await db.insert(s.locations).values([
    { name: "NE Heights", address: "Albuquerque NE Heights", cityId: abq.id },
    { name: "Westside", address: "Albuquerque Westside", cityId: abq.id },
    { name: "Downtown", address: "Albuquerque Downtown", cityId: abq.id },
  ]).returning();

  // ---- Tags ----
  const tagRows = await db.insert(s.tags).values([
    { name: "Hot Lead" }, { name: "Drop Box Host" }, { name: "Near Clinic" },
    { name: "Chamber Member" }, { name: "Referral Source" },
  ]).returning();
  const tagId = (name: string) => tagRows.find((t) => t.name === name)!.id;

  // ---- Accounts ----
  const accountRows = await db.insert(s.accounts).values([
    { name: "CrossFit ABQ", vertical: "Gym", area: "NE Heights", address: "3300 Menaul Blvd NE, Albuquerque", phone: "(505) 555-0142", email: "info@crossfitabq.com", website: "https://crossfitabq.com", status: "Active Partner", source: "In-Person Visit", ownerName: "Danny Ortega", clinicLocationId: neHeights.id, partnershipScore: 5, eventScore: 5, relationshipStrength: "Strong", lastContactedAt: day(-2, 14), nextFollowUpAt: dayOnly(5), notes: "Quarterly screening days. Danny loves the posture screenings — members ask for them." },
    { name: "Mario's Pizzeria", vertical: "Restaurant", area: "NE Heights", address: "2401 San Pedro Dr NE, Albuquerque", phone: "(505) 555-0177", email: "office@mariosabq.com", status: "Active Partner", source: "Drop Box Visit", ownerName: "Mario Sanchez", clinicLocationId: neHeights.id, partnershipScore: 5, eventScore: 3, relationshipStrength: "Strong", lastContactedAt: day(-3, 12), nextFollowUpAt: dayOnly(3), notes: "Drop box on the host stand. Pickup every Friday. Team lunch prize = $120 catering order." },
    { name: "Johnny's Pizza", vertical: "Restaurant", area: "Westside", address: "10200 Coors Blvd NW, Albuquerque", phone: "(505) 555-0119", email: "johnny@johnnyspizzaabq.com", status: "Active Partner", source: "Referral", ownerName: "Johnny Trujillo", clinicLocationId: westside.id, partnershipScore: 4, eventScore: 3, relationshipStrength: "Warm", lastContactedAt: day(-6, 11), nextFollowUpAt: dayOnly(1), notes: "Newer drop box — needs weekly check-ins to keep cards flowing." },
    { name: "Sandia Peak Dental", vertical: "Dental", area: "NE Heights", address: "8100 Wyoming Blvd NE, Albuquerque", phone: "(505) 555-0155", email: "frontdesk@sandiapeakdental.com", status: "Interested", source: "Phone Call", ownerName: "Dr. Melissa Chan", clinicLocationId: neHeights.id, partnershipScore: 4, eventScore: 5, relationshipStrength: "Warm", lastContactedAt: day(-1, 15), nextFollowUpAt: dayOnly(0), notes: "Hygienists complain of neck/shoulder strain — perfect ergonomics talk audience." },
    { name: "Rio Grande Credit Union", vertical: "Corporate Office", area: "Downtown", address: "301 Gold Ave SW, Albuquerque", phone: "(505) 555-0163", email: "hr@rgcu.org", status: "Interested", source: "Email", ownerName: "Patricia Vigil (HR)", clinicLocationId: downtown.id, partnershipScore: 4, eventScore: 5, relationshipStrength: "Warm", lastContactedAt: day(-2, 10), nextFollowUpAt: dayOnly(2), notes: "HR runs a monthly wellness hour — wants us for the next one." },
    { name: "Desert Bloom Wellness Spa", vertical: "Wellness", area: "NE Heights", address: "6600 Academy Rd NE, Albuquerque", phone: "(505) 555-0136", email: "hello@desertbloomspa.com", status: "Partner Candidate", source: "Networking", ownerName: "Alicia Romero", clinicLocationId: neHeights.id, partnershipScore: 4, eventScore: 3, relationshipStrength: "Warm", lastContactedAt: day(-8, 13), nextFollowUpAt: dayOnly(-2), notes: "Cross-referral potential. Wants co-branded open house in the fall." },
    { name: "ABQ Coworking Collective", vertical: "Corporate Office", area: "Downtown", address: "500 2nd St NW, Albuquerque", phone: "(505) 555-0128", email: "community@abqcowork.com", status: "Contacted", source: "In-Person Visit", ownerName: "Sam Whitfield", clinicLocationId: downtown.id, partnershipScore: 3, eventScore: 4, relationshipStrength: "Cold", lastContactedAt: day(-4, 9), nextFollowUpAt: dayOnly(4), notes: "80+ members. Monthly community lunch — good lunch-and-learn slot." },
    { name: "Westside Family Dental", vertical: "Dental", area: "Westside", address: "5900 Coors Blvd NW, Albuquerque", phone: "(505) 555-0191", email: "office@westsidefamilydental.com", status: "Follow-Up Needed", source: "Phone Call", ownerName: "Dr. Aaron Yazzie", clinicLocationId: westside.id, partnershipScore: 3, eventScore: 4, relationshipStrength: "Cold", lastContactedAt: day(-9, 14), nextFollowUpAt: dayOnly(-1), notes: "Office manager gatekeeps hard. Try Dr. Yazzie directly on Thursdays." },
    { name: "Duke City Movers", vertical: "Manual Labor", area: "Other", address: "4500 Edith Blvd NE, Albuquerque", phone: "(505) 555-0104", email: "dispatch@dukecitymovers.com", status: "Contacted", source: "Phone Call", ownerName: "Ray Baca", clinicLocationId: neHeights.id, partnershipScore: 3, eventScore: 3, relationshipStrength: "Cold", lastContactedAt: day(-5, 16), nextFollowUpAt: dayOnly(6), notes: "Crew of 30 — back strain is their #1 injury. Owner open to a safety-day talk." },
    { name: "Iron Tribe Fitness Westside", vertical: "Gym", area: "Westside", address: "9650 Coors Bypass NW, Albuquerque", phone: "(505) 555-0187", email: "coach@irontribewestside.com", status: "Interested", source: "Referral", ownerName: "Keisha Moore", clinicLocationId: westside.id, partnershipScore: 4, eventScore: 5, relationshipStrength: "Warm", lastContactedAt: day(-3, 17), nextFollowUpAt: dayOnly(1), notes: "Referred by Danny at CrossFit ABQ. Wants a mobility + posture screening Saturday." },
    { name: "Bosque Brewing Taproom", vertical: "Restaurant", area: "NE Heights", address: "8900 San Mateo Blvd NE, Albuquerque", phone: "(505) 555-0170", email: "events@bosquebrewing.com", status: "New Prospect", source: "Research", ownerName: "GM: Tyler Nguyen", clinicLocationId: neHeights.id, partnershipScore: 3, eventScore: 3, relationshipStrength: "Cold", notes: "Busy lunch crowd of office workers — drop box candidate." },
    { name: "High Desert Staffing", vertical: "Corporate Office", area: "NE Heights", address: "7500 Jefferson St NE, Albuquerque", phone: "(505) 555-0149", email: "team@highdesertstaffing.com", status: "Converted", source: "Drop Box", ownerName: "Monica Silva", clinicLocationId: neHeights.id, partnershipScore: 3, eventScore: 3, relationshipStrength: "Warm", lastContactedAt: day(-12, 12), notes: "Won Mario's team lunch. Lunch delivery turned into 3 booked appointments." },
    { name: "Sunrise Charter School", vertical: "School", area: "Rio Rancho", address: "1800 Golf Course Rd, Rio Rancho", phone: "(505) 555-0112", email: "admin@sunrisecharter.org", status: "Researched", source: "Research", ownerName: "Principal Lena Garcia", clinicLocationId: westside.id, partnershipScore: 2, eventScore: 3, relationshipStrength: "Cold", notes: "Teacher wellness week in September — potential posture screening booth." },
    { name: "La Cumbre Nutrition", vertical: "Wellness", area: "Downtown", address: "210 Central Ave SW, Albuquerque", phone: "(505) 555-0158", email: "hola@lacumbrenutrition.com", status: "New Prospect", source: "Networking", ownerName: "Gabby Herrera", clinicLocationId: downtown.id, partnershipScore: 3, eventScore: 2, relationshipStrength: "Cold", notes: "Met at Downtown Growers' Market. Smoothie shop with wellness clientele." },
  ]).returning();
  const acc = (name: string) => accountRows.find((a) => a.name === name)!;

  await db.insert(s.accountTags).values([
    { accountId: acc("Mario's Pizzeria").id, tagId: tagId("Drop Box Host") },
    { accountId: acc("Johnny's Pizza").id, tagId: tagId("Drop Box Host") },
    { accountId: acc("CrossFit ABQ").id, tagId: tagId("Referral Source") },
    { accountId: acc("Sandia Peak Dental").id, tagId: tagId("Hot Lead") },
    { accountId: acc("Rio Grande Credit Union").id, tagId: tagId("Chamber Member") },
  ]);

  // ---- Contacts ----
  const contactRows = await db.insert(s.contacts).values([
    { firstName: "Danny", lastName: "Ortega", title: "Owner / Head Coach", accountId: acc("CrossFit ABQ").id, phone: "(505) 555-0201", email: "danny@crossfitabq.com", preferredMethod: "Text", contactType: "Gym Owner", influenceLevel: "Decision Maker", relationshipStatus: "Champion", source: "In-Person Visit", lastContactedAt: day(-2, 14), nextFollowUpAt: dayOnly(5), notes: "Best partner we have. Intro'd us to Iron Tribe." },
    { firstName: "Mario", lastName: "Sanchez", title: "Owner", accountId: acc("Mario's Pizzeria").id, phone: "(505) 555-0202", email: "mario@mariosabq.com", preferredMethod: "In Person", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "Established", source: "Drop Box Visit", lastContactedAt: day(-3, 12), nextFollowUpAt: dayOnly(3) },
    { firstName: "Johnny", lastName: "Trujillo", title: "Owner", accountId: acc("Johnny's Pizza").id, phone: "(505) 555-0203", email: "johnny@johnnyspizzaabq.com", preferredMethod: "Phone", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "Building", source: "Referral", lastContactedAt: day(-6, 11), nextFollowUpAt: dayOnly(1) },
    { firstName: "Melissa", lastName: "Chan", title: "Dentist / Owner", accountId: acc("Sandia Peak Dental").id, phone: "(505) 555-0204", email: "drchan@sandiapeakdental.com", preferredMethod: "Email", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "Building", source: "Phone Call", lastContactedAt: day(-1, 15), nextFollowUpAt: dayOnly(0), notes: "Wants ergonomics talk during Friday staff meeting." },
    { firstName: "Patricia", lastName: "Vigil", title: "HR Director", accountId: acc("Rio Grande Credit Union").id, phone: "(505) 555-0205", email: "pvigil@rgcu.org", preferredMethod: "Email", contactType: "HR", influenceLevel: "Decision Maker", relationshipStatus: "Building", source: "Email", lastContactedAt: day(-2, 10), nextFollowUpAt: dayOnly(2), notes: "Needs one-pager for leadership before confirming lunch & learn." },
    { firstName: "Alicia", lastName: "Romero", title: "Owner", accountId: acc("Desert Bloom Wellness Spa").id, phone: "(505) 555-0206", email: "alicia@desertbloomspa.com", preferredMethod: "Phone", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "Building", source: "Networking", lastContactedAt: day(-8, 13), nextFollowUpAt: dayOnly(-2) },
    { firstName: "Sam", lastName: "Whitfield", title: "Community Manager", accountId: acc("ABQ Coworking Collective").id, phone: "(505) 555-0207", email: "sam@abqcowork.com", preferredMethod: "Email", contactType: "Manager", influenceLevel: "High", relationshipStatus: "New", source: "In-Person Visit", lastContactedAt: day(-4, 9), nextFollowUpAt: dayOnly(4) },
    { firstName: "Aaron", lastName: "Yazzie", title: "Dentist / Owner", accountId: acc("Westside Family Dental").id, phone: "(505) 555-0208", email: "dryazzie@westsidefamilydental.com", preferredMethod: "Phone", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "New", source: "Phone Call", lastContactedAt: day(-9, 14), nextFollowUpAt: dayOnly(-1) },
    { firstName: "Ray", lastName: "Baca", title: "Owner", accountId: acc("Duke City Movers").id, phone: "(505) 555-0209", email: "ray@dukecitymovers.com", preferredMethod: "Phone", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "New", source: "Phone Call", lastContactedAt: day(-5, 16), nextFollowUpAt: dayOnly(6) },
    { firstName: "Keisha", lastName: "Moore", title: "Owner / Coach", accountId: acc("Iron Tribe Fitness Westside").id, phone: "(505) 555-0210", email: "keisha@irontribewestside.com", preferredMethod: "Text", contactType: "Gym Owner", influenceLevel: "Decision Maker", relationshipStatus: "Building", source: "Referral", lastContactedAt: day(-3, 17), nextFollowUpAt: dayOnly(1) },
    { firstName: "Monica", lastName: "Silva", title: "Office Manager", accountId: acc("High Desert Staffing").id, phone: "(505) 555-0211", email: "monica@highdesertstaffing.com", preferredMethod: "Email", contactType: "Manager", influenceLevel: "High", relationshipStatus: "Established", source: "Drop Box", lastContactedAt: day(-12, 12), notes: "Champion after winning the Mario's lunch. Referred 2 coworkers." },
    { firstName: "Gabby", lastName: "Herrera", title: "Owner", accountId: acc("La Cumbre Nutrition").id, phone: "(505) 555-0212", email: "gabby@lacumbrenutrition.com", preferredMethod: "Text", contactType: "Owner", influenceLevel: "Decision Maker", relationshipStatus: "New", source: "Networking" },
  ]).returning();
  const con = (first: string) => contactRows.find((c) => c.firstName === first)!;

  // ---- Partners ----
  const partnerRows = await db.insert(s.partners).values([
    { accountId: acc("Mario's Pizzeria").id, partnerType: "Restaurant Partner", status: "Active", startDate: dayOnly(-75), mainContactId: con("Mario").id, clinicLocationId: neHeights.id, benefits: "Hosts drop box; we buy winner lunches from Mario's (~$120/mo)", dropBoxActive: true, dropBoxStatus: "Placed", lastPickupAt: day(-7, 12), nextPickupDueAt: dayOnly(0), lunchOffer: "Team pizza lunch for up to 15 (~$120)", cateringInfo: "Order via office@mariosabq.com, 48h notice", cardsCollected: 84, revenueSpent: 360 },
    { accountId: acc("Johnny's Pizza").id, partnerType: "Restaurant Partner", status: "Active", startDate: dayOnly(-30), mainContactId: con("Johnny").id, clinicLocationId: westside.id, benefits: "Hosts drop box near register", dropBoxActive: true, dropBoxStatus: "Needs Pickup", lastPickupAt: day(-9, 13), nextPickupDueAt: dayOnly(-1), lunchOffer: "Two-pizza party pack (~$60)", cateringInfo: "Call Johnny direct", cardsCollected: 31, revenueSpent: 120 },
    { accountId: acc("CrossFit ABQ").id, partnerType: "Gym Partner", status: "Active", startDate: dayOnly(-120), mainContactId: con("Danny").id, clinicLocationId: neHeights.id, benefits: "Quarterly screening days, member discount flyer on bulletin board", dropBoxActive: false, notes: "Best appointment source so far." },
    { accountId: acc("Desert Bloom Wellness Spa").id, partnerType: "Wellness Partner", status: "Prospective", startDate: null, mainContactId: con("Alicia").id, clinicLocationId: neHeights.id, benefits: "Cross-referrals + co-branded fall open house (proposed)", dropBoxActive: false },
  ]).returning();
  const partnerByAccount = (name: string) => partnerRows.find((p) => p.accountId === acc(name).id)!;

  // ---- Campaigns ----
  const token = () => randomBytes(6).toString("base64url");
  const campaignRows = await db.insert(s.campaigns).values([
    { name: "Mario's Drop Box — Summer 2026", type: "Restaurant Drop Box", partnerId: partnerByAccount("Mario's Pizzeria").id, accountId: acc("Mario's Pizzeria").id, startDate: dayOnly(-75), status: "Active", offer: "Drop a card, win team lunch from Mario's", trackingUrl: "https://illumin8chiro.com/win-lunch-marios", notes: "Pickup every Friday.", publicToken: token(), publicForm: "lunch" },
    { name: "Johnny's Drop Box — Westside", type: "Restaurant Drop Box", partnerId: partnerByAccount("Johnny's Pizza").id, accountId: acc("Johnny's Pizza").id, startDate: dayOnly(-30), status: "Active", offer: "Drop a card, win a pizza party", trackingUrl: "https://illumin8chiro.com/win-lunch-johnnys", publicToken: token(), publicForm: "lunch" },
    { name: "CrossFit ABQ Member Flyer", type: "Gym Flyer", partnerId: partnerByAccount("CrossFit ABQ").id, accountId: acc("CrossFit ABQ").id, startDate: dayOnly(-45), status: "Active", offer: "$49 new-patient posture exam for members", trackingUrl: "https://illumin8chiro.com/crossfit-abq", publicToken: token(), publicForm: "patient" },
    { name: "Growers' Market Booth — July", type: "Event Flyer", startDate: dayOnly(-6), endDate: dayOnly(24), status: "Active", offer: "Free posture screening at the booth", publicToken: token(), publicForm: "patient" },
  ]).returning();
  const camp = (prefix: string) => campaignRows.find((c) => c.name.startsWith(prefix))!;

  // ---- Opportunities ----
  const oppRows = await db.insert(s.opportunities).values([
    { name: "RGCU Wellness Hour Lunch & Learn", accountId: acc("Rio Grande Credit Union").id, contactId: con("Patricia").id, type: "Lunch and Learn", stage: "Decision Maker Engaged", expectedEventDate: dayOnly(12), nextStep: "Send one-pager to Patricia for leadership review", nextFollowUpAt: dayOnly(2), clinicLocationId: downtown.id, stageChangedAt: day(-2, 10), createdAt: day(-14, 9) },
    { name: "Sandia Peak Dental Ergonomics Talk", accountId: acc("Sandia Peak Dental").id, contactId: con("Melissa").id, type: "Dental Ergonomics Presentation", stage: "Proposal / Details Sent", expectedEventDate: dayOnly(8), nextStep: "Confirm Friday staff-meeting slot", nextFollowUpAt: dayOnly(0), clinicLocationId: neHeights.id, stageChangedAt: day(-1, 15), createdAt: day(-10, 11) },
    { name: "Iron Tribe Saturday Screening", accountId: acc("Iron Tribe Fitness Westside").id, contactId: con("Keisha").id, type: "Gym Screening Event", stage: "Event Date Pending", expectedEventDate: dayOnly(9), nextStep: "Lock date + promo post for members", nextFollowUpAt: dayOnly(1), clinicLocationId: westside.id, stageChangedAt: day(-3, 17), createdAt: day(-8, 10) },
    { name: "CrossFit ABQ Q3 Screening Day", accountId: acc("CrossFit ABQ").id, contactId: con("Danny").id, type: "Gym Screening Event", stage: "Event Booked", expectedEventDate: dayOnly(3), nextStep: "Bring 2 screening stations + intake cards", nextFollowUpAt: dayOnly(2), campaignId: camp("CrossFit").id, clinicLocationId: neHeights.id, stageChangedAt: day(-5, 12), createdAt: day(-20, 9) },
    { name: "Bosque Brewing Drop Box", accountId: acc("Bosque Brewing Taproom").id, type: "Restaurant Drop Box Partnership", stage: "First Contact Needed", nextStep: "Visit taproom, ask for GM Tyler", nextFollowUpAt: dayOnly(1), clinicLocationId: neHeights.id, stageChangedAt: day(-4, 9), createdAt: day(-4, 9) },
    { name: "ABQ Coworking Lunch & Learn", accountId: acc("ABQ Coworking Collective").id, contactId: con("Sam").id, type: "Lunch and Learn", stage: "Contacted", nextStep: "Follow up on community-lunch calendar slot", nextFollowUpAt: dayOnly(4), clinicLocationId: downtown.id, stageChangedAt: day(-4, 9), createdAt: day(-6, 14) },
    { name: "Westside Family Dental Ergonomics", accountId: acc("Westside Family Dental").id, contactId: con("Aaron").id, type: "Dental Ergonomics Presentation", stage: "Follow-Up Scheduled", nextStep: "Call Dr. Yazzie Thursday afternoon", nextFollowUpAt: dayOnly(-1), clinicLocationId: westside.id, stageChangedAt: day(-9, 14), createdAt: day(-12, 10) },
    { name: "Duke City Movers Safety Day Talk", accountId: acc("Duke City Movers").id, contactId: con("Ray").id, type: "Corporate Wellness Event", stage: "Interested", expectedEventDate: dayOnly(20), nextStep: "Ray checking crew schedule for a Friday morning", nextFollowUpAt: dayOnly(6), clinicLocationId: neHeights.id, stageChangedAt: day(-5, 16), createdAt: day(-9, 15) },
    { name: "Desert Bloom Referral Partnership", accountId: acc("Desert Bloom Wellness Spa").id, contactId: con("Alicia").id, type: "Referral Partnership", stage: "Proposal / Details Sent", nextStep: "Follow up on partnership one-pager", nextFollowUpAt: dayOnly(-2), clinicLocationId: neHeights.id, stageChangedAt: day(-8, 13), createdAt: day(-25, 10) },
    { name: "High Desert Staffing Lunch Delivery", accountId: acc("High Desert Staffing").id, contactId: con("Monica").id, type: "Lunch and Learn", stage: "Converted", expectedEventDate: dayOnly(-13), nextStep: null, campaignId: camp("Mario's").id, clinicLocationId: neHeights.id, stageChangedAt: day(-11, 13), createdAt: day(-18, 9), notes: "Drop-box winner lunch → 3 appointments booked." },
    { name: "Sunrise Charter Teacher Wellness Week", accountId: acc("Sunrise Charter School").id, type: "Community Event / Expo Booth", stage: "Prospect Identified", nextStep: "Find the right admin contact", clinicLocationId: westside.id, stageChangedAt: day(-2, 9), createdAt: day(-2, 9) },
  ]).returning();
  const opp = (prefix: string) => oppRows.find((o) => o.name.startsWith(prefix))!;

  // ---- Events ----
  const eventRows = await db.insert(s.events).values([
    { name: "CrossFit ABQ Q3 Screening Day", type: "Gym Screening", accountId: acc("CrossFit ABQ").id, contactId: con("Danny").id, opportunityId: opp("CrossFit ABQ Q3").id, partnerId: partnerByAccount("CrossFit ABQ").id, campaignId: camp("CrossFit").id, clinicLocationId: neHeights.id, locationText: "CrossFit ABQ, Menaul Blvd", startsAt: day(3, 9), status: "Booked", bookedAt: day(-2, 14), expectedAttendees: 40, notes: "Two screening stations. Danny promoting in member WhatsApp." },
    { name: "RGCU Wellness Hour Lunch & Learn", type: "Lunch and Learn", accountId: acc("Rio Grande Credit Union").id, contactId: con("Patricia").id, opportunityId: opp("RGCU").id, clinicLocationId: downtown.id, locationText: "RGCU HQ, Gold Ave", startsAt: day(12, 12), status: "Date Pending", expectedAttendees: 25, notes: "Pending leadership sign-off on the one-pager." },
    { name: "Sandia Peak Dental Ergonomics Talk", type: "Dental CE / Ergonomics Presentation", accountId: acc("Sandia Peak Dental").id, contactId: con("Melissa").id, opportunityId: opp("Sandia").id, clinicLocationId: neHeights.id, locationText: "Sandia Peak Dental break room", startsAt: day(8, 12, 30), status: "Date Pending", expectedAttendees: 10 },
    { name: "Downtown Growers' Market Booth", type: "Community Event", campaignId: camp("Growers").id, clinicLocationId: downtown.id, locationText: "Robinson Park", startsAt: day(-6, 8), status: "Completed", bookedAt: day(-20, 10), expectedAttendees: 60, actualAttendees: 74, screeningsCompleted: 22, revenue: 0, followUpRequired: true, followUpDueAt: dayOnly(1), outcomeNotes: "Great foot traffic. 9 leads captured, 4 hot. Bring a second table next time." },
    { name: "High Desert Staffing Winner Lunch", type: "Office Visit", accountId: acc("High Desert Staffing").id, contactId: con("Monica").id, opportunityId: opp("High Desert").id, partnerId: partnerByAccount("Mario's Pizzeria").id, campaignId: camp("Mario's").id, clinicLocationId: neHeights.id, locationText: "High Desert Staffing office", startsAt: day(-13, 12), status: "Completed", bookedAt: day(-15, 10), expectedAttendees: 12, actualAttendees: 14, screeningsCompleted: 9, revenue: 0, outcomeNotes: "Mario's lunch delivered. 9 mini posture screenings at the office, 3 appointments booked on the spot." },
    { name: "CrossFit ABQ Q2 Screening Day", type: "Gym Screening", accountId: acc("CrossFit ABQ").id, contactId: con("Danny").id, partnerId: partnerByAccount("CrossFit ABQ").id, campaignId: camp("CrossFit").id, clinicLocationId: neHeights.id, locationText: "CrossFit ABQ", startsAt: day(-40, 9), status: "Completed", bookedAt: day(-50, 10), expectedAttendees: 35, actualAttendees: 38, screeningsCompleted: 26, revenue: 0, outcomeNotes: "26 screenings, 6 appointments booked, 5 showed." },
  ]).returning();
  const evt = (prefix: string) => eventRows.find((e) => e.name.startsWith(prefix))!;

  // ---- Leads ----
  const leadRows = await db.insert(s.leads).values([
    // Mario's drop box cards
    { firstName: "Monica", lastName: "Silva", phone: "(505) 555-0211", email: "monica@highdesertstaffing.com", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, accountId: acc("High Desert Staffing").id, interestLevel: "Hot", apptStatus: "Showed", preferredLocationId: neHeights.id, createdAt: day(-16, 12), notes: "Drop-box winner — became our champion at High Desert Staffing." },
    { firstName: "Derek", lastName: "Chavez", phone: "(505) 555-0301", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, accountId: acc("High Desert Staffing").id, interestLevel: "Warm", apptStatus: "Showed", preferredLocationId: neHeights.id, createdAt: day(-13, 13) },
    { firstName: "Lauren", lastName: "Padilla", phone: "(505) 555-0302", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, accountId: acc("High Desert Staffing").id, interestLevel: "Warm", apptStatus: "Booked", preferredLocationId: neHeights.id, createdAt: day(-13, 13) },
    { firstName: "Carlos", lastName: "Montoya", phone: "(505) 555-0303", source: "Drop Box", campaignId: camp("Johnny's").id, partnerId: partnerByAccount("Johnny's Pizza").id, interestLevel: "Cool", apptStatus: "Contacted", preferredLocationId: westside.id, createdAt: day(-4, 15) },
    // Growers' market booth
    { firstName: "Amy", lastName: "Tso", phone: "(505) 555-0304", email: "amy.tso@gmail.com", source: "Screening", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, interestLevel: "Hot", apptStatus: "Booked", preferredLocationId: downtown.id, createdAt: day(-6, 10) },
    { firstName: "Robert", lastName: "Finch", phone: "(505) 555-0305", source: "Screening", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, interestLevel: "Warm", apptStatus: "Contacted", preferredLocationId: downtown.id, createdAt: day(-6, 10) },
    { firstName: "Jessica", lastName: "Nez", phone: "(505) 555-0306", source: "Screening", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, interestLevel: "Hot", apptStatus: "Booked", preferredLocationId: downtown.id, createdAt: day(-6, 11) },
    { firstName: "Paul", lastName: "Archuleta", phone: "(505) 555-0307", source: "Screening", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, interestLevel: "Cool", apptStatus: "Not Contacted", preferredLocationId: downtown.id, createdAt: day(-6, 11) },
    { firstName: "Renee", lastName: "Vallejos", phone: "(505) 555-0308", source: "Screening", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, interestLevel: "Warm", apptStatus: "Not Contacted", preferredLocationId: downtown.id, createdAt: day(-6, 12) },
    // CrossFit Q2 event (historical)
    { firstName: "Tyler", lastName: "Brooks", phone: "(505) 555-0309", source: "Event", eventId: evt("CrossFit ABQ Q2").id, campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, interestLevel: "Hot", apptStatus: "Showed", preferredLocationId: neHeights.id, createdAt: day(-40, 11) },
    { firstName: "Dana", lastName: "Lucero", phone: "(505) 555-0310", source: "Event", eventId: evt("CrossFit ABQ Q2").id, campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, interestLevel: "Warm", apptStatus: "No-Show", preferredLocationId: neHeights.id, createdAt: day(-40, 11) },
    { firstName: "Marcus", lastName: "Ellis", phone: "(505) 555-0311", source: "QR Code", campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, interestLevel: "Warm", apptStatus: "Booked", preferredLocationId: neHeights.id, createdAt: day(-2, 19), notes: "Scanned member flyer QR code." },
  ]).returning();
  const lead = (first: string) => leadRows.find((l) => l.firstName === first)!;

  // ---- Appointments ----
  await db.insert(s.appointments).values([
    { leadId: lead("Monica").id, personName: "Monica Silva", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, eventId: evt("High Desert").id, accountId: acc("High Desert Staffing").id, locationId: neHeights.id, scheduledAt: day(-10, 9), status: "Showed", offer: "$49 new-patient exam", revenue: 320, collected: true, createdAt: day(-13, 14) },
    { leadId: lead("Derek").id, personName: "Derek Chavez", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, eventId: evt("High Desert").id, accountId: acc("High Desert Staffing").id, locationId: neHeights.id, scheduledAt: day(-9, 15), status: "Showed", offer: "$49 new-patient exam", revenue: 320, collected: true, createdAt: day(-13, 14) },
    { leadId: lead("Lauren").id, personName: "Lauren Padilla", source: "Drop Box", campaignId: camp("Mario's").id, partnerId: partnerByAccount("Mario's Pizzeria").id, eventId: evt("High Desert").id, accountId: acc("High Desert Staffing").id, locationId: neHeights.id, scheduledAt: day(2, 10), status: "Booked", offer: "$49 new-patient exam", createdAt: day(-13, 14) },
    { leadId: lead("Amy").id, personName: "Amy Tso", source: "Event", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, locationId: downtown.id, scheduledAt: day(1, 11), status: "Confirmed", offer: "Free posture screening follow-up", createdAt: day(-5, 9) },
    { leadId: lead("Jessica").id, personName: "Jessica Nez", source: "Event", eventId: evt("Downtown Growers").id, campaignId: camp("Growers").id, locationId: downtown.id, scheduledAt: day(4, 14), status: "Booked", offer: "Free posture screening follow-up", createdAt: day(-3, 16) },
    { leadId: lead("Tyler").id, personName: "Tyler Brooks", source: "Event", eventId: evt("CrossFit ABQ Q2").id, campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, locationId: neHeights.id, scheduledAt: day(-36, 10), status: "Showed", offer: "$49 member exam", revenue: 440, collected: true, createdAt: day(-40, 12) },
    { leadId: lead("Dana").id, personName: "Dana Lucero", source: "Event", eventId: evt("CrossFit ABQ Q2").id, campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, locationId: neHeights.id, scheduledAt: day(-35, 16), status: "No-Show", offer: "$49 member exam", createdAt: day(-40, 12) },
    { leadId: lead("Marcus").id, personName: "Marcus Ellis", source: "QR Code", campaignId: camp("CrossFit").id, partnerId: partnerByAccount("CrossFit ABQ").id, locationId: neHeights.id, scheduledAt: day(5, 9), status: "Booked", offer: "$49 member exam", createdAt: day(-1, 10) },
  ]);

  // ---- Activities (past ~3 weeks, weighted toward this week) ----
  await db.insert(s.activities).values([
    // This week
    { type: "In-Person Visit", outcome: "Reached Decision Maker", accountId: acc("Sandia Peak Dental").id, contactId: con("Melissa").id, opportunityId: opp("Sandia").id, occurredAt: day(-1, 15), nextFollowUpAt: dayOnly(0), notes: "Dr. Chan wants the ergonomics talk at a Friday staff meeting. Sent proposed outline." },
    { type: "Email", outcome: "Interested", accountId: acc("Rio Grande Credit Union").id, contactId: con("Patricia").id, opportunityId: opp("RGCU").id, occurredAt: day(-2, 10), nextFollowUpAt: dayOnly(2), notes: "Patricia asked for the one-pager for leadership." },
    { type: "Text", outcome: "Booked Event", accountId: acc("CrossFit ABQ").id, contactId: con("Danny").id, opportunityId: opp("CrossFit ABQ Q3").id, occurredAt: day(-2, 14), notes: "Q3 screening day locked for next week. Danny promoting to members." },
    { type: "Drop Box Visit", outcome: "Follow-Up Needed", accountId: acc("Mario's Pizzeria").id, contactId: con("Mario").id, partnerId: partnerByAccount("Mario's Pizzeria").id, campaignId: camp("Mario's").id, occurredAt: day(-3, 12), nextFollowUpAt: dayOnly(3), notes: "Picked up 11 cards. Box needs new entry slips." },
    { type: "Phone Call", outcome: "Spoke with Gatekeeper", accountId: acc("Iron Tribe Fitness Westside").id, contactId: con("Keisha").id, opportunityId: opp("Iron Tribe").id, occurredAt: day(-3, 17), nextFollowUpAt: dayOnly(1), notes: "Keisha coaching — front desk says text her directly." },
    { type: "In-Person Visit", outcome: "Interested", accountId: acc("ABQ Coworking Collective").id, contactId: con("Sam").id, opportunityId: opp("ABQ Coworking").id, occurredAt: day(-4, 9), nextFollowUpAt: dayOnly(4), notes: "Toured the space. Sam open to a lunch-and-learn slot in the monthly calendar." },
    { type: "Phone Call", outcome: "No Answer", accountId: acc("Bosque Brewing Taproom").id, opportunityId: opp("Bosque").id, occurredAt: day(-4, 11), nextFollowUpAt: dayOnly(1), notes: "No answer at events line. Visit in person instead." },
    { type: "Follow-Up", outcome: "Left Voicemail", accountId: acc("Duke City Movers").id, contactId: con("Ray").id, opportunityId: opp("Duke City").id, occurredAt: day(-5, 16), nextFollowUpAt: dayOnly(6), notes: "VM re: safety-day talk date." },
    { type: "Drop Box Visit", outcome: "Follow-Up Needed", accountId: acc("Johnny's Pizza").id, contactId: con("Johnny").id, partnerId: partnerByAccount("Johnny's Pizza").id, campaignId: camp("Johnny's").id, occurredAt: day(-6, 11), nextFollowUpAt: dayOnly(-1), notes: "Only 4 cards this week — box moved away from register. Ask Johnny to move it back." },
    // Last week
    { type: "Screening Event", outcome: "Booked Meeting", campaignId: camp("Growers").id, eventId: evt("Downtown Growers").id, occurredAt: day(-6, 8), notes: "Worked the Growers' Market booth — 22 screenings, 9 leads." },
    { type: "Phone Call", outcome: "Interested", accountId: acc("Rio Grande Credit Union").id, contactId: con("Patricia").id, opportunityId: opp("RGCU").id, occurredAt: day(-8, 10), notes: "First real conversation with Patricia. Wellness hour is a standing slot." },
    { type: "Meeting", outcome: "Interested", accountId: acc("Desert Bloom Wellness Spa").id, contactId: con("Alicia").id, opportunityId: opp("Desert Bloom").id, occurredAt: day(-8, 13), nextFollowUpAt: dayOnly(-2), notes: "Coffee with Alicia — talked cross-referral flow and fall open house." },
    { type: "Phone Call", outcome: "Spoke with Gatekeeper", accountId: acc("Westside Family Dental").id, contactId: con("Aaron").id, opportunityId: opp("Westside Family").id, occurredAt: day(-9, 14), nextFollowUpAt: dayOnly(-1), notes: "Office manager will 'pass along the message.' Try Thursday." },
    { type: "Phone Call", outcome: "Reached Decision Maker", accountId: acc("Duke City Movers").id, contactId: con("Ray").id, opportunityId: opp("Duke City").id, occurredAt: day(-9, 15), notes: "Ray likes the injury-prevention angle for his crew." },
    { type: "Email", outcome: "Needs Materials", accountId: acc("Sandia Peak Dental").id, contactId: con("Melissa").id, opportunityId: opp("Sandia").id, occurredAt: day(-10, 9), notes: "Sent ergonomics talk outline + screening menu." },
    // Two-three weeks ago
    { type: "Lunch and Learn", outcome: "Closed / Converted", accountId: acc("High Desert Staffing").id, contactId: con("Monica").id, opportunityId: opp("High Desert").id, eventId: evt("High Desert").id, partnerId: partnerByAccount("Mario's Pizzeria").id, campaignId: camp("Mario's").id, occurredAt: day(-13, 12), notes: "Winner lunch delivered — 9 office screenings, 3 appointments booked." },
    { type: "Phone Call", outcome: "Booked Meeting", accountId: acc("High Desert Staffing").id, contactId: con("Monica").id, opportunityId: opp("High Desert").id, occurredAt: day(-15, 10), notes: "Monica thrilled about winning. Scheduled lunch delivery." },
    { type: "Drop Box Visit", outcome: "Follow-Up Needed", accountId: acc("Mario's Pizzeria").id, contactId: con("Mario").id, partnerId: partnerByAccount("Mario's Pizzeria").id, campaignId: camp("Mario's").id, occurredAt: day(-7, 12), notes: "Friday pickup — 13 cards. Drew High Desert Staffing as winner." },
    { type: "In-Person Visit", outcome: "Reached Decision Maker", accountId: acc("Johnny's Pizza").id, contactId: con("Johnny").id, occurredAt: day(-16, 13), notes: "Set up Johnny's drop box near register." },
    { type: "Networking", outcome: "Follow-Up Needed", accountId: acc("La Cumbre Nutrition").id, contactId: con("Gabby").id, occurredAt: day(-6, 9), nextFollowUpAt: dayOnly(7), notes: "Met Gabby at the Growers' Market — interested in wellness cross-promo." },
    { type: "Text", outcome: "Interested", accountId: acc("Iron Tribe Fitness Westside").id, contactId: con("Keisha").id, opportunityId: opp("Iron Tribe").id, occurredAt: day(-11, 18), notes: "Danny's intro text — Keisha wants a Saturday screening." },
  ]);

  // ---- Tasks ----
  await db.insert(s.tasks).values([
    { title: "Call Dr. Chan — confirm Friday staff-meeting slot", dueDate: dayOnly(0), accountId: acc("Sandia Peak Dental").id, contactId: con("Melissa").id, opportunityId: opp("Sandia").id },
    { title: "Pick up Mario's drop box cards (Friday pickup)", dueDate: dayOnly(0), accountId: acc("Mario's Pizzeria").id, contactId: con("Mario").id },
    { title: "Follow up with Alicia on partnership one-pager", dueDate: dayOnly(-2), accountId: acc("Desert Bloom Wellness Spa").id, contactId: con("Alicia").id, opportunityId: opp("Desert Bloom").id },
    { title: "Call Dr. Yazzie (Thursday PM — bypass gatekeeper)", dueDate: dayOnly(-1), accountId: acc("Westside Family Dental").id, contactId: con("Aaron").id, opportunityId: opp("Westside Family").id },
    { title: "Pick up Johnny's drop box — overdue, box moved from register", dueDate: dayOnly(-1), accountId: acc("Johnny's Pizza").id, contactId: con("Johnny").id },
    { title: "Text Keisha — lock Iron Tribe Saturday screening date", dueDate: dayOnly(1), accountId: acc("Iron Tribe Fitness Westside").id, contactId: con("Keisha").id, opportunityId: opp("Iron Tribe").id },
    { title: "Send RGCU one-pager to Patricia", dueDate: dayOnly(2), accountId: acc("Rio Grande Credit Union").id, contactId: con("Patricia").id, opportunityId: opp("RGCU").id },
    { title: "Call Growers' Market leads (Robert, Paul, Renee)", dueDate: dayOnly(1), eventId: evt("Downtown Growers").id },
    { title: "Prep 2 screening stations for CrossFit Q3 day", dueDate: dayOnly(2), accountId: acc("CrossFit ABQ").id, eventId: evt("CrossFit ABQ Q3").id, opportunityId: opp("CrossFit ABQ Q3").id },
    { title: "Visit Bosque Brewing — ask for GM Tyler", dueDate: dayOnly(1), accountId: acc("Bosque Brewing Taproom").id, opportunityId: opp("Bosque").id },
    { title: "Log Q2 CrossFit results in event outcomes", dueDate: dayOnly(-30), status: "Completed", completedAt: day(-29, 9), eventId: evt("CrossFit ABQ Q2").id },
  ]);

  // ---- Projects ----
  await db.insert(s.projects).values([
    {
      name: "Get In-Network with Presbyterian Insurance",
      description: "Complete credentialing so Presbyterian members can use us in-network — unlocks corporate wellness deals with Presbyterian-insured employers.",
      status: "Active",
      nextStep: "Submit the credentialing application packet",
      targetDate: dayOnly(60),
    },
  ]);

  // ---- Weekly goals ----
  await db.insert(s.reportGoals).values([
    { metric: "businesses_contacted", label: "Business Contacts", weeklyTarget: 50, sortOrder: 1 },
    { metric: "in_person_visits", label: "In-Person Visits", weeklyTarget: 25, sortOrder: 2 },
    { metric: "follow_ups_completed", label: "Follow-Ups Completed", weeklyTarget: 25, sortOrder: 3 },
    { metric: "partnership_conversations", label: "Partnership Conversations", weeklyTarget: 5, sortOrder: 4 },
    { metric: "drop_box_visits", label: "Restaurant / Drop Box Visits", weeklyTarget: 3, sortOrder: 5 },
    { metric: "events_booked", label: "Events Booked", weeklyTarget: 6, sortOrder: 6 },
    { metric: "events_held", label: "Events Held", weeklyTarget: 6, sortOrder: 7 },
    { metric: "appointments_booked", label: "New Patient Appointments", weeklyTarget: 18, sortOrder: 8 },
  ]);

  // ---- Ownership stamp ----
  // Every seeded record belongs to Albuquerque and to Carter. Done in one pass
  // so the fixtures above stay readable instead of repeating two fields ~100 times.
  const [carter] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  const owned = [
    s.accounts, s.contacts, s.campaigns, s.partners, s.opportunities,
    s.events, s.projects, s.activities, s.tasks, s.leads, s.appointments,
  ];
  for (const table of owned) {
    await db.update(table).set({ cityId: abq.id, userId: carter.id });
  }

  console.log("Seeded: 1 city, 1 user, 3 locations, 14 accounts, 12 contacts, 4 partners, 4 campaigns, 11 opportunities, 6 events, 12 leads, 8 appointments, 21 activities, 11 tasks, 8 goals.");
  console.log("Login: carter@illumin8chiro.com / illumin8");
}

main();
