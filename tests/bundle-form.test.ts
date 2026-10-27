// "Learn More or Book $50": the booking route, the learn-more lead, and the
// public page itself.
//
// Same isolation as the other suites: a throwaway in-memory SQLite database
// built from the real migrations, injected as globalThis.__db.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import * as schema from "../src/db/schema";

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

const sqlite = new Database(":memory:");
sqlite.pragma("foreign_keys = ON");
const testDb = drizzle(sqlite, { schema });
migrate(testDb, { migrationsFolder: "drizzle" });
(globalThis as { __db?: unknown }).__db = testDb;

const load = async () => ({
  dbModule: await import("@/db"),
  submit: (await import("@/app/join/[token]/actions")).submitPublicLead,
  JoinPage: (await import("@/app/join/[token]/page")).default,
  offer: await import("@/lib/bundle-offer"),
});
let m: Awaited<ReturnType<typeof load>>;

const one = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).get(...args) as T;
const leadCount = () => one<{ n: number }>("select count(*) n from leads").n;
let abqLocation = 0, mckLocation = 0;

async function submit(token: string, fields: Record<string, string>): Promise<string> {
  const fd = new FormData();
  fd.append("token", token);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  try {
    await m.submit(fd);
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return decodeURIComponent(digest.split(";")[2]);
    throw err;
  }
  return "(no redirect)";
}

before(async () => {
  m = await load();
  assert.equal(m.dbModule.db, testDb);
  sqlite.exec(`
    INSERT OR IGNORE INTO cities (id, name, active) VALUES (1, 'Albuquerque', 1);
    INSERT INTO cities (id, name, active) VALUES (2, 'McKinney', 1);
    INSERT INTO users (id, email, name, password_hash, role, city_id) VALUES (1, 'staff@example.test', 'Staff', 'x', 'admin', 1);
    INSERT INTO locations (name, city_id, active) VALUES ('NE Heights', 1, 1), ('McKinney', 2, 1);
    INSERT INTO campaigns (name, public_token, public_form, city_id, user_id) VALUES ('ZZ Fall Printout', 'printout', 'bundle', 1, 1);
    INSERT INTO campaigns (name, public_token, public_form, city_id, user_id) VALUES ('ZZ Patient', 'patient', 'patient', 1, 1);
  `);
  abqLocation = one<{ id: number }>("select id from locations where name = 'NE Heights'").id;
  mckLocation = one<{ id: number }>("select id from locations where name = 'McKinney'").id;
});

test("offer: books through the department's Stripe link, at $50 (regularly $220)", () => {
  const o = m.offer.BUNDLE_OFFER;
  assert.equal(o.bookingUrl, "https://book.stripe.com/bJe5kD8KMbHxcKM0Qt5gc03");
  assert.equal(o.price, 50);
  assert.equal(o.regularPrice, 220);
  assert.equal(o.visits.length, 2);
});

test("page: two choices up front; Book now goes to Stripe, Learn more to the form", async () => {
  const el = await m.JoinPage({ params: Promise.resolve({ token: "printout" }), searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(el);
  assert.match(html, /<h1[^>]*>Your first two visits, \$50<\/h1>/);
  assert.match(html, /href="#book"[^>]*>Book now · \$50</);
  assert.match(html, /href="#learn"[^>]*>Learn more first</);
  const stripeLinks = [...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(stripeLinks, ["https://book.stripe.com/bJe5kD8KMbHxcKM0Qt5gc03"], "one outbound link, the Stripe checkout");
  assert.match(html, /Regularly \$220, now/);
  assert.match(html, /Option 2 · Learn more first/);
  assert.match(html.match(/<input[^>]*name="phone"[^>]*>/)?.[0] ?? "", /\brequired=""/, "phone is required");
  assert.match(html, /<option value="\d+">NE Heights<\/option>/);
  assert.ok(!html.includes(">McKinney</option>"), "only this campaign's city's clinics are offered");
  assert.ok(!html.includes("Sample read-out"), "the screening preview isn't on this form");
});

test("learn more: first name and a real phone number are required; nothing saved otherwise", async () => {
  const before = leadCount();
  assert.equal(await submit("printout", { phone: "5055550101" }), "/join/printout?error=1");
  assert.equal(await submit("printout", { firstName: "Ann", email: "a@example.test" }), "/join/printout?error=1");
  assert.equal(await submit("printout", { firstName: "Ann", phone: "n/a" }), "/join/printout?error=1");
  assert.equal(leadCount(), before);
});

test("learn more: saved as a campaign lead that says they want to learn more first", async () => {
  const where = await submit("printout", {
    firstName: "ZZ Ann", lastName: "Printout", phone: "5055550101", email: "ann@example.test",
    preferredLocationId: String(abqLocation), message: "Does insurance cover visits after the bundle?",
  });
  assert.equal(where, "/join/thanks?f=contact");
  const lead = one<Record<string, any>>("select * from leads where first_name = 'ZZ Ann'");
  assert.equal(lead.source, "QR Code");
  assert.equal(lead.campaign_id, one<{ id: number }>("select id from campaigns where public_token = 'printout'").id);
  assert.equal(lead.phone, "(505) 555-0101");
  assert.equal(lead.preferred_location_id, abqLocation);
  assert.equal(lead.notes,
    "Self-submitted via \"Learn More or Book $50\" form (ZZ Fall Printout) — Wants to learn more before booking the $50 new-patient bundle · Question / comment: Does insurance cover visits after the bundle?");
});

test("clinic choice: another city's clinic or a made-up id is dropped, never fatal", async () => {
  assert.match(await submit("printout", { firstName: "ZZ Other", phone: "5055550102", preferredLocationId: String(mckLocation) }), /thanks/);
  assert.equal(one<{ p: number | null }>("select preferred_location_id p from leads where first_name = 'ZZ Other'").p, null);
  assert.match(await submit("printout", { firstName: "ZZ Bogus", phone: "5055550103", preferredLocationId: "99999" }), /thanks/);
  assert.equal(one<{ p: number | null }>("select preferred_location_id p from leads where first_name = 'ZZ Bogus'").p, null);
  // The same guard now protects the new-patient form, which used to store any id.
  assert.match(await submit("patient", { firstName: "ZZ Pat", phone: "5055550104", preferredLocationId: "99999" }), /thanks/);
  assert.equal(one<{ p: number | null }>("select preferred_location_id p from leads where first_name = 'ZZ Pat'").p, null);
});
