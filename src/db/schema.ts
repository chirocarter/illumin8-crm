import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// All datetimes are stored as local ISO strings ("YYYY-MM-DDTHH:mm:ss") so that
// date-range filtering is plain lexicographic comparison — readable and deterministic.

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  // admin | user | agent.
  // "agent" is a non-human identity for the AI outreach agent: it authenticates
  // by API key, never by password, and requireAdmin() rejects it.
  // NOTE the default is "admin" — any row created without an explicit role is
  // an administrator, so the agent-user script must always set it.
  role: text("role").notNull().default("admin"),
  /**
   * HMAC-SHA256 of this agent identity's API key, or null for people.
   *
   * A deterministic HMAC rather than a salted scrypt hash because the key
   * arrives as a bearer token and has to be looked UP by value; scrypt cannot
   * be queried. Kept apart from passwordHash on purpose — a leaked API key must
   * never become a UI login.
   *
   * The city on THIS row is what scopes the agent. Ownership is derived from
   * the identity that authenticated, never from a cityId in the request body,
   * so one market's agent cannot reach another's records.
   */
  agentKeyHash: text("agent_key_hash").unique(),
  cityId: integer("city_id"), // the market this person works; members are locked to it
  // What an hour of this person's time costs. Logged hours are multiplied by it
  // to give the labour half of marketing spend.
  hourlyRate: real("hourly_rate").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

// A market the clinic operates in (e.g. Albuquerque). Cities contain clinic
// locations, and every record is stamped with the city it belongs to so one
// market's workflow never mixes with another's.
export const cities = sqliteTable("cities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // NE Heights, Westside, Downtown
  address: text("address"),
  cityId: integer("city_id").references(() => cities.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  vertical: text("vertical").notNull().default("Other"),
  area: text("area").notNull().default("Other"), // NE Heights, Westside, Downtown, Rio Rancho, Other
  address: text("address"),
  website: text("website"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("New Prospect"),
  source: text("source"),
  ownerName: text("owner_name"), // owner / main contact person (free text)
  notes: text("notes"),
  clinicLocationId: integer("clinic_location_id").references(() => locations.id),
  partnershipScore: integer("partnership_score").notNull().default(3), // 1-5
  eventScore: integer("event_score").notNull().default(3), // 1-5
  relationshipStrength: text("relationship_strength").notNull().default("Cold"), // Cold | Warm | Strong
  // When this business became an Active Partner. Set the first time the status
  // reaches that value, so "partnerships confirmed this week" is answerable —
  // the status field alone only says where things stand now, not when.
  partnerSince: text("partner_since"),
  doNotContact: integer("do_not_contact", { mode: "boolean" }).notNull().default(false),
  lastContactedAt: text("last_contacted_at"),
  nextFollowUpAt: text("next_follow_up_at"),
  // ---- AI outreach agent ----
  // Null on every human-entered business; only the agent writes these.
  /** 0-100 fit score from the agent. Null = never researched. */
  aiFitScore: integer("ai_fit_score"),
  /**
   * The research itself, as JSON text:
   *   { summary, confidence, sources: [{url, note}], researchedAt, model }
   * One column because these are always written together, always displayed
   * together, and never filtered on individually — unlike aiFitScore, which is
   * a real column precisely so it can be sorted and filtered.
   */
  aiResearch: text("ai_research"),
  /**
   * The run that CREATED this business. Null means a human added it.
   * Doubles as the "created by agent" flag — a separate boolean would say
   * less and could disagree with this.
   */
  agentRunId: integer("agent_run_id"),
  /**
   * Deliberately separate from `status`. That column is the sales pipeline and
   * feeds the pipeline board, goals and reports; overloading it with review
   * states would corrupt all three.
   */
  aiReviewStatus: text("ai_review_status"),   // null | Pending | Approved | Rejected
  aiReviewReason: text("ai_review_reason"),
  /**
   * Who reviewed it and when. Both come from the CRM session and the server
   * clock - never from request input, and never writable through the agent API.
   * Without these, "Approved" records a verdict but not who stands behind it,
   * which is the half that makes the feedback worth keeping.
   */
  aiReviewedAt: text("ai_reviewed_at"),
  aiReviewedBy: integer("ai_reviewed_by").references(() => users.id),
  // Ownership stamps, on every record table:
  //   cityId → which market it belongs to (scopes the day-to-day workflow)
  //   userId → who created it (powers per-person stats)
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  title: text("title"),
  accountId: integer("account_id").references(() => accounts.id),
  phone: text("phone"),
  email: text("email"),
  preferredMethod: text("preferred_method"), // Phone | Email | Text | In Person
  contactType: text("contact_type").notNull().default("Other"),
  influenceLevel: text("influence_level").notNull().default("Medium"), // Low | Medium | High | Decision Maker
  relationshipStatus: text("relationship_status").notNull().default("New"), // New | Building | Established | Champion
  notes: text("notes"),
  source: text("source"),
  lastContactedAt: text("last_contacted_at"),
  nextFollowUpAt: text("next_follow_up_at"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Other"),
  partnerId: integer("partner_id"),
  accountId: integer("account_id").references(() => accounts.id),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").notNull().default("Active"), // Draft | Active | Paused | Completed
  trackingUrl: text("tracking_url"),
  offer: text("offer"),
  notes: text("notes"),
  // Random slug for the public QR sign-up page (/join/<token>)
  publicToken: text("public_token").unique(),
  // Which QR form this campaign shows: patient | partnership | lunch
  publicForm: text("public_form").notNull().default("patient"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const partners = sqliteTable("partners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  partnerType: text("partner_type").notNull().default("Business Partner"),
  status: text("status").notNull().default("Prospective"), // Prospective | Active | Paused | Ended
  startDate: text("start_date"),
  mainContactId: integer("main_contact_id").references(() => contacts.id),
  clinicLocationId: integer("clinic_location_id").references(() => locations.id),
  benefits: text("benefits"),
  notes: text("notes"),
  // Restaurant / drop box specifics
  dropBoxActive: integer("drop_box_active", { mode: "boolean" }).notNull().default(false),
  dropBoxStatus: text("drop_box_status"), // Placed | Needs Pickup | Needs Restock | Removed
  lastPickupAt: text("last_pickup_at"),
  nextPickupDueAt: text("next_pickup_due_at"),
  lunchOffer: text("lunch_offer"),
  cateringInfo: text("catering_info"),
  cardsCollected: integer("cards_collected").notNull().default(0),
  revenueSpent: real("revenue_spent").notNull().default(0),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const opportunities = sqliteTable("opportunities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  contactId: integer("contact_id").references(() => contacts.id),
  type: text("type").notNull().default("Other"),
  stage: text("stage").notNull().default("Prospect Identified"),
  expectedEventDate: text("expected_event_date"),
  nextStep: text("next_step"),
  nextFollowUpAt: text("next_follow_up_at"),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  clinicLocationId: integer("clinic_location_id").references(() => locations.id),
  notes: text("notes"),
  lossReason: text("loss_reason"),
  stageChangedAt: text("stage_changed_at").notNull().default(sql`(datetime('now','localtime'))`),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Other"),
  accountId: integer("account_id").references(() => accounts.id),
  contactId: integer("contact_id").references(() => contacts.id),
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  partnerId: integer("partner_id").references(() => partners.id),
  clinicLocationId: integer("clinic_location_id").references(() => locations.id),
  locationText: text("location_text"), // where the event physically happens
  startsAt: text("starts_at"),
  // Optional end time, so a meeting can be 2:00–3:00pm. Null means the event is
  // a point in time (or all-day) rather than a block.
  endsAt: text("ends_at"),
  status: text("status").notNull().default("Idea"),
  bookedAt: text("booked_at"), // set when status first moves to Booked/Confirmed — powers "Events Booked" metrics
  expectedAttendees: integer("expected_attendees").notNull().default(0),
  actualAttendees: integer("actual_attendees").notNull().default(0),
  screeningsCompleted: integer("screenings_completed").notNull().default(0),
  revenue: real("revenue").notNull().default(0),
  notes: text("notes"),
  followUpRequired: integer("follow_up_required", { mode: "boolean" }).notNull().default(false),
  followUpDueAt: text("follow_up_due_at"),
  outcomeNotes: text("outcome_notes"),
  /**
   * The vendor / exhibitor application cut-off.
   *
   * A real column, not a key inside aiResearch, because it has to be sorted,
   * filtered, compared against today and eventually turned into a task — none
   * of which a date buried in JSON does cheaply. Supporting context (what the
   * deadline covers, where it was published) still belongs in the research
   * blob; the normalized date lives here.
   *
   * Deliberately NOT followUpDueAt. That field means "chase the host AFTER the
   * event happened" and drives Today's Focus and the post-event task sweep —
   * the same shape pointing the opposite way in time.
   */
  applicationDeadline: text("application_deadline"),
  // ---- AI outreach agent ----
  // Null on every human-entered event; only the agent writes these. Mirrors the
  // block on `accounts` field for field, so one review flow can serve both.
  /** 0-100 fit score from the agent. Null = never assessed. */
  aiFitScore: integer("ai_fit_score"),
  /**
   * The research itself, as JSON text: summary, confidence, sources, organizer
   * details, vendor cost, audience notes — and the changeLog that lets a
   * previously seen event be resurfaced on a material development instead of
   * discovered a second time.
   */
  aiResearch: text("ai_research"),
  /** The run that DISCOVERED this event. Null means a human added it. */
  agentRunId: integer("agent_run_id"),
  /**
   * Deliberately separate from `status`. That column is the event lifecycle —
   * Idea → Planning → Booked → Completed — and it feeds the calendar, the
   * pipeline board, the 6-events-a-week goal and bookedAt. Overloading it with
   * a review state would corrupt all four.
   *
   * An agent-discovered event is born status 'Idea' + Pending. Approval sets
   * this to 'Approved' and leaves status alone; only human CRM actions may
   * cross the Booked boundary and stamp bookedAt.
   */
  aiReviewStatus: text("ai_review_status"),   // null | Pending | Approved | Rejected
  aiReviewReason: text("ai_review_reason"),
  /** Who reviewed it and when — from the session and the server clock, never
      from request input, and never writable through the agent API. */
  aiReviewedAt: text("ai_reviewed_at"),
  aiReviewedBy: integer("ai_reviewed_by").references(() => users.id),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

// Long-running initiatives that aren't deals or campaigns — e.g. getting
// in-network with Presbyterian. Updates are regular activities linked here.
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Active"), // Active | On Hold | Completed | Archived
  nextStep: text("next_step"),
  targetDate: text("target_date"),
  accountId: integer("account_id").references(() => accounts.id), // related business, if any
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  outcome: text("outcome"),
  accountId: integer("account_id").references(() => accounts.id),
  contactId: integer("contact_id").references(() => contacts.id),
  leadId: integer("lead_id").references(() => leads.id), // for touches with leads (screenings, drop box cards) that have no business
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  eventId: integer("event_id").references(() => events.id),
  partnerId: integer("partner_id").references(() => partners.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  projectId: integer("project_id").references(() => projects.id),
  occurredAt: text("occurred_at").notNull().default(sql`(datetime('now','localtime'))`),
  nextFollowUpAt: text("next_follow_up_at"),
  notes: text("notes"),
  // Written by the app rather than by a person — e.g. an event status change.
  // Kept in the history so the record explains itself, but excluded from every
  // activity metric: it isn't outreach anyone did.
  systemGenerated: integer("system_generated", { mode: "boolean" }).notNull().default(false),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  status: text("status").notNull().default("Open"), // Open | Completed | Canceled
  accountId: integer("account_id").references(() => accounts.id),
  contactId: integer("contact_id").references(() => contacts.id),
  // A follow-up scheduled for a lead needs somewhere to point, or it is
  // orphaned and can never be matched back to that lead.
  leadId: integer("lead_id").references(() => leads.id),
  opportunityId: integer("opportunity_id").references(() => opportunities.id),
  eventId: integer("event_id").references(() => events.id),
  activityId: integer("activity_id").references(() => activities.id),
  projectId: integer("project_id").references(() => projects.id),
  notes: text("notes"),
  completedAt: text("completed_at"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone"),
  email: text("email"),
  source: text("source"), // Drop Box | Event | QR Code | Referral | Walk-in | Other
  campaignId: integer("campaign_id").references(() => campaigns.id),
  eventId: integer("event_id").references(() => events.id),
  partnerId: integer("partner_id").references(() => partners.id),
  accountId: integer("account_id").references(() => accounts.id),
  interestLevel: text("interest_level").notNull().default("Unknown"), // Hot | Warm | Cool | Unknown
  apptStatus: text("appt_status").notNull().default("Not Contacted"),
  preferredLocationId: integer("preferred_location_id").references(() => locations.id),
  notes: text("notes"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").references(() => leads.id),
  contactId: integer("contact_id").references(() => contacts.id),
  personName: text("person_name").notNull().default(""), // denormalized display name
  source: text("source"),
  eventId: integer("event_id").references(() => events.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  partnerId: integer("partner_id").references(() => partners.id),
  accountId: integer("account_id").references(() => accounts.id),
  locationId: integer("location_id").references(() => locations.id),
  scheduledAt: text("scheduled_at"),
  status: text("status").notNull().default("Booked"),
  offer: text("offer"),
  revenue: real("revenue").notNull().default(0), // amount CHARGED for the new-patient visit
  collected: integer("collected", { mode: "boolean" }).notNull().default(false), // has the charged amount been collected?
  notes: text("notes"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const accountTags = sqliteTable("account_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  tagId: integer("tag_id").notNull().references(() => tags.id),
});

export const contactTags = sqliteTable("contact_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  tagId: integer("tag_id").notNull().references(() => tags.id),
});

// Weekly goals for the Goal Progress report. `metric` is a key from src/lib/metrics.ts
export const reportGoals = sqliteTable("report_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metric: text("metric").notNull().unique(),
  label: text("label").notNull(),
  weeklyTarget: integer("weekly_target").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Small file library — flyers, one-pagers, contracts, credentialing paperwork.
// Bytes live in the database so files travel with it (local file or Turso alike).
// Attachable to a project, campaign, or business; standalone otherwise.
// Flat, one-level folders for the document library ("Flyers", "Contracts",
// "Brand Assets"). Deliberately not a tree: this library holds tens of files,
// and nesting would buy breadcrumbs and move-to-parent for no real gain.
export const documentFolders = sqliteTable("document_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),          // display name
  fileName: text("file_name").notNull(), // original file name (for downloads)
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0), // bytes
  data: blob("data", { mode: "buffer" }).notNull(),
  // Filing (library) and attachment (which record it belongs to) are separate
  // axes — a project's contract can also live in the "Contracts" folder.
  folderId: integer("folder_id").references(() => documentFolders.id),
  projectId: integer("project_id").references(() => projects.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  accountId: integer("account_id").references(() => accounts.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

// ---- Marketing spend ----
// Spend has two halves and they are stored separately because they are
// recorded differently: time is logged in hours and priced from the person's
// rate, money is logged as an amount. Both roll up into one Marketing Spend
// figure on the dashboard and the performance report.

/** Hours worked. Cost is hours x the user's hourly rate at report time. */
export const timeEntries = sqliteTable("time_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workedOn: text("worked_on").notNull(),        // YYYY-MM-DD
  hours: real("hours").notNull().default(0),
  notes: text("notes"),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

/** Money spent — flyers, catering, giveaways. Optionally tied to who it was for. */
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  spentOn: text("spent_on").notNull(),          // YYYY-MM-DD
  amount: real("amount").notNull().default(0),
  notes: text("notes"),                          // what it was for
  category: text("category").notNull().default("Other"),
  accountId: integer("account_id").references(() => accounts.id),
  contactId: integer("contact_id").references(() => contacts.id),
  leadId: integer("lead_id").references(() => leads.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  eventId: integer("event_id").references(() => events.id),
  cityId: integer("city_id").references(() => cities.id),
  userId: integer("user_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

// ============================ AI outreach agent ============================
//
// ONE shared system, one agent IDENTITY PER CITY. There is a single set of
// tables, a single API and a single UI; "Illumin8 AI — Albuquerque" and
// "Illumin8 AI — McKinney" are two rows in `users`, each with its own cityId
// and its own API key. Nothing here knows the name of a city.
//
// cityId is NOT NULL on both tables, unlike the nullable stamps on the older
// record tables. Those are nullable only because rows predate the column; an
// agent row can never predate it, and a run with no city could not be scoped.

/** One execution of the outreach agent, start to finish. */
export const agentRuns = sqliteTable("agent_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().default("running"), // running | completed | failed
  /** What kicked it off — "manual", "scheduled", a Make scenario id. Free text. */
  trigger: text("trigger"),
  /** Populated when status is failed; null otherwise. */
  error: text("error"),
  startedAt: text("started_at").notNull().default(sql`(datetime('now','localtime'))`),
  completedAt: text("completed_at"),
  // Inherited from the authenticating agent identity, never from the request.
  cityId: integer("city_id").notNull().references(() => cities.id),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});

/**
 * Every action the agent took, in order. This is the ledger: run COUNTS are
 * derived from it with one GROUP BY rather than stored on agent_runs, so the
 * headline number and the list behind it cannot disagree — the same rule the
 * rest of this app's metrics follow.
 */
export const agentActivities = sqliteTable("agent_activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentRunId: integer("agent_run_id").notNull().references(() => agentRuns.id),
  /** The business acted on, when there is one (a bare error has none). */
  accountId: integer("account_id").references(() => accounts.id),
  /**
   * The event acted on, when the action was about an event rather than a
   * business. Exactly one of these is normally set; a bare error has neither.
   * Without it the ledger could record that the agent did something to an event
   * but not to WHICH event, which would stop it being an audit trail.
   */
  eventId: integer("event_id").references(() => events.id),
  /** One of AGENT_ACTIONS — a fixed vocabulary is what makes counts derivable. */
  action: text("action").notNull(),
  /** One short human-readable line: why it was skipped, what was found. */
  detail: text("detail"),
  // Copied from the run so the dashboard can scope without a join.
  cityId: integer("city_id").notNull().references(() => cities.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now','localtime'))`),
});
