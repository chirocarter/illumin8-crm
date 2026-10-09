// Screening intake forms: the interest form, the pick-a-time form, capacity,
// the waitlist, and the time sheet.
//
// Same isolation as event-research.test.ts: a throwaway in-memory SQLite
// database built from the real migrations and injected as globalThis.__db, so
// the public form action below can reach nothing else.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
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
  screening: await import("@/lib/screening"),
  intake: await import("@/lib/screening-intake"),
  dates: await import("@/lib/dates"),
});
let m: Awaited<ReturnType<typeof load>>;

const one = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).get(...args) as T;
const all = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...args) as T[];
const leadCount = () => one<{ n: number }>("select count(*) n from leads").n;
const bookingCount = () => one<{ n: number }>("select count(*) n from screening_bookings").n;

let future = "", past = "";
let eventId = 0;

/** Submit the public form like a browser would; returns where it redirected. */
async function submit(token: string, fields: Record<string, string | string[]>): Promise<string> {
  const fd = new FormData();
  fd.append("token", token);
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  try {
    await m.submit(fd);
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return decodeURIComponent(digest.split(";")[2]);
    throw err;
  }
  return "(no redirect)";
}

/** A campaign as the app sees it (camelCase fields), not a raw row. */
const loadCampaign = async (where: { id?: number; token?: string }) => (await testDb.query.campaigns.findFirst({
  where: where.id ? eq(schema.campaigns.id, where.id) : eq(schema.campaigns.publicToken, where.token!),
}))!;

const person = (n: number) => ({ confirm: "yes", firstName: `Person${n}`, lastName: "Tester", phone: `50555501${String(n).padStart(2, "0")}`, email: "" });

function campaign(token: string, form: "screening" | "screening_slots", extra: Record<string, unknown> = {}) {
  const cols = { name: `ZZ ${token}`, public_token: token, public_form: form, event_id: eventId, city_id: 1, user_id: 1, ...extra };
  const keys = Object.keys(cols);
  sqlite.prepare(`insert into campaigns (${keys.join(", ")}) values (${keys.map(() => "?").join(", ")})`).run(...Object.values(cols));
  return one<{ id: number }>("select id from campaigns where public_token = ?", token).id;
}

before(async () => {
  m = await load();
  assert.equal(m.dbModule.db, testDb, "the form action must run on the throwaway database");
  const today = m.dates.todayISO();
  future = m.dates.addDays(today, 12);
  past = m.dates.addDays(today, -3);
  sqlite.exec(`
    INSERT OR IGNORE INTO cities (id, name, active) VALUES (1, 'Albuquerque', 1);
    INSERT INTO users (id, email, name, password_hash, role, city_id) VALUES (1, 'staff@example.test', 'Staff', 'x', 'admin', 1);
  `);
  sqlite.prepare("insert into events (name, type, status, starts_at, location_text, city_id, user_id) values (?, 'Community Event', 'Booked', ?, 'Sandia Corp HQ', 1, 1)")
    .run("Sandia Corp Wellness Day", `${future}T09:00:00`);
  eventId = one<{ id: number }>("select id from events").id;
});

// ---------------------------------------------------------------------------
// The window math
// ---------------------------------------------------------------------------

test("windows: a block is cut into 10-minute windows; labels read naturally", () => {
  const { screeningSlots, fmtSlotTime, fmtSlotRange } = m.screening;
  assert.deepEqual(screeningSlots("2027-03-01T09:00:00", "2027-03-01T09:40:00"),
    ["2027-03-01T09:00:00", "2027-03-01T09:10:00", "2027-03-01T09:20:00", "2027-03-01T09:30:00"]);
  assert.deepEqual(screeningSlots("2027-03-01T09:00:00", "2027-03-01T09:35:00").length, 3, "a partial window at the end is dropped");
  assert.deepEqual(screeningSlots("2027-03-01T09:00:00", "2027-03-02T10:00:00"), [], "one day only");
  assert.deepEqual(screeningSlots(null, null), []);
  assert.equal(fmtSlotTime("2027-03-01T13:05:00"), "1:05 PM");
  assert.equal(fmtSlotRange("2027-03-01T09:00:00"), "9:00–9:10 AM");
  assert.equal(fmtSlotRange("2027-03-01T11:55:00"), "11:55 AM–12:05 PM");
});

test("settings: date, start, end and people per window are validated", () => {
  const { parseSlotSettings } = m.screening;
  assert.deepEqual(parseSlotSettings({ date: "2027-03-01", start: "09:00", end: "11:00", capacity: "2" }),
    { ok: true, value: { slotsStart: "2027-03-01T09:00:00", slotsEnd: "2027-03-01T11:00:00", slotCapacity: 2 } });
  for (const [bad, why] of [
    [{ date: "", start: "09:00", end: "10:00" }, /date/],
    [{ date: "2027-02-30", start: "09:00", end: "10:00" }, /real date/],
    [{ date: "2027-03-01", start: "10:00", end: "09:00" }, /at least 10 minutes/],
    [{ date: "2027-03-01", start: "09:00", end: "09:05" }, /at least 10 minutes/],
    [{ date: "2027-03-01", start: "09:00", end: "10:00", capacity: "0" }, /1 to 20/],
    [{ date: "2027-03-01", start: "09:00", end: "10:00", capacity: "2.5" }, /whole number/],
  ] as const) {
    const r = parseSlotSettings(bad);
    assert.ok(!r.ok && why.test(r.error), JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------
// Interest form
// ---------------------------------------------------------------------------

test("interest form: confirm, first+last name and phone are required; nothing saved otherwise", async () => {
  campaign("interest", "screening");
  const before = leadCount();
  for (const missing of ["confirm", "firstName", "lastName", "phone"] as const) {
    const fields: Record<string, string> = { ...person(1) };
    delete fields[missing];
    assert.equal(await submit("interest", fields), "/join/interest?error=1", `missing ${missing}`);
  }
  assert.equal(await submit("interest", { ...person(1), phone: "n/a" }), "/join/interest?error=1");
  assert.equal(leadCount(), before);
});

test("interest form: saved as a Screening lead for the campaign and its event; only listed symptoms kept", async () => {
  const where = await submit("interest", {
    ...person(2), email: "p2@example.test",
    symptom: ["Neck pain", "Headaches or migraines", "<script>x</script>", "My full medical history…"],
  });
  assert.equal(where, "/join/thanks?f=screening");
  const lead = one<Record<string, any>>("select * from leads where first_name = 'Person2'");
  assert.equal(lead.source, "Screening");
  assert.equal(lead.event_id, eventId, "attributed to the event");
  assert.equal(lead.campaign_id, one<{ id: number }>("select id from campaigns where public_token = 'interest'").id);
  assert.equal(lead.city_id, 1);
  assert.match(lead.notes, /Wants to take part in the spinal health screening at Sandia Corp Wellness Day/);
  assert.match(lead.notes, /Symptoms: Neck pain, Headaches or migraines$/, "free text and unknown values are dropped");
  assert.equal(bookingCount(), 0, "the interest form never books a time");
});

// ---------------------------------------------------------------------------
// Pick-a-time form
// ---------------------------------------------------------------------------

let slotsId = 0;
const at = (hhmm: string) => `${future}T${hhmm}:00`;

test("pick a time: a valid window is booked and shown back on the thank-you page", async () => {
  slotsId = campaign("slots", "screening_slots", { slots_start: at("09:00"), slots_end: at("09:30"), slot_capacity: 2 });
  const where = await submit("slots", { ...person(3), slot: at("09:10") });
  assert.equal(where, `/join/thanks?f=screening&t=${at("09:10")}`);
  const b = one<Record<string, any>>("select * from screening_bookings");
  assert.equal(b.slot_start, at("09:10"));
  assert.equal(b.campaign_id, slotsId);
  assert.equal(b.lead_id, one<{ id: number }>("select id from leads where first_name = 'Person3'").id);
});

test("pick a time: no window or a made-up one is refused while times are open", async () => {
  const leads = leadCount();
  assert.equal(await submit("slots", { ...person(4) }), "/join/slots?error=pick");
  assert.equal(await submit("slots", { ...person(4), slot: at("09:05") }), "/join/slots?error=pick", "off the 10-minute grid");
  assert.equal(await submit("slots", { ...person(4), slot: at("13:00") }), "/join/slots?error=pick", "outside the block");
  assert.equal(leadCount(), leads);
});

test("pick a time: capacity holds even when people grab the last spots at the same moment", async () => {
  // 09:20 holds 2. Five people submit for it at once.
  const leads = leadCount(), bookings = bookingCount();
  const results = await Promise.all([5, 6, 7, 8, 9].map((n) => submit("slots", { ...person(n), slot: at("09:20") })));
  assert.equal(results.filter((r) => r.startsWith("/join/thanks")).length, 2, JSON.stringify(results));
  assert.equal(results.filter((r) => r === "/join/slots?error=slot").length, 3);
  assert.equal(one<{ n: number }>("select count(*) n from screening_bookings where slot_start = ?", at("09:20")).n, 2);
  assert.equal(bookingCount(), bookings + 2);
  assert.equal(leadCount(), leads + 2, "the three who missed out left no lead claiming a time");
});

test("pick a time: when every window is full, people join a waitlist instead", async () => {
  // Fill what's left: 09:00 ×2, 09:10 ×1 more.
  for (const [n, slot] of [[10, "09:00"], [11, "09:00"], [12, "09:10"]] as const) {
    assert.match(await submit("slots", { ...person(n), slot: at(slot) }), /^\/join\/thanks/);
  }
  const state = await m.intake.screeningState(await loadCampaign({ id: slotsId }));
  assert.equal(state.windows.length, 3);
  assert.ok(state.windows.every((w) => w.full && w.taken === 2));
  const bookings = bookingCount();
  assert.equal(await submit("slots", { ...person(13) }), "/join/thanks?f=screening&w=1");
  const lead = one<{ notes: string }>("select notes from leads where first_name = 'Person13'");
  assert.match(lead.notes, /Waitlist — every screening time was full/);
  assert.equal(bookingCount(), bookings, "a waitlisted person has no time");
});

test("closed: a screening day in the past, or a canceled event, takes no sign-ups", async () => {
  campaign("past", "screening_slots", { slots_start: `${past}T09:00:00`, slots_end: `${past}T10:00:00` });
  const leads = leadCount();
  assert.equal(await submit("past", { ...person(14), slot: `${past}T09:00:00` }), "/join/past");
  sqlite.prepare("insert into events (name, type, status, starts_at, city_id, user_id) values ('Called off', 'Community Event', 'Canceled', ?, 1, 1)").run(`${future}T09:00:00`);
  const canceledEvent = one<{ id: number }>("select id from events where name = 'Called off'").id;
  campaign("canceled", "screening", { event_id: canceledEvent });
  assert.equal(await submit("canceled", person(15)), "/join/canceled");
  assert.equal(leadCount(), leads);
});

// ---------------------------------------------------------------------------
// The time sheet
// ---------------------------------------------------------------------------

test("time sheet: every window and seat, names linked to leads; moved bookings stay visible", async () => {
  const c = () => loadCampaign({ id: slotsId });
  let sheet = (await m.intake.timeSheets([await c()])).get(slotsId)!;
  assert.equal(sheet.capacity, 2);
  assert.equal(sheet.spots, 6);
  assert.equal(sheet.booked, 6);
  assert.deepEqual(sheet.rows.map((r) => r.start), [at("09:00"), at("09:10"), at("09:20")]);
  const p3 = one<{ id: number }>("select id from leads where first_name = 'Person3'").id;
  assert.ok(sheet.rows[1].people.some((p) => p.leadId === p3 && p.name === "Person3 Tester" && p.phone === "(505) 555-0103"),
    JSON.stringify(sheet.rows[1].people));
  assert.deepEqual(sheet.outside, []);

  // The organizer shortens the block after people booked 09:20.
  sqlite.prepare("update campaigns set slots_end = ? where id = ?").run(at("09:20"), slotsId);
  sheet = (await m.intake.timeSheets([await c()])).get(slotsId)!;
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.outside.length, 2, "the two 09:20 bookings are listed, not lost");
  assert.ok(sheet.outside.every((p) => p.start === at("09:20")));

  // An interest-form campaign has no sheet.
  assert.equal((await m.intake.timeSheets([await loadCampaign({ token: "interest" })])).size, 0);
});

test("a booking can't outlive its lead: the database refuses, so deletes must clear it first", () => {
  const lead = one<{ lead_id: number }>("select lead_id from screening_bookings limit 1").lead_id;
  assert.throws(() => sqlite.prepare("delete from leads where id = ?").run(lead), /FOREIGN KEY/);
  sqlite.prepare("delete from screening_bookings where lead_id = ?").run(lead);
  sqlite.prepare("delete from leads where id = ?").run(lead);
  assert.equal(all("select * from leads where id = ?", lead).length, 0);
});
