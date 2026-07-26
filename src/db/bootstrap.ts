// Production bootstrap — the MINIMUM to start a live, empty CRM:
//   • one admin user (so you can log in — the app has no public sign-up)
//   • the Albuquerque city + its three clinic locations
//   • the weekly report goals and the default tags
// NO demo businesses/contacts/leads. Run once against a freshly-migrated
// database:  npm run db:bootstrap   (works local or Turso via the env switch)
//
// Admin password: set ADMIN_PASSWORD to choose it; otherwise a random temp is
// generated and printed. Either way, change it on first sign-in (Settings → Profile).
import { randomBytes, scryptSync } from "crypto";
import { count, eq } from "drizzle-orm";
import * as s from "./schema";
import { loadEnvLocal } from "./env";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  loadEnvLocal();
  const { db } = await import("./index");
  const where = process.env.TURSO_DATABASE_URL ? "Turso (hosted)" : "local data/outreach.db";

  // Idempotent: never double-seed a database that already has users.
  const [existing] = await db.select({ c: count() }).from(s.users);
  if (Number(existing.c) > 0) {
    console.log(`Already bootstrapped (${where} has ${existing.c} user(s)). Nothing to do.`);
    return;
  }

  // Migration 0007 already inserts an "Albuquerque" city, so reuse it rather
  // than creating a second one. Create it only if somehow absent.
  let abq = await db.query.cities.findFirst({ where: eq(s.cities.name, "Albuquerque") });
  if (!abq) [abq] = await db.insert(s.cities).values({ name: "Albuquerque" }).returning();

  const password = process.env.ADMIN_PASSWORD || randomBytes(6).toString("base64url");
  await db.insert(s.users).values({
    email: "carter@illumin8chiro.com",
    name: "Carter",
    passwordHash: hashPassword(password),
    role: "admin",
    cityId: abq.id,
  });

  // Clinic locations — only if none exist yet (keeps a re-run harmless).
  const [locCount] = await db.select({ c: count() }).from(s.locations);
  if (Number(locCount.c) === 0) {
    await db.insert(s.locations).values([
      { name: "NE Heights", address: "Albuquerque NE Heights", cityId: abq.id },
      { name: "Westside", address: "Albuquerque Westside", cityId: abq.id },
      { name: "Downtown", address: "Albuquerque Downtown", cityId: abq.id },
    ]);
  }

  // Weekly goals — the leadership targets the dashboard and reports measure against.
  const [goalCount] = await db.select({ c: count() }).from(s.reportGoals);
  if (Number(goalCount.c) === 0) {
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
  }

  // Default tag vocabulary — generic workflow labels, not demo data.
  const [tagCount] = await db.select({ c: count() }).from(s.tags);
  if (Number(tagCount.c) === 0) {
    await db.insert(s.tags).values([
      { name: "Hot Lead" }, { name: "Drop Box Host" }, { name: "Near Clinic" },
      { name: "Chamber Member" }, { name: "Referral Source" },
    ]);
  }

  console.log(`\nBootstrapped ${where}:`);
  console.log("  • admin: carter@illumin8chiro.com");
  console.log(`  • password: ${process.env.ADMIN_PASSWORD ? "(the ADMIN_PASSWORD you set)" : password}`);
  console.log("  • Albuquerque + 3 clinics, weekly goals, default tags");
  console.log("\n>> Sign in, then change this password in Settings → Profile.\n");
}

main();
