// Event-review integration for the research agent: what the agent may send,
// what gets stored, how review shows it, and who can see which city.
//
// ISOLATED BY CONSTRUCTION. Every test runs against a throwaway in-memory
// SQLite database built from the real committed migrations. The app's `db`
// module reuses `globalThis.__db` when one exists, so the injected database is
// the only one any route or query below can reach — the Turso variables are
// removed and the local data/outreach.db file is never opened. The agent
// credentials are generated here and live only in that memory.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as schema from "../src/db/schema";

delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.AGENT_KEY_SECRET = randomBytes(24).toString("hex");

const sqlite = new Database(":memory:");
sqlite.pragma("foreign_keys = ON");
const testDb = drizzle(sqlite, { schema });
migrate(testDb, { migrationsFolder: "drizzle" });
(globalThis as { __db?: unknown }).__db = testDb;

const load = async () => ({
  dbModule: await import("@/db"),
  createEvent: (await import("@/app/api/agent/events/route")).POST,
  getEvent: (await import("@/app/api/agent/events/[id]/route")).GET,
  patchResearch: (await import("@/app/api/agent/events/[id]/research/route")).PATCH,
  searchEvents: (await import("@/app/api/agent/events/search/route")).GET,
  prospects: await import("@/lib/agent-event-prospects"),
  review: await import("@/lib/agent-event-review"),
  aiReview: await import("@/lib/ai-review"),
  metrics: await import("@/lib/metrics"),
  scope: await import("@/lib/scope"),
  keys: await import("@/lib/agent-key"),
  dates: await import("@/lib/dates"),
  contact: await import("@/lib/contact-links"),
  OrganizerContact: (await import("@/components/OrganizerContact")).default,
});
let m: Awaited<ReturnType<typeof load>>;

const ABQ = 1, MCK = 2;
const ABQ_AGENT_RUN = 1, MCK_AGENT_RUN = 2;
let abqKey = "", mckKey = "";
let future = "", past = "", today = "";

const rows = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...args) as T[];
const one = <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).get(...args) as T;
const eventCount = () => one<{ n: number }>("select count(*) n from events").n;
const ledgerCount = () => one<{ n: number }>("select count(*) n from agent_activities").n;

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call(handler: unknown, method: string, path: string, key: string, body?: unknown, id?: number) {
  const req = new NextRequest(`http://crm.test${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve({ id: String(id ?? "") }) });
  return { status: res.status, json: await res.json() as Record<string, any> };
}

before(async () => {
  m = await load();
  assert.equal(m.dbModule.db, testDb, "routes must be running on the throwaway database, nothing else");

  today = m.dates.todayISO();
  future = m.dates.addDays(today, 45);
  past = m.dates.addDays(today, -10);

  abqKey = m.keys.generateAgentKey();
  mckKey = m.keys.generateAgentKey();
  // Migration 0007 seeds Albuquerque as city 1; reuse it rather than fight it.
  sqlite.exec(`
    INSERT OR IGNORE INTO cities (id, name, active) VALUES (${ABQ}, 'Albuquerque', 1);
    INSERT INTO cities (id, name, active) VALUES (${MCK}, 'McKinney', 1);
  `);
  assert.deepEqual(rows("select id, name from cities order by id"), [{ id: ABQ, name: "Albuquerque" }, { id: MCK, name: "McKinney" }]);
  const user = sqlite.prepare("INSERT INTO users (id, email, name, password_hash, role, city_id, agent_key_hash) VALUES (?, ?, ?, 'not-a-password', ?, ?, ?)");
  user.run(1, "admin@example.test", "Admin", "admin", ABQ, null);
  user.run(2, "member@example.test", "Member", "user", ABQ, null);
  user.run(3, "abq-agent@example.test", "ABQ agent", "agent", ABQ, m.keys.hashAgentKey(abqKey));
  user.run(4, "mck-agent@example.test", "McKinney agent", "agent", MCK, m.keys.hashAgentKey(mckKey));
  const run = sqlite.prepare("INSERT INTO agent_runs (id, status, trigger, started_at, city_id, user_id) VALUES (?, 'running', 'test', ?, ?, ?)");
  run.run(ABQ_AGENT_RUN, m.dates.nowISO(), ABQ, 3);
  run.run(MCK_AGENT_RUN, m.dates.nowISO(), MCK, 4);
});

// ---------------------------------------------------------------------------
// 1. The research validator
// ---------------------------------------------------------------------------

test("research: recommendedAction and organizerContact are kept, bounded; unknown keys dropped", () => {
  const { validateEventResearch, MAX_RECOMMENDED_ACTION_LENGTH, MAX_TEXT_LENGTH } = m.prospects;
  const ok = validateEventResearch({
    summary: "Annual expo", organizerContact: "Jane Roe, jane@abqexpo.org",
    recommendedAction: "Apply for a 10x10 booth before the deadline.", inventedField: "dropped",
  });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.value.recommendedAction, "Apply for a 10x10 booth before the deadline.");
  assert.equal(ok.ok && ok.value.organizerContact, "Jane Roe, jane@abqexpo.org");
  assert.ok(ok.ok && !("inventedField" in ok.value));

  assert.ok(validateEventResearch({ recommendedAction: "x".repeat(MAX_RECOMMENDED_ACTION_LENGTH) }).ok, "exactly at the cap is fine");
  const tooLong = validateEventResearch({ recommendedAction: "x".repeat(MAX_RECOMMENDED_ACTION_LENGTH + 1) });
  assert.ok(!tooLong.ok && /recommendedAction exceeds 500/.test(tooLong.error));
  const notText = validateEventResearch({ recommendedAction: { do: "book it" } });
  assert.ok(!notText.ok && /recommendedAction must be a string/.test(notText.error));
  assert.ok(!validateEventResearch({ organizerContact: "x".repeat(MAX_TEXT_LENGTH + 1) }).ok);
});

test("research: malformed payloads are rejected whole, never coerced", () => {
  const { validateEventResearch } = m.prospects;
  for (const [label, bad, message] of [
    ["an array", [], /must be a JSON object/],
    ["a string", "great event", /must be a JSON object/],
    ["a javascript: source", { sources: [{ url: "javascript:alert(1)" }] }, /must be http or https/],
    ["an unknown confidence", { confidence: "certain" }, /confidence must be one of/],
    ["attendance as prose", { estimatedAttendance: "about 500" }, /estimatedAttendance must be an integer/],
    ["a negative attendance", { estimatedAttendance: -5 }, /estimatedAttendance must be an integer/],
    ["sources not a list", { sources: "https://x.org" }, /sources must be an array/],
  ] as const) {
    const r = validateEventResearch(bad);
    assert.ok(!r.ok, `${label} should be rejected`);
    assert.match(!r.ok ? r.error : "", message, label);
  }
});

// ---------------------------------------------------------------------------
// 2. Creating events: dated, undated, refused
// ---------------------------------------------------------------------------

let expoId = 0, fairId = 0, mckExpoId = 0;
const expoResearch = {
  summary: "Large consumer health expo with a vendor hall.",
  confidence: "medium",
  organizer: "ABQ Expo Group",
  organizerContact: "Jane Roe, jane@abqexpo.org, (505) 555-0142, https://abqexpo.org/vendors",
  vendorStatus: "Vendor applications open",
  recommendedAction: "Apply for a booth before the deadline; ask whether screenings are allowed.",
  sources: [{ url: "https://abqexpo.org/2027", label: "Expo site" }],
};

test("create, dated: research persisted; born Idea + Pending; nothing invented", async () => {
  const ledgerBefore = ledgerCount();
  const r = await call(m.createEvent, "POST", "/api/agent/events", abqKey, {
    agentRunId: ABQ_AGENT_RUN, name: "ABQ Health & Wellness Expo", type: "Expo / Booth",
    startsAt: future, locationText: "Expo New Mexico", aiFitScore: 80, aiResearch: expoResearch,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  expoId = r.json.id;
  assert.equal(r.json.status, "Idea");
  assert.equal(r.json.aiReviewStatus, "Pending");
  assert.equal(r.json.startsAt, `${future}T00:00:00`, "a bare date is stored at local midnight");

  const row = one<Record<string, any>>("select * from events where id = ?", expoId);
  assert.equal(row.status, "Idea");
  assert.equal(row.booked_at, null, "never booked");
  assert.equal(row.ai_review_status, "Pending");
  assert.equal(row.city_id, ABQ, "city comes from the credential");
  assert.equal(row.user_id, 3);
  assert.equal(row.expected_attendees, 0, "no attendance supplied → none recorded");
  const stored = JSON.parse(row.ai_research);
  assert.equal(stored.recommendedAction, expoResearch.recommendedAction);
  assert.equal(stored.organizerContact, expoResearch.organizerContact);
  assert.ok(!("estimatedAttendance" in stored) && !("vendorCost" in stored), "unknown facts stay absent");
  assert.equal(ledgerCount(), ledgerBefore + 1, "one 'created' ledger entry");

  const read = await call(m.getEvent, "GET", `/api/agent/events/${expoId}`, abqKey, undefined, expoId);
  assert.equal(read.status, 200);
  assert.equal(read.json.event.aiResearch.recommendedAction, expoResearch.recommendedAction);
  assert.equal(read.json.event.aiResearch.organizerContact, expoResearch.organizerContact);
});

test("create, undated: supported, and stays undated", async () => {
  const r = await call(m.createEvent, "POST", "/api/agent/events", abqKey, {
    agentRunId: ABQ_AGENT_RUN, name: "Rio Grande Community Health Fair",
    aiResearch: { summary: "Date not announced yet.", recommendedAction: "Watch for the date." },
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  fairId = r.json.id;
  assert.equal(r.json.startsAt, null);
  assert.equal(r.json.endsAt, null);
  assert.equal(r.json.type, "Community Event", "the documented default type");
  assert.equal(one<{ starts_at: string | null }>("select starts_at from events where id = ?", fairId).starts_at, null);
});

test("create: past or impossible dates, forbidden fields and bad research are refused, writing nothing", async () => {
  const events = eventCount(), ledger = ledgerCount();
  const refused = [
    [{ name: "Old Expo", startsAt: past }, /in the past/],
    [{ name: "Leap Expo", startsAt: "2027-02-31" }, /startsAt" must be YYYY-MM-DD/],
    [{ name: "Booked Expo", status: "Booked" }, /cannot be supplied: status/],
    [{ name: "Moved Expo", cityId: MCK }, /cannot be supplied: cityId/],
    [{ name: "Calendar Block", type: "Time Off / Away" }, /"type" must be one of/],
    [{ name: "Broken Research Expo", aiResearch: { sources: [{ url: "javascript:alert(1)" }] } }, /http or https/],
    [{ name: "Long Advice Expo", aiResearch: { recommendedAction: "x".repeat(501) } }, /recommendedAction exceeds/],
  ] as const;
  for (const [extra, message] of refused) {
    const r = await call(m.createEvent, "POST", "/api/agent/events", abqKey, { agentRunId: ABQ_AGENT_RUN, ...extra });
    assert.equal(r.status, 400, `${extra.name}: ${JSON.stringify(r.json)}`);
    assert.match(r.json.error, message, extra.name);
  }
  assert.equal(eventCount(), events, "no event row written");
  assert.equal(ledgerCount(), ledger, "no ledger row written");
});

// ---------------------------------------------------------------------------
// 3. Duplicates
// ---------------------------------------------------------------------------

test("duplicates: same normalized name in the same city is refused and logged, not created", async () => {
  const events = eventCount();
  const dated = await call(m.createEvent, "POST", "/api/agent/events", abqKey, {
    agentRunId: ABQ_AGENT_RUN, name: "The 3rd Annual ABQ Health and Wellness Expo 2027", startsAt: future,
  });
  assert.equal(dated.status, 409, JSON.stringify(dated.json));
  assert.equal(dated.json.created, false);
  assert.equal(dated.json.duplicateOf, expoId);
  assert.deepEqual(dated.json.matchedOn, ["name", "date"]);

  // A dated proposal for something already on file WITHOUT a date is the same event.
  const undated = await call(m.createEvent, "POST", "/api/agent/events", abqKey, {
    agentRunId: ABQ_AGENT_RUN, name: "Rio Grande Community Health Fair", startsAt: future,
  });
  assert.equal(undated.status, 409);
  assert.equal(undated.json.duplicateOf, fairId);
  assert.deepEqual(undated.json.matchedOn, ["name", "undated"]);

  assert.equal(eventCount(), events, "neither duplicate created a row");
  assert.equal(one<{ n: number }>("select count(*) n from agent_activities where action = 'duplicate_skipped'").n, 2);
});

test("duplicates: same venue, different event is allowed with a soft warning", async () => {
  const r = await call(m.createEvent, "POST", "/api/agent/events", abqKey, {
    agentRunId: ABQ_AGENT_RUN, name: "Albuquerque Pet Expo", startsAt: future, locationText: "EXPO New Mexico",
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.deepEqual(r.json.venueCollisionWith, { eventId: expoId, name: "ABQ Health & Wellness Expo" });
});

test("duplicates: checked within one city only — another market may hold the same name", async () => {
  const r = await call(m.createEvent, "POST", "/api/agent/events", mckKey, {
    agentRunId: MCK_AGENT_RUN, name: "ABQ Health & Wellness Expo", startsAt: future,
    aiResearch: { recommendedAction: "McKinney-only advice" },
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  mckExpoId = r.json.id;
  assert.equal(r.json.city, "McKinney");
  assert.equal(one<{ city_id: number }>("select city_id from events where id = ?", mckExpoId).city_id, MCK);
});

// ---------------------------------------------------------------------------
// 4. Research refresh
// ---------------------------------------------------------------------------

test("research refresh: replaces the snapshot, never touches review or lifecycle", async () => {
  const r = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: ABQ_AGENT_RUN, aiFitScore: 85,
    aiResearch: { ...expoResearch, recommendedAction: "Ask the organizer about a screening table." },
  }, expoId);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.aiResearch.recommendedAction, "Ask the organizer about a screening table.");
  const row = one<Record<string, any>>("select * from events where id = ?", expoId);
  assert.equal(JSON.parse(row.ai_research).recommendedAction, "Ask the organizer about a screening table.");
  assert.equal(row.status, "Idea");
  assert.equal(row.booked_at, null);
  assert.equal(row.ai_review_status, "Pending");

  const before = row.ai_research;
  const tooLong = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: ABQ_AGENT_RUN, aiResearch: { recommendedAction: "x".repeat(501) },
  }, expoId);
  assert.equal(tooLong.status, 400);
  const booking = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: ABQ_AGENT_RUN, status: "Booked",
  }, expoId);
  assert.equal(booking.status, 400);
  assert.match(booking.json.error, /Cannot be set here: status/);
  assert.equal(one<{ ai_research: string }>("select ai_research from events where id = ?", expoId).ai_research, before,
    "refused requests changed nothing");
});

test("research refresh: a snapshot replaces fields, but the changeLog is append-only", async () => {
  const withDevelopment = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: ABQ_AGENT_RUN,
    aiResearch: { ...expoResearch, recommendedAction: "Ask the organizer about a screening table." },
    development: { kind: "booth_pricing_published", detail: "Booths now listed at $250", occurredAt: today },
  }, expoId);
  assert.equal(withDevelopment.status, 200, JSON.stringify(withDevelopment.json));
  assert.equal(withDevelopment.json.action, "resurfaced");
  assert.equal(withDevelopment.json.changeLogEntries, 1);

  // Leave vendorStatus and the changeLog out of the next snapshot.
  const { vendorStatus: _dropped, ...withoutVendor } = expoResearch;
  const refresh = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: ABQ_AGENT_RUN, aiResearch: { ...withoutVendor, recommendedAction: "Ask the organizer about a screening table." },
  }, expoId);
  assert.equal(refresh.status, 200);
  assert.equal(refresh.json.action, "researched");
  const stored = JSON.parse(one<{ ai_research: string }>("select ai_research from events where id = ?", expoId).ai_research);
  assert.ok(!("vendorStatus" in stored), "a field left out of the snapshot is cleared");
  assert.deepEqual(stored.changeLog.map((c: { note: string }) => c.note), ["booth_pricing_published: Booths now listed at $250"],
    "history survives a payload that forgot it");
});

// ---------------------------------------------------------------------------
// 5. City isolation — the agent API
// ---------------------------------------------------------------------------

test("agent isolation: another city's agent cannot read, change or find an event", async () => {
  const before = one<{ ai_research: string; ai_fit_score: number }>("select ai_research, ai_fit_score from events where id = ?", expoId);

  const read = await call(m.getEvent, "GET", `/api/agent/events/${expoId}`, mckKey, undefined, expoId);
  assert.equal(read.status, 404, "not 403: another city's ids must not be confirmable");
  const write = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, mckKey, {
    agentRunId: MCK_AGENT_RUN, aiFitScore: 1, aiResearch: { summary: "overwritten" },
  }, expoId);
  assert.equal(write.status, 404);
  assert.deepEqual(one("select ai_research, ai_fit_score from events where id = ?", expoId), before, "untouched");

  // Using the OTHER city's run is just as dead an end.
  const foreignRun = await call(m.patchResearch, "PATCH", `/api/agent/events/${expoId}/research`, abqKey, {
    agentRunId: MCK_AGENT_RUN, aiFitScore: 1,
  }, expoId);
  assert.equal(foreignRun.status, 404);

  const mckSearch = await call(m.searchEvents, "GET", "/api/agent/events/search?q=Wellness&cityId=1", mckKey);
  assert.equal(mckSearch.status, 200);
  assert.deepEqual(mckSearch.json.matches.map((x: { id: number }) => x.id), [mckExpoId], "only McKinney's, cityId param ignored");
  const abqSearch = await call(m.searchEvents, "GET", "/api/agent/events/search?q=Wellness", abqKey);
  assert.deepEqual(abqSearch.json.matches.map((x: { id: number }) => x.id), [expoId]);
});

// ---------------------------------------------------------------------------
// 6. The review queue (what /agent renders) and its city scope
// ---------------------------------------------------------------------------

test("review queue: carries recommendedAction and organizerContact; keeps undated finds; per city", async () => {
  const abq = await m.review.pendingEventsForReview(ABQ, today);
  const expo = abq.find((e) => e.id === expoId);
  assert.ok(expo, "the expo is waiting for review");
  assert.equal(expo!.recommendedAction, "Ask the organizer about a screening table.");
  assert.equal(expo!.organizerContact, expoResearch.organizerContact);

  const fair = abq.find((e) => e.id === fairId);
  assert.ok(fair, "an undated event is in the queue, not dropped");
  assert.equal(fair!.startsAt, null);
  assert.equal(fair!.estimatedAttendance, null, "no attendance invented");
  assert.equal(fair!.vendorCost, null, "no cost invented");
  assert.equal(fair!.expectedAttendees, 0);

  assert.ok(!abq.some((e) => e.id === mckExpoId), "McKinney's candidate is not in Albuquerque's queue");
  const mck = await m.review.pendingEventsForReview(MCK, today);
  assert.deepEqual(mck.map((e) => e.id), [mckExpoId]);
  // An admin's "All cities" view passes no city.
  const all = await m.review.pendingEventsForReview(null, today);
  assert.ok(all.some((e) => e.id === expoId) && all.some((e) => e.id === mckExpoId));
});

test("review queue: a malformed stored research blob shows as empty, never breaks the page", async () => {
  sqlite.prepare("update events set ai_research = '{not json' where id = ?").run(fairId);
  const fair = (await m.review.pendingEventsForReview(ABQ, today)).find((e) => e.id === fairId);
  assert.ok(fair);
  assert.equal(fair!.summary, null);
  assert.equal(fair!.recommendedAction, null);
  assert.deepEqual(fair!.sources, []);

  // Even a blob written around the validator only ever yields http(s) links.
  const parsed = m.review.parseEventResearch(JSON.stringify({
    organizerContact: 42, recommendedAction: ["not", "text"],
    sources: [{ url: "javascript:alert(1)" }, { url: "https://ok.example" }],
  }));
  assert.equal(parsed.organizerContact, null);
  assert.equal(parsed.recommendedAction, null);
  assert.deepEqual(parsed.sources, [{ url: "https://ok.example", label: undefined }]);
});

test("pending candidates stay off calendars and out of performance totals", async () => {
  const countable = rows<{ id: number }>("select id from events where ai_review_status is null or ai_review_status = 'Approved'");
  for (const id of [expoId, fairId, mckExpoId]) {
    assert.ok(!countable.some((e) => e.id === id), `event ${id} is not human-countable while pending`);
  }
  // The calendar and lists filter with humanCountableEvents(); prove it excludes them.
  const { db } = m.dbModule;
  const visible = await db.select({ id: schema.events.id }).from(schema.events).where(m.aiReview.humanCountableEvents());
  assert.equal(visible.length, 0);

  const totals = await m.metrics.metricValues(today, m.dates.addDays(today, 90), { cityId: ABQ });
  assert.equal(totals.events_booked.value, 0);
  assert.equal(totals.events_held.value, 0);
  assert.equal(totals.meetings_booked.value, 0);
});

// ---------------------------------------------------------------------------
// 7. Organizer contact display — untrusted text, safe links
// ---------------------------------------------------------------------------

test("organizer contact: email, phone and http(s) pieces become links; nothing else does", () => {
  const parts = m.contact.contactParts("Jane Roe, jane@abqexpo.org, (505) 555-0142, https://abqexpo.org/vendors.");
  assert.deepEqual(parts.filter((p) => p.kind !== "text").map((p) => [p.kind, "href" in p ? p.href : ""]), [
    ["email", "mailto:jane@abqexpo.org"],
    ["phone", "tel:5055550142"],
    ["url", "https://abqexpo.org/vendors"],
  ]);
  assert.equal(parts.map((p) => p.text).join(""), "Jane Roe, jane@abqexpo.org, (505) 555-0142, https://abqexpo.org/vendors.",
    "no text is lost or altered, the trailing period included");

  for (const unsafe of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "ftp://files.example/x"]) {
    assert.ok(m.contact.contactParts(unsafe).every((p) => p.kind === "text"), `${unsafe} stays text`);
  }
  assert.ok(m.contact.contactParts("Deadline 2027-11-14 10:00, zip 87110").every((p) => p.kind === "text"),
    "dates and zip codes are not phone numbers");
  assert.deepEqual(m.contact.contactParts("+44 20 7946 0958").map((p) => "href" in p ? p.href : null), ["tel:+442079460958"]);
  assert.deepEqual(m.contact.contactParts(null), []);
});

test("organizer contact renders escaped, with only safe hrefs", () => {
  const hostile = `<img src=x onerror=alert(1)> javascript:alert(1) https://ok.example/a"onmouseover="steal() call 505-555-0199`;
  const html = renderToStaticMarkup(createElement(m.OrganizerContact, { text: hostile }));
  assert.ok(!html.includes("<img"), "markup in the text is escaped, not rendered");
  assert.ok(html.includes("&lt;img"));
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(hrefs, ["https://ok.example/a", "tel:5055550199"], "the quote ends the URL; nothing injected");
  assert.ok(!/href="javascript/i.test(html));
  assert.ok(!/onmouseover=/.test(html.replace(/&quot;onmouseover=&quot;/g, "")), "no live attribute was created");
  assert.match(html, /<a href="https:\/\/ok\.example\/a" target="_blank" rel="noopener noreferrer nofollow"/);
  assert.equal(renderToStaticMarkup(createElement(m.OrganizerContact, { text: null })), "—");
});

// ---------------------------------------------------------------------------
// 8. City isolation — people
// ---------------------------------------------------------------------------

test("people: admins can view other cities; members are pinned to their own", () => {
  const cities = [{ id: ABQ, name: "Albuquerque" }, { id: MCK, name: "McKinney" }];
  const admin = { role: "admin", cityId: ABQ };
  const member = { role: "user", cityId: ABQ };
  const { cityViewFor, userCanAccessCity } = m.scope;

  assert.equal(cityViewFor(admin, cities, cities[0], String(MCK)).cityId, MCK, "admin may open McKinney");
  assert.equal(cityViewFor(admin, cities, cities[0], "all").cityId, null, "admin may see all cities");
  assert.equal(cityViewFor(admin, cities, cities[0], "all").canChoose, true);
  assert.equal(cityViewFor(admin, cities, cities[0], undefined).cityId, ABQ);

  const asked = cityViewFor(member, cities, cities[0], String(MCK));
  assert.equal(asked.cityId, ABQ, "a member asking for McKinney gets their own city back");
  assert.equal(asked.canChoose, false);
  assert.deepEqual(asked.options, []);
  assert.equal(cityViewFor(member, cities, cities[0], "all").cityId, ABQ, "and cannot widen to all");

  assert.equal(userCanAccessCity(admin, MCK), true, "admin can open a McKinney event page");
  assert.equal(userCanAccessCity(member, MCK), false, "member cannot");
  assert.equal(userCanAccessCity(member, ABQ), true);
  assert.equal(userCanAccessCity(null, ABQ), false, "nobody signed in, nothing visible");
});
