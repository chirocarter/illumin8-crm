"use client";

// Log Activity as a funnel: one question per screen, big tap targets,
// built mobile-first. The flow adapts to the activity TYPE:
//   • touch    (Phone Call, Email, Meeting, Networking, …):
//        who → outcome → [event if Booked Event] → follow-up → notes
//   • results  (Screening Event, Lunch and Learn):
//        business → how many screened/attended → appts booked → add leads → notes
//        (creates a completed Event + the leads + one appointment per booked appt)
//   • dropbox  (Drop Box Visit):
//        business → cards collected → notes  (rolls into the partner's card total)
//   • note     (Note):
//        who (optional) → notes
import { useMemo, useState, useTransition } from "react";
import { logActivity } from "@/app/actions";
import {
  ACTIVITY_TYPES, ACCOUNT_STATUSES, EVENT_TYPES, INTEREST_LEVELS,
  LEAD_APPT_STATUSES, RELATIONSHIP_STRENGTHS, MEETING_EVENT_TYPES, APPOINTMENT_BOOKED_OUTCOME, outcomesFor,
} from "@/lib/taxonomy";
import { addDays, fmtDate, nowISO, todayISO } from "@/lib/dates";
import { Icon } from "./icons";

// Businesses and leads carry their current standing so the wizard can show
// what it is today before offering to change it.
type Slim = { id: number; name: string };
type SlimAccount = Slim & { status: string; relationship: string };
type SlimContact = { id: number; name: string; accountId: number | null; title: string | null };
type SlimLead = { id: number; name: string; phone: string | null; apptStatus: string; interest: string };
type SlimOpp = { id: number; name: string; accountId: number | null };
// Events carry enough to offer the right ones when logging results: a screening
// that was already booked should be UPDATED, not duplicated.
type SlimEvent = {
  id: number; name: string; status: string;
  accountId: number | null; startsAt: string | null; type: string;
};
type SlimPartner = { id: number; accountId: number };

type Prefill = Partial<{
  accountId: number; contactId: number; leadId: number; opportunityId: number; eventId: number;
  partnerId: number; campaignId: number; projectId: number; returnTo: string; type: string;
  /** The task whose "Log activity" button opened this — closed on save. */
  taskId: number;
}>;

type Phase =
  | "type" | "business" | "contact" | "outcome" | "event"
  | "results" | "leads" | "dropbox" | "standing" | "followup" | "newcontacts" | "details"
  | "pickevent" | "appointment";

type Flow = "touch" | "results" | "dropbox" | "note";
function flowFor(type: string | null): Flow {
  if (type === "Screening Event" || type === "Lunch and Learn") return "results";
  if (type === "Drop Box Visit") return "dropbox";
  if (type === "Note") return "note";
  return "touch";
}

const TYPE_EMOJI: Record<string, string> = {
  "Phone Call": "📞", Voicemail: "📮", Email: "✉️", Text: "💬",
  "In-Person Visit": "🚪", "Drop Box Visit": "📦", "Follow-Up": "🔁",
  Meeting: "🤝", "Lunch and Learn": "🍕", "Screening Event": "🩺",
  Networking: "🌐", Note: "📝", Other: "➕",
};

// Sensible default event type inferred from the activity type (for Booked Event).
const EVENT_TYPE_FROM_ACTIVITY: Record<string, string> = {
  "Lunch and Learn": "Lunch and Learn",
  "Screening Event": "Gym Screening",
  Networking: "Community Event",
};

// Outcomes that mean something got scheduled — each one opens the date/time
// screen so it appears on the calendar rather than living only in a note.
const BOOKING_OUTCOMES: readonly string[] = ["Booked Meeting", "Booked Event"];

const FOLLOWUP_CHIPS = [
  { label: "No follow-up", days: null },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
] as const;

// Module-scope on purpose: defining this inside the wizard would recreate the
// component on every keystroke, remounting the screen and yanking focus back
// to the first autoFocus input.
function Screen({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rise">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-soft">{sub}</p>}
      <div className="mt-5 space-y-2.5">{children}</div>
    </div>
  );
}

type CapturedPerson = { name: string; phone: string; booked: boolean; apptDate: string; locationId: string; revenue: string; collected: boolean };

export default function ActivityWizard({ accounts, contacts, leads, opportunities, events, campaigns, partners, locations, projects, prefill }: {
  accounts: SlimAccount[];
  contacts: SlimContact[];
  leads: SlimLead[];
  opportunities: SlimOpp[];
  events: SlimEvent[];
  campaigns: Slim[];
  partners: SlimPartner[];
  locations: Slim[];
  projects: Slim[];
  prefill: Prefill;
}) {
  const [phase, setPhase] = useState<Phase>("type");
  const [history, setHistory] = useState<Phase[]>([]);
  const [type, setType] = useState<string | null>(prefill.type ?? null);
  const [accountId, setAccountId] = useState<number | null>(prefill.accountId ?? null);
  const [contactId, setContactId] = useState<number | null>(prefill.contactId ?? null);
  const [leadId, setLeadId] = useState<number | null>(prefill.leadId ?? null);
  // Inline creation: people/businesses not in the system yet get created on save.
  const [newAccountName, setNewAccountName] = useState<string | null>(null);
  const [newAccountPhone, setNewAccountPhone] = useState("");
  const [newContact, setNewContact] = useState<{ name: string; phone: string; title: string; email: string } | null>(null);
  const [newLead, setNewLead] = useState<{ name: string; phone: string } | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  // Inline event capture (when outcome === "Booked Event")
  const [evType, setEvType] = useState<string>("Lunch and Learn");
  const [evStartsAt, setEvStartsAt] = useState("");
  const [evEndsAt, setEvEndsAt] = useState("");
  const [evExpected, setEvExpected] = useState("");
  const [evName, setEvName] = useState("");
  const [evLocationId, setEvLocationId] = useState("");
  // Results flow (Screening Event / Lunch and Learn)
  // Which already-scheduled event these results belong to. null = create one.
  const [resultEventId, setResultEventId] = useState<number | null>(prefill.eventId ?? null);
  const [screened, setScreened] = useState("");
  // Single new-patient appointment booked during a lead conversation
  const [apptDate, setApptDate] = useState("");
  const [apptLocationId, setApptLocationId] = useState("");
  const [apptRevenue, setApptRevenue] = useState("");
  const [apptCollected, setApptCollected] = useState(false);
  const [resultCampaignId, setResultCampaignId] = useState<number | null>(prefill.campaignId ?? null);
  const [resultOpportunityId, setResultOpportunityId] = useState<number | null>(prefill.opportunityId ?? null);
  const [capturedPeople, setCapturedPeople] = useState<CapturedPerson[]>([]);
  const [leadDraftName, setLeadDraftName] = useState("");
  const [leadDraftPhone, setLeadDraftPhone] = useState("");
  const [draftBooked, setDraftBooked] = useState(false);
  const [draftApptDate, setDraftApptDate] = useState("");
  const [draftLocationId, setDraftLocationId] = useState("");
  const [draftRevenue, setDraftRevenue] = useState("");
  const [draftCollected, setDraftCollected] = useState(false);
  // Drop box flow
  const [cards, setCards] = useState("");
  // Extra contacts learned about on a communication / drop-in touch
  const [contactsMode, setContactsMode] = useState(false);
  const [extraContacts, setExtraContacts] = useState<{ name: string; title: string; phone: string; email: string }[]>([]);
  const [ecName, setEcName] = useState("");
  const [ecTitle, setEcTitle] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecEmail, setEcEmail] = useState("");
  // Standing update — where the relationship and the pipeline status stand
  // after this touch. null means "leave as-is".
  const [newRelationship, setNewRelationship] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [createTask, setCreateTask] = useState(true);
  const [customDate, setCustomDate] = useState(false);
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowISO().slice(0, 16));
  const [showMore, setShowMore] = useState(false);
  const [opportunityId, setOpportunityId] = useState<number | null>(prefill.opportunityId ?? null);
  const [eventId, setEventId] = useState<number | null>(prefill.eventId ?? null);
  const [campaignId, setCampaignId] = useState<number | null>(prefill.campaignId ?? null);
  const [projectId, setProjectId] = useState<number | null>(prefill.projectId ?? null);
  const [search, setSearch] = useState("");
  const [saving, startSaving] = useTransition();

  const flow = flowFor(type);
  const accountName = accounts.find((a) => a.id === accountId)?.name ?? newAccountName ?? null;
  const accountContacts = useMemo(
    () => contacts.filter((c) => c.accountId === accountId),
    [contacts, accountId]
  );
  const accountOpps = useMemo(
    () => (accountId ? opportunities.filter((o) => o.accountId === accountId) : opportunities),
    [opportunities, accountId]
  );

  const contactName =
    contacts.find((c) => c.id === contactId)?.name ??
    leads.find((l) => l.id === leadId)?.name ??
    newContact?.name ??
    newLead?.name ??
    null;
  const projectName = projects.find((p) => p.id === projectId)?.name ?? null;

  // ---- funnel routing ----
  // Where to go once the "who / where" (business/contact) is resolved.
  // Takes the type explicitly so it can be called in the same click that sets it.
  /** Route through the standing step when there's a record it could update. */
  const orStanding = (fallback: Phase): Phase => (hasStanding ? "standing" : fallback);

  /**
   * Where to go after picking the business.
   *
   * A meeting detours through "which meeting was this?" so it closes out the
   * scheduled one instead of leaving it Booked forever — but only when there is
   * something to pick, since an unscheduled meeting shouldn't cost a screen.
   * Takes the id directly because the state setter hasn't flushed yet.
   */
  const afterBusiness = (acctId: number | null = accountId): Phase => {
    if (flowFor(type) === "results") return "pickevent";
    const hasScheduledMeeting = acctId !== null && events.some((e) =>
      e.accountId === acctId &&
      ["Booked", "Confirmed", "Date Pending", "Planning"].includes(e.status) &&
      (MEETING_EVENT_TYPES as readonly string[]).includes(e.type));
    if (type === "Meeting" && hasScheduledMeeting) return "pickevent";
    return flow === "touch" || flow === "note" ? "contact" : afterWho();
  };

  /** After picking which scheduled thing this reports on. */
  const afterPickEvent = (): Phase =>
    flowFor(type) === "results" ? "results" : "contact";

  const afterWho = (t: string | null = type): Phase => {
    const f = flowFor(t);
    // Results flows ask which event these results belong to first, so an
    // already-booked screening gets updated instead of duplicated.
    if (f === "results") return "pickevent";
    if (f === "dropbox") return "dropbox";
    if (f === "note") return orStanding("details");
    // Voicemail is no longer a type — it's the "Left Voicemail" outcome of a
    // phone call, so it comes through the normal outcome question.
    return "outcome";
  };

  /** Ephemeral per-screen UI state — cleared on every navigation (fwd or back)
      so a screen never reopens mid-entry (e.g. the "add contacts" gate stuck open). */
  const clearScreenState = () => {
    setSearch("");
    setAddMode(false);
    setContactsMode(false);
    setNewName("");
    setNewPhone("");
    setNewTitle("");
    setNewEmail("");
  };

  const go = (to: Phase) => {
    setHistory((h) => [...h, phase]);
    clearScreenState();
    setPhase(to);
  };
  const back = () => {
    const h = [...history];
    const prev = h.pop();
    if (prev) { setHistory(h); clearScreenState(); setPhase(prev); }
  };

  /** Changing the activity type mid-flow invalidates every branch answer —
      wipe them so a screening can't be saved with a meeting's outcome. */
  const resetBranchState = () => {
    setOutcome(null);
    setFollowUp(null);
    setCustomDate(false);
    setCreateTask(true);
    setEvStartsAt(""); setEvExpected(""); setEvName(""); setEvLocationId("");
    setScreened("");
    setResultCampaignId(prefill.campaignId ?? null);
    setResultOpportunityId(prefill.opportunityId ?? null);
    setCapturedPeople([]);
    setLeadDraftName(""); setLeadDraftPhone("");
    setDraftBooked(false); setDraftApptDate(""); setDraftLocationId(""); setDraftRevenue(""); setDraftCollected(false);
    setCards("");
    setExtraContacts([]);
    setEcName(""); setEcTitle(""); setEcPhone(""); setEcEmail("");
    setShowMore(false);
  };

  // The standing step needs something to update — an existing business or an
  // existing lead. A brand-new record created inline is already current, and a
  // touch with neither has nothing to restate.
  const standingTarget: "account" | "lead" | null =
    accountId ? "account" : leadId ? "lead" : null;
  const hasStanding = standingTarget !== null;

  // Progress bar order, tailored to the active flow.
  const bookedEvent = outcome !== null && BOOKING_OUTCOMES.includes(outcome);
  const isMeetingBooking = outcome === "Booked Meeting";
  const withStanding = (...p: Phase[]): Phase[] => (hasStanding ? p : p.filter((x) => x !== "standing"));
  const PHASE_ORDER: Phase[] =
    flow === "results" ? withStanding("type", "business", "pickevent", "results", "leads", "standing", "newcontacts", "details")
    : flow === "dropbox" ? withStanding("type", "business", "dropbox", "standing", "newcontacts", "details")
    : flow === "note" ? withStanding("type", "business", "standing", "details")
    : withStanding("type", "business", "contact", "outcome", ...(bookedEvent ? ["event" as Phase] : []), "standing", "followup", "newcontacts", "details");
  const stepIndex = Math.max(0, PHASE_ORDER.indexOf(phase));

  const addCapturedPerson = () => {
    if (!leadDraftName.trim()) return;
    setCapturedPeople((ps) => [...ps, {
      name: leadDraftName.trim(),
      phone: leadDraftPhone.trim(),
      booked: draftBooked,
      apptDate: draftBooked ? draftApptDate : "",
      locationId: draftBooked ? draftLocationId : "",
      revenue: draftBooked ? draftRevenue : "",
      collected: draftBooked ? draftCollected : false,
    }]);
    setLeadDraftName("");
    setLeadDraftPhone("");
    setDraftBooked(false);
    setDraftApptDate("");
    setDraftLocationId("");
    setDraftRevenue("");
    setDraftCollected(false);
  };
  const bookedCount = capturedPeople.filter((p) => p.booked).length;

  const save = () => {
    const fd = new FormData();
    fd.set("type", type ?? "Note");
    if (outcome) fd.set("outcome", outcome);
    if (accountId) fd.set("accountId", String(accountId));
    if (contactId) fd.set("contactId", String(contactId));
    if (leadId) fd.set("leadId", String(leadId));
    if (!accountId && newAccountName) {
      fd.set("newAccountName", newAccountName);
      if (newAccountPhone) fd.set("newAccountPhone", newAccountPhone);
    }
    if (!contactId && newContact) {
      fd.set("newContactName", newContact.name);
      if (newContact.phone) fd.set("newContactPhone", newContact.phone);
      if (newContact.title) fd.set("newContactTitle", newContact.title);
      if (newContact.email) fd.set("newContactEmail", newContact.email);
    }
    if (!leadId && newLead) {
      fd.set("newLeadName", newLead.name);
      if (newLead.phone) fd.set("newLeadPhone", newLead.phone);
    }
    if (opportunityId) fd.set("opportunityId", String(opportunityId));
    if (eventId) fd.set("eventId", String(eventId));
    if (campaignId) fd.set("campaignId", String(campaignId));
    if (projectId) fd.set("projectId", String(projectId));

    // Booked-event details (touch flow) → server creates the Event
    if (flow === "touch" && bookedEvent && !eventId) {
      fd.set("newEventType", evType);
      if (evStartsAt) fd.set("newEventStartsAt", evStartsAt.length === 16 ? evStartsAt + ":00" : evStartsAt);
      if (evEndsAt) fd.set("newEventEndsAt", evEndsAt.length === 16 ? evEndsAt + ":00" : evEndsAt);
      if (evExpected) fd.set("newEventExpected", evExpected);
      if (evLocationId) fd.set("newEventLocationId", evLocationId);
      if (evName.trim()) fd.set("newEventName", evName.trim());
    }

    // Results flow (screening / lunch & learn)
    // Which scheduled event or meeting this closes out (results flow and
    // meetings both). Absent means there was nothing scheduled.
    if (resultEventId) fd.set("resultEventId", String(resultEventId));

    // A patient booked during this conversation.
    if (outcome === APPOINTMENT_BOOKED_OUTCOME) {
      fd.set("apptBooked", "1");
      if (apptDate) fd.set("apptDate", apptDate.length === 16 ? apptDate + ":00" : apptDate);
      if (apptLocationId) fd.set("apptLocationId", apptLocationId);
      if (apptRevenue) fd.set("apptRevenue", apptRevenue);
      if (apptCollected) fd.set("apptCollected", "1");
    }

    if (flow === "results") {
      if (screened) fd.set("resultScreened", screened);
      if (capturedPeople.length) fd.set("resultPeople", JSON.stringify(capturedPeople));
      // #4: results events can be attributed to a campaign/opportunity too
      if (resultCampaignId) fd.set("campaignId", String(resultCampaignId));
      if (resultOpportunityId) fd.set("opportunityId", String(resultOpportunityId));
    }

    // auto-attribute the partner when the business is one (or when launched prefilled)
    const partnerId = prefill.partnerId ?? partners.find((p) => p.accountId === accountId)?.id;
    if (partnerId) fd.set("partnerId", String(partnerId));
    fd.set("occurredAt", occurredAt.length === 16 ? occurredAt + ":00" : occurredAt);

    // Drop box flow: card count rolls into the partner + is noted on the activity
    let noteText = notes.trim();
    if (flow === "dropbox" && cards) {
      fd.set("dropCards", cards);
      noteText = `Collected ${cards} cards.${noteText ? " " + noteText : ""}`;
    }
    if (noteText) fd.set("notes", noteText);

    // Extra contacts learned about on a communication / drop-in touch
    if (extraContacts.length) fd.set("extraContacts", JSON.stringify(extraContacts));

    // Standing update — only sent when actually changed, so an untouched
    // screen never rewrites a record.
    if (newRelationship) fd.set("newRelationship", newRelationship);
    if (newStatus) fd.set("newStatus", newStatus);

    if (followUp) {
      fd.set("nextFollowUpAt", followUp);
      if (createTask) fd.set("createTask", "on");
    }
    if (prefill.returnTo) fd.set("returnTo", prefill.returnTo);
    if (prefill.taskId) fd.set("taskId", String(prefill.taskId));
    startSaving(async () => { await logActivity(fd); });
  };

  const addExtraContact = () => {
    if (!ecName.trim()) return;
    setExtraContacts((cs) => [...cs, { name: ecName.trim(), title: ecTitle.trim(), phone: ecPhone.trim(), email: ecEmail.trim() }]);
    setEcName(""); setEcTitle(""); setEcPhone(""); setEcEmail("");
  };

  // ---- shared UI bits (shape system: fields/tiles = rounded-xl, buttons = pills) ----
  const tile = (selected: boolean) =>
    `w-full rounded-xl border px-4 py-3.5 text-left text-[0.95rem] font-medium transition-all active:scale-[0.98] ${
      selected ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-card hover:border-faint"}`;

  const inputBox =
    "w-full rounded-xl border border-line bg-card px-4 py-3 text-[0.95rem] outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft";
  const continueBtn =
    "w-full rounded-full bg-ink py-3 text-sm font-semibold text-canvas transition-all hover:bg-ink-hover active:scale-[0.99] disabled:opacity-40";
  const skipBtn =
    "w-full rounded-xl px-4 py-3 text-sm font-medium text-soft transition-colors hover:bg-hairline";
  const fieldLabel = "mb-1.5 block text-[0.8rem] font-medium text-soft";

  const context = [type, projectName, accountName, contactName, outcome].filter(Boolean).join(" · ");
  const isScreening = type === "Screening Event";
  /** Logging a meeting that happened — it should close out the scheduled one. */
  const isMeetingLog = type === "Meeting";
  /** Talking to a prospective patient rather than a business contact. */
  const isLeadTarget = leadId !== null || newLead !== null;

  /**
   * Scheduled things for this business that haven't been reported on yet.
   *
   * A meeting can only close out a meeting, and an event only an event — they
   * are separate kinds and mixing them is what let a meeting inflate the event
   * numbers. Reporting on one of these UPDATES it rather than adding a second
   * record, so one real-world meeting or event is always exactly one row.
   */
  const eventCandidates = accountId
    ? events
        .filter((e) => e.accountId === accountId)
        .filter((e) => ["Booked", "Confirmed", "Date Pending", "Planning"].includes(e.status))
        .filter((e) => (isMeetingLog
          ? (MEETING_EVENT_TYPES as readonly string[]).includes(e.type)
          : !(MEETING_EVENT_TYPES as readonly string[]).includes(e.type)))
        .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""))
        .slice(0, 8)
    : [];

  const saveButton = (
    <button onClick={save} disabled={saving} className={continueBtn}>
      {saving ? "Saving…" : followUp ? `Save + follow-up ${fmtDate(followUp)}` : "Save activity"}
    </button>
  );

  return (
    <div className="mx-auto max-w-md pb-24">
      {/* progress + context */}
      <div className="mb-5 flex items-center gap-3">
        {history.length > 0 && (
          <button onClick={back} className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-soft shadow-card transition-colors hover:text-ink-hover" aria-label="Back">
            <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
          </button>
        )}
        <div className="flex flex-1 gap-1.5">
          {PHASE_ORDER.map((p, i) => (
            <span key={p} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      </div>
      {context && phase !== "type" && (
        <p className="mb-4 truncate text-xs font-medium uppercase tracking-wider text-faint">{context}</p>
      )}

      {phase === "type" && (
        <Screen title="What did you do?"
          sub={(prefill.accountId && accountName) || (prefill.leadId && contactName) || (prefill.projectId && projectName)
            ? `Logging for ${accountName ?? contactName ?? projectName}` : undefined}>
          <div className="grid grid-cols-2 gap-2.5">
            {ACTIVITY_TYPES.map((t) => (
              <button key={t} className={tile(type === t)}
                onClick={() => {
                  if (t !== type) resetBranchState(); // switching type invalidates earlier answers
                  setType(t);
                  // launched from a record — the who/where is already known
                  if (prefill.accountId || prefill.leadId || prefill.projectId) {
                    go(afterWho(t));
                  } else {
                    go("business");
                  }
                }}>
                <span className="mr-2">{TYPE_EMOJI[t]}</span>{t}
              </button>
            ))}
          </div>
        </Screen>
      )}

      {phase === "business" && (
        <Screen title="Which business?"
          sub={flow === "results" ? "Where was it? — or skip for a community event"
            : flow === "dropbox" ? "Which drop box host?"
            : "Start typing to filter — or skip it"}>
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search businesses…" className={inputBox} />
          {(() => {
            const matches = accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
            return (
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {matches.slice(0, 50).map((a) => (
                  <button key={a.id} className={tile(accountId === a.id)}
                    onClick={() => {
                      setAccountId(a.id);
                      setNewAccountName(null);
                      setContactId(null);
                      // Always ask who you spoke to — even when the business has
                      // no contacts on file yet, since that visit is usually how
                      // the first one gets captured. The screen offers "add" and
                      // "skip", so it is never a dead end.
                      go(afterBusiness(a.id));
                    }}>
                    {a.name}
                  </button>
                ))}
                {matches.length > 50 && (
                  <p className="px-2 py-1.5 text-center text-xs text-faint">
                    Showing 50 of {matches.length} — keep typing to narrow it down
                  </p>
                )}
              </div>
            );
          })()}
          {!addMode ? (
            <>
              <button className={tile(false) + " border-dashed text-accent-deep"}
                onClick={() => { setAddMode(true); setNewName(search.trim()); }}>
                ＋ Add {search.trim() ? `“${search.trim()}”` : "a new business"}
              </button>
              {flow === "touch" || flow === "note" ? (
                <button className={skipBtn}
                  onClick={() => { setAccountId(null); setNewAccountName(null); setContactId(null); go("contact"); }}>
                  {flow === "note" ? "No business — a person / lead" : "No business — it was a person / lead"}
                </button>
              ) : (
                <button className={skipBtn}
                  onClick={() => { setAccountId(null); setNewAccountName(null); setContactId(null); go(afterWho()); }}>
                  {flow === "results" ? "No business — community event" : "Skip"}
                </button>
              )}
            </>
          ) : (
            <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Business name" className={inputBox} />
              {/* You almost always have the number in hand when you're calling a
                  business for the first time — capturing it here saves an edit. */}
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                type="tel" placeholder="Phone (optional)" className={inputBox} />
              <p className="text-xs text-faint">Created when you save — fill in the rest later.</p>
              <button disabled={!newName.trim()} className={continueBtn}
                onClick={() => {
                  setNewAccountName(newName.trim());
                  setNewAccountPhone(newPhone.trim());
                  setAccountId(null);
                  setContactId(null);
                  setLeadId(null);
                  go(flow === "touch" || flow === "note" ? "contact" : afterWho());
                }}>
                Add & continue
              </button>
            </div>
          )}
        </Screen>
      )}

      {phase === "contact" && (accountId || newAccountName) && (
        <Screen title="Who did you talk to?" sub={accountName ?? undefined}>
          {accountContacts.length === 0 && (
            <p className="pb-1 text-center text-sm text-soft">
              No contacts on file here yet — add whoever you spoke with.
            </p>
          )}
          {accountContacts.map((c) => (
            <button key={c.id} className={tile(contactId === c.id)}
              onClick={() => { setContactId(c.id); setLeadId(null); setNewContact(null); go(afterWho()); }}>
              {c.name}
              {c.title && <span className="block text-xs font-normal text-soft">{c.title}</span>}
            </button>
          ))}
          {!addMode ? (
            <>
              <button className={tile(false) + " border-dashed text-accent-deep"}
                onClick={() => { setAddMode(true); setNewName(""); }}>
                ＋ Add a new contact{accountName ? ` at ${accountName}` : ""}
              </button>
              <button className={skipBtn}
                onClick={() => { setContactId(null); setNewContact(null); go(afterWho()); }}>
                Someone else / skip
              </button>
            </>
          ) : (
            <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name" className={inputBox} />
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Role at the business (owner, HR, manager…)" className={inputBox} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (optional)" className={inputBox} />
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                type="email" placeholder="Email (optional)" className={inputBox} />
              <button disabled={!newName.trim()} className={continueBtn}
                onClick={() => {
                  setNewContact({
                    name: newName.trim(), phone: newPhone.trim(),
                    title: newTitle.trim(), email: newEmail.trim(),
                  });
                  setContactId(null);
                  setLeadId(null);
                  go(afterWho());
                }}>
                Add & continue
              </button>
            </div>
          )}
        </Screen>
      )}

      {phase === "contact" && !accountId && !newAccountName && (
        <Screen title="Who did you talk to?" sub="A lead from a screening or drop box, or any contact">
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads and contacts…" className={inputBox} />
          {(() => {
            const leadMatches = leads.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));
            const contactMatches = contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
            const hidden = Math.max(0, leadMatches.length - 30) + Math.max(0, contactMatches.length - 30);
            return (
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {leadMatches.slice(0, 30).map((l) => (
                  <button key={`l${l.id}`} className={tile(leadId === l.id)}
                    onClick={() => { setLeadId(l.id); setContactId(null); setNewLead(null); go(afterWho()); }}>
                    <span className="flex items-center justify-between">
                      <span>
                        {l.name}
                        {l.phone && <span className="block text-xs font-normal text-soft">{l.phone}</span>}
                      </span>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-accent-deep">Lead</span>
                    </span>
                  </button>
                ))}
                {contactMatches.slice(0, 30).map((c) => (
                  <button key={`c${c.id}`} className={tile(contactId === c.id)}
                    onClick={() => {
                      setContactId(c.id);
                      setLeadId(null);
                      setNewLead(null);
                      if (c.accountId) setAccountId(c.accountId); // keep attribution when the person belongs to a business
                      go(afterWho());
                    }}>
                    {c.name}
                    {c.title && <span className="block text-xs font-normal text-soft">{c.title}</span>}
                  </button>
                ))}
                {hidden > 0 && (
                  <p className="px-2 py-1.5 text-center text-xs text-faint">
                    {hidden} more match{hidden === 1 ? "" : "es"} hidden — keep typing to narrow it down
                  </p>
                )}
              </div>
            );
          })()}
          {!addMode ? (
            <>
              <button className={tile(false) + " border-dashed text-accent-deep"}
                onClick={() => { setAddMode(true); setNewName(search.trim()); }}>
                ＋ Add {search.trim() ? `“${search.trim()}”` : "someone new"} as a lead
              </button>
              <button className={skipBtn}
                onClick={() => { setContactId(null); setLeadId(null); setNewLead(null); go(afterWho()); }}>
                Nobody specific — skip
              </button>
            </>
          ) : (
            <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name" className={inputBox} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (optional)" className={inputBox} />
              <p className="text-xs text-faint">Saved as a new lead — source is set from the activity type.</p>
              <button disabled={!newName.trim()} className={continueBtn}
                onClick={() => {
                  setNewLead({ name: newName.trim(), phone: newPhone.trim() });
                  setContactId(null);
                  setLeadId(null);
                  go(afterWho());
                }}>
                Add & continue
              </button>
            </div>
          )}
        </Screen>
      )}

      {phase === "outcome" && (
        <Screen title="How did it go?">
          {outcomesFor(type, isLeadTarget).map((o) => (
            <button key={o} className={tile(outcome === o)}
              onClick={() => {
                setOutcome(o);
                // A booked patient needs its date, clinic and money captured, or
                // the appointment can't be attributed to what produced it.
                if (o === APPOINTMENT_BOOKED_OUTCOME) {
                  go("appointment");
                  return;
                }
                // Anything you booked needs a date so it lands on the calendar.
                if (BOOKING_OUTCOMES.includes(o) && !eventId) {
                  setEvType(o === "Booked Meeting"
                    ? "Meeting"
                    : (type && EVENT_TYPE_FROM_ACTIVITY[type]) || "Lunch and Learn");
                  go("event");
                } else {
                  go(orStanding("followup"));
                }
              }}>
              {o}
            </button>
          ))}
          <button className={skipBtn} onClick={() => { setOutcome(null); go(orStanding("followup")); }}>
            Skip
          </button>
        </Screen>
      )}

      {phase === "event" && (
        <Screen
          title={isMeetingBooking ? "When is the meeting?" : "Tell me about the event"}
          sub={isMeetingBooking ? "It'll show on your calendar" : "You booked it — let's capture the details"}>
          <label className="block">
            <span className={fieldLabel}>{isMeetingBooking ? "Meeting type" : "Event type"}</span>
            <select value={evType} onChange={(e) => setEvType(e.target.value)} className={inputBox}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Starts</span>
            <input type="datetime-local" autoFocus value={evStartsAt}
              onChange={(e) => setEvStartsAt(e.target.value)} className={inputBox} />
            <span className="mt-1 block text-xs text-faint">Leave blank if the date isn&apos;t locked yet — it&apos;ll be marked Date Pending.</span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Ends (optional)</span>
            <input type="datetime-local" value={evEndsAt}
              onChange={(e) => setEvEndsAt(e.target.value)} className={inputBox} />
          </label>
          {/* Attendee counts only make sense for outreach events, not a meeting. */}
          {!isMeetingBooking && (
            <label className="block">
              <span className={fieldLabel}>Expected attendees</span>
              <input type="number" min="0" inputMode="numeric" value={evExpected}
                onChange={(e) => setEvExpected(e.target.value)} placeholder="e.g. 25" className={inputBox} />
            </label>
          )}
          <label className="block">
            <span className={fieldLabel}>Illumin8 location (optional)</span>
            <select value={evLocationId} onChange={(e) => setEvLocationId(e.target.value)} className={inputBox}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Event name (optional)</span>
            <input value={evName} onChange={(e) => setEvName(e.target.value)}
              placeholder={`${evType}${accountName ? ` — ${accountName}` : ""}`} className={inputBox} />
          </label>
          <button className={continueBtn} onClick={() => go(orStanding("followup"))}>Continue</button>
        </Screen>
      )}

      {phase === "appointment" && (
        <Screen title="New patient appointment"
          sub={`${contactName ?? "This person"} booked — capture it so the patient is attributed`}>
          <label className="block">
            <span className={fieldLabel}>When is the appointment?</span>
            <input type="datetime-local" autoFocus value={apptDate}
              onChange={(e) => setApptDate(e.target.value)} className={inputBox} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Which office?</span>
            <select value={apptLocationId} onChange={(e) => setApptLocationId(e.target.value)} className={inputBox}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabel}>Money charged</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={apptRevenue}
              onChange={(e) => setApptRevenue(e.target.value)} placeholder="e.g. 75" className={inputBox} />
          </label>
          <button onClick={() => setApptCollected(!apptCollected)}
            className={tile(apptCollected)}>
            {apptCollected ? "✓ Already collected" : "Not collected yet"}
          </button>

          {/* Attribution — what produced this patient. Shown here rather than
              hidden behind the optional links, because a new patient with no
              source is the one thing the reports can't work backwards from. */}
          <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
            <p className="text-[0.8rem] font-medium text-soft">Where did this patient come from?</p>
            {([
              ["Business", accounts as Slim[], accountId, setAccountId],
              ["Event", events as unknown as Slim[], eventId, setEventId],
              ["Campaign", campaigns, campaignId, setCampaignId],
            ] as [string, Slim[], number | null, (v: number | null) => void][]).map(([label, list, value, set]) => (
              <label key={label} className="block">
                <span className="mb-1 block text-[0.75rem] font-medium text-faint">{label}</span>
                <select value={value ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-xl border border-line bg-card px-3.5 py-2 text-sm outline-none focus:border-accent">
                  <option value="">—</option>
                  {list.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ))}
          </div>

          <button className={continueBtn} onClick={() => go(orStanding("followup"))}>Continue</button>
        </Screen>
      )}

      {phase === "pickevent" && (
        <Screen title={isMeetingLog ? "Which meeting was this?" : "Which event was this?"}
          sub={eventCandidates.length
            ? `Pick the one you're reporting on — it'll be closed out, not duplicated`
            : `Nothing scheduled for this business — this will create the ${isMeetingLog ? "meeting" : "event"}`}>
          {eventCandidates.map((e) => (
            <button key={e.id} className={tile(resultEventId === e.id)}
              onClick={() => { setResultEventId(e.id); go(afterPickEvent()); }}>
              {e.name}
              <span className="block text-xs font-normal text-soft">
                {e.status}{e.startsAt ? ` · ${fmtDate(e.startsAt.slice(0, 10))}` : ""}
              </span>
            </button>
          ))}
          <button className={tile(false) + " border-dashed text-accent-deep"}
            onClick={() => { setResultEventId(null); go(afterPickEvent()); }}>
            ＋ {eventCandidates.length ? "None of these — it wasn't scheduled" : "Continue — it wasn't scheduled"}
          </button>
        </Screen>
      )}

      {phase === "results" && (
        <Screen title={isScreening ? "How did the screening go?" : "How did the lunch & learn go?"}
          sub={accountName ?? "Community event"}>
          <label className="block">
            <span className={fieldLabel}>{isScreening ? "How many people did you screen?" : "How many people attended?"}</span>
            <input type="number" min="0" inputMode="numeric" autoFocus value={screened}
              onChange={(e) => setScreened(e.target.value)} placeholder="e.g. 20" className={inputBox} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Campaign (optional)</span>
            <select value={resultCampaignId ?? ""} onChange={(e) => setResultCampaignId(e.target.value ? Number(e.target.value) : null)} className={inputBox}>
              <option value="">—</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {accountOpps.length > 0 && (
            <label className="block">
              <span className={fieldLabel}>From an opportunity? (optional)</span>
              <select value={resultOpportunityId ?? ""} onChange={(e) => setResultOpportunityId(e.target.value ? Number(e.target.value) : null)} className={inputBox}>
                <option value="">—</option>
                {accountOpps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          <button className={continueBtn} onClick={() => go("leads")}>Next: add the people you captured</button>
        </Screen>
      )}

      {phase === "leads" && (
        <Screen title="Add the people you captured"
          sub={`${capturedPeople.length} added${bookedCount ? ` · ${bookedCount} booked` : ""} — mark who booked, then continue`}>
          {capturedPeople.length > 0 && (
            <ul className="space-y-1.5">
              {capturedPeople.map((p, i) => {
                const loc = locations.find((l) => String(l.id) === p.locationId)?.name;
                const bookedBits = [p.apptDate ? fmtDate(p.apptDate) : null, loc, p.revenue ? `$${p.revenue}${p.collected ? " collected" : " charged"}` : null].filter(Boolean).join(" · ");
                return (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-card px-4 py-2.5 shadow-card">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.name}
                        {p.booked && <span className="ml-2 rounded-full bg-good-soft px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-good">Booked</span>}
                      </span>
                      <span className="block truncate text-xs text-soft">
                        {p.booked ? (bookedBits || "Appointment booked") : (p.phone || "—")}
                      </span>
                    </span>
                    <button onClick={() => setCapturedPeople((ps) => ps.filter((_, j) => j !== i))}
                      className="shrink-0 text-xs font-medium text-bad hover:underline">Remove</button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
            <input autoFocus value={leadDraftName} onChange={(e) => setLeadDraftName(e.target.value)}
              placeholder="Full name"
              onKeyDown={(e) => { if (e.key === "Enter" && !draftBooked) { e.preventDefault(); addCapturedPerson(); } }}
              className={inputBox} />
            <input value={leadDraftPhone} onChange={(e) => setLeadDraftPhone(e.target.value)}
              placeholder="Phone (optional)" className={inputBox} />
            <label className="flex items-center gap-2.5 px-1 text-sm font-medium text-ink">
              <input type="checkbox" checked={draftBooked} onChange={(e) => setDraftBooked(e.target.checked)} className="h-4 w-4 accent-[#d97706]" />
              Booked a new-patient appointment
            </label>
            {draftBooked && (
              <div className="space-y-2.5 rounded-xl bg-canvas p-3">
                <label className="block">
                  <span className={fieldLabel}>Appointment date &amp; time</span>
                  <input type="datetime-local" value={draftApptDate} onChange={(e) => setDraftApptDate(e.target.value)} className={inputBox} />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Location</span>
                  <select value={draftLocationId} onChange={(e) => setDraftLocationId(e.target.value)} className={inputBox}>
                    <option value="">Select…</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={fieldLabel}>Money charged ($)</span>
                  <input type="number" min="0" step="1" inputMode="decimal" value={draftRevenue}
                    onChange={(e) => setDraftRevenue(e.target.value)} placeholder="0 if none" className={inputBox} />
                </label>
                <label className="flex items-center gap-2.5 px-1 text-sm text-soft">
                  <input type="checkbox" checked={draftCollected} onChange={(e) => setDraftCollected(e.target.checked)} className="h-4 w-4 accent-[#d97706]" />
                  Already collected
                </label>
              </div>
            )}
            <button disabled={!leadDraftName.trim()} onClick={addCapturedPerson}
              className="w-full rounded-full border border-accent bg-accent-soft py-2.5 text-sm font-semibold text-accent-deep transition-all active:scale-[0.99] disabled:opacity-40">
              ＋ Add this person
            </button>
          </div>
          <button className={continueBtn} onClick={() => go(orStanding(accountId || newAccountName ? "newcontacts" : "details"))}>
            {capturedPeople.length ? `Done — ${capturedPeople.length} person${capturedPeople.length === 1 ? "" : "s"}${bookedCount ? `, ${bookedCount} booked` : ""}` : "No one to add — continue"}
          </button>
        </Screen>
      )}

      {phase === "dropbox" && (
        <Screen title="Drop box pickup" sub={accountName ?? undefined}>
          <label className="block">
            <span className={fieldLabel}>How many cards did you collect?</span>
            <input type="number" min="0" inputMode="numeric" autoFocus value={cards}
              onChange={(e) => setCards(e.target.value)} placeholder="e.g. 12" className={inputBox} />
            <span className="mt-1 block text-xs text-faint">Rolls into this partner&apos;s running card total and resets the pickup clock.</span>
          </label>
          <button className={continueBtn} onClick={() => go(orStanding("newcontacts"))}>Continue</button>
        </Screen>
      )}

      {phase === "standing" && standingTarget && (() => {
        const isLead = standingTarget === "lead";
        const who = isLead ? contactName : accountName;
        // Current values, so the screen shows where things stand before changing it.
        const cur = isLead
          ? { rel: leads.find((l) => l.id === leadId)?.interest ?? "Unknown",
              status: leads.find((l) => l.id === leadId)?.apptStatus ?? "Not Contacted" }
          : { rel: accounts.find((a) => a.id === accountId)?.relationship ?? "Cold",
              status: accounts.find((a) => a.id === accountId)?.status ?? "New Prospect" };
        const relOptions: readonly string[] = isLead ? INTEREST_LEVELS : RELATIONSHIP_STRENGTHS;
        const statusOptions: readonly string[] = isLead ? LEAD_APPT_STATUSES : ACCOUNT_STATUSES;
        const relLabel = isLead ? "Interest level" : "Relationship";
        const chip = (active: boolean) =>
          `rounded-full border px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
            active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-card text-soft hover:bg-hairline"}`;

        return (
          <Screen title="Where do things stand now?" sub={who ?? undefined}>
            <div className="space-y-4 rounded-xl bg-card p-4 shadow-card">
              <div>
                <span className={fieldLabel}>{relLabel}</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {relOptions.map((r) => {
                    const active = (newRelationship ?? cur.rel) === r;
                    return (
                      <button key={r} className={chip(active)}
                        onClick={() => setNewRelationship(r === cur.rel ? null : r)}>
                        {r}{r === cur.rel && " ·  now"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className={fieldLabel}>Status</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {statusOptions.map((st) => {
                    const active = (newStatus ?? cur.status) === st;
                    return (
                      <button key={st} className={chip(active)}
                        onClick={() => setNewStatus(st === cur.status ? null : st)}>
                        {st}{st === cur.status && " ·  now"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button className={continueBtn}
              onClick={() => go(flow === "touch" ? "followup" : accountId || newAccountName ? "newcontacts" : "details")}>
              {newRelationship || newStatus ? "Update & continue" : "Continue"}
            </button>
            <button className={skipBtn}
              onClick={() => { setNewRelationship(null); setNewStatus(null);
                go(flow === "touch" ? "followup" : accountId || newAccountName ? "newcontacts" : "details"); }}>
              No change
            </button>
          </Screen>
        );
      })()}

      {phase === "followup" && (
        <Screen title="Schedule the follow-up?" sub="A task lands on your list on that day">
          {FOLLOWUP_CHIPS.map((c) => (
            <button key={c.label}
              className={tile(c.days === null ? followUp === null && !customDate : followUp === addDays(todayISO(), c.days))}
              onClick={() => {
                setCustomDate(false);
                setFollowUp(c.days === null ? null : addDays(todayISO(), c.days));
                go("newcontacts");
              }}>
              {c.label}
              {c.days !== null && <span className="ml-2 text-xs font-normal text-soft">{fmtDate(addDays(todayISO(), c.days))}</span>}
            </button>
          ))}
          <button className={tile(customDate)} onClick={() => setCustomDate(true)}>Pick a date…</button>
          {customDate && (
            <div className="flex gap-2">
              <input type="date" min={todayISO()} value={followUp ?? ""}
                onChange={(e) => setFollowUp(e.target.value || null)}
                className={inputBox + " flex-1"} />
              <button disabled={!followUp} onClick={() => go("newcontacts")}
                className="rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-all hover:bg-ink-hover active:scale-[0.99] disabled:opacity-40">
                Next
              </button>
            </div>
          )}
          {(followUp || customDate) && (
            <label className="flex items-center gap-2.5 px-1 pt-1 text-sm text-soft">
              <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} className="h-4 w-4 accent-[#d97706]" />
              Create a follow-up task
            </label>
          )}
        </Screen>
      )}

      {phase === "newcontacts" && !contactsMode && (
        <Screen title="Any new contacts to add?"
          sub={accountName ? `New people you met at ${accountName}` : "New people you met on this activity"}>
          <button className={tile(false) + " border-dashed text-accent-deep"}
            onClick={() => setContactsMode(true)}>
            ＋ Yes, add contacts
          </button>
          <button className={skipBtn} onClick={() => go("details")}>No new contacts</button>
        </Screen>
      )}

      {phase === "newcontacts" && contactsMode && (
        <Screen title="Add a contact"
          sub={`${extraContacts.length} added${accountName ? ` at ${accountName}` : ""} — add each person, then continue`}>
          {extraContacts.length > 0 && (
            <ul className="space-y-1.5">
              {extraContacts.map((c, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5 shadow-card">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-soft">
                      {[c.title, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <button onClick={() => setExtraContacts((cs) => cs.filter((_, j) => j !== i))}
                    className="shrink-0 text-xs font-medium text-bad hover:underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
            <input autoFocus value={ecName} onChange={(e) => setEcName(e.target.value)}
              placeholder="Full name"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraContact(); } }}
              className={inputBox} />
            <input value={ecTitle} onChange={(e) => setEcTitle(e.target.value)}
              placeholder="Title / role (optional)" className={inputBox} />
            <input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)}
              placeholder="Phone (optional)" className={inputBox} />
            <input value={ecEmail} onChange={(e) => setEcEmail(e.target.value)}
              placeholder="Email (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraContact(); } }}
              className={inputBox} />
            <button disabled={!ecName.trim()} onClick={addExtraContact}
              className="w-full rounded-full border border-accent bg-accent-soft py-2.5 text-sm font-semibold text-accent-deep transition-all active:scale-[0.99] disabled:opacity-40">
              ＋ Add this contact
            </button>
          </div>
          <button className={continueBtn} onClick={() => go("details")}>
            {extraContacts.length ? `Done — ${extraContacts.length} contact${extraContacts.length === 1 ? "" : "s"}` : "Done — no contacts"}
          </button>
        </Screen>
      )}

      {phase === "details" && (
        <Screen title="Anything to note?" sub="Optional — then save">
          <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder={flow === "results" ? "How did it go? What to follow up on…" : "What happened?"} className={inputBox} />
          <label className="block">
            <span className={fieldLabel}>When</span>
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)}
              className={inputBox} />
          </label>

          {(flow === "touch" || flow === "note") && (
            <>
              <button onClick={() => setShowMore(!showMore)}
                className="text-sm font-medium text-accent-deep hover:underline">
                {showMore ? "Hide links" : "Link to opportunity, event, campaign, or project…"}
              </button>
              {showMore && (
                <div className="space-y-2.5 rounded-xl bg-card p-4 shadow-card">
                  {([
                    ["Opportunity", accountOpps, opportunityId, setOpportunityId],
                    ["Event", events, eventId, setEventId],
                    ["Campaign", campaigns, campaignId, setCampaignId],
                    ["Project", projects, projectId, setProjectId],
                  ] as [string, Slim[], number | null, (v: number | null) => void][]).map(([label, list, value, set]) => (
                    <label key={label} className="block">
                      <span className="mb-1 block text-[0.75rem] font-medium text-soft">{label}</span>
                      <select value={value ?? ""} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}
                        className="w-full rounded-xl border border-line bg-card px-3.5 py-2 text-sm outline-none focus:border-accent">
                        <option value="">—</option>
                        {list.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {flow === "results" && (
            <p className="rounded-xl bg-canvas px-4 py-3 text-xs text-soft">
              Saving creates a completed {isScreening ? "screening" : "lunch & learn"} event
              {screened ? ` (${screened} ${isScreening ? "screened" : "attended"})` : ""}
              {capturedPeople.length ? `, ${capturedPeople.length} lead${capturedPeople.length === 1 ? "" : "s"}` : ""}
              {bookedCount > 0 ? `, and ${bookedCount} appointment${bookedCount === 1 ? "" : "s"}` : ""}.
            </p>
          )}

          <div className="pt-2">{saveButton}</div>
        </Screen>
      )}
    </div>
  );
}
