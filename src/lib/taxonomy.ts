// Single source of truth for every list-of-values in the app.
// Reports and filters reference these exact strings, so metrics stay deterministic.

export const VERTICALS = [
  "Restaurant", "Gym", "Dental", "Medical", "Wellness", "Corporate Office",
  "Manual Labor", "School", "Government", "Retail", "Other",
] as const;

export const AREAS = ["NE Heights", "Westside", "Downtown", "Rio Rancho", "Other"] as const;

export const ACCOUNT_STATUSES = [
  "New Prospect", "Researched", "Contacted", "Follow-Up Needed", "Interested",
  "Partner Candidate", "Active Partner", "Event Booked", "Event Completed",
  "Converted", "Nurture", "Not a Fit", "Do Not Contact",
] as const;

export const CONTACT_TYPES = [
  "Owner", "HR", "Manager", "Employee", "Gym Owner", "Dental Office Manager",
  "Restaurant Manager", "Community Partner", "Event Attendee", "Other",
] as const;

export const INFLUENCE_LEVELS = ["Low", "Medium", "High", "Decision Maker"] as const;
export const RELATIONSHIP_STATUSES = ["New", "Building", "Established", "Champion"] as const;
export const RELATIONSHIP_STRENGTHS = ["Cold", "Warm", "Strong"] as const;
export const PREFERRED_METHODS = ["Phone", "Email", "Text", "In Person"] as const;

export const OPPORTUNITY_TYPES = [
  "Restaurant Drop Box Partnership", "Lunch and Learn", "Gym Screening Event",
  "Corporate Wellness Event", "Dental Ergonomics Presentation",
  "Community Event / Expo Booth", "Referral Partnership", "Other",
] as const;

export const OPPORTUNITY_STAGES = [
  "Prospect Identified", "First Contact Needed", "Contacted", "Follow-Up Scheduled",
  "Interested", "Decision Maker Engaged", "Proposal / Details Sent",
  "Event Date Pending", "Event Booked", "Completed", "Converted",
  "Lost / Not Fit", "Nurture",
] as const;

// Stages considered "open" (active pipeline) for dashboard + reports.
export const OPEN_STAGES = [
  "Prospect Identified", "First Contact Needed", "Contacted", "Follow-Up Scheduled",
  "Interested", "Decision Maker Engaged", "Proposal / Details Sent",
  "Event Date Pending", "Event Booked",
] as const;

// What you can pick when logging. Deliberately shorter than the list of types
// that exist in the data:
//   • "Voicemail" is an OUTCOME of a phone call ("Left Voicemail"), not a
//     separate kind of activity.
//   • "Follow-Up" is derived, not chosen — any contact with a business you have
//     already spoken to counts as one (see followUpCondition in metrics.ts).
export const ACTIVITY_TYPES = [
  "Phone Call", "Email", "Text", "In-Person Visit", "Drop Box Visit",
  "Meeting", "Lunch and Learn", "Screening Event", "Networking",
  "Note", "Other",
] as const;

// Activity types that count as "contacting a business" for activity reports.
// Retains Voicemail and Follow-Up so activities logged before those options
// were retired still count in historical reports.
export const CONTACT_ACTIVITY_TYPES = [
  "Phone Call", "Voicemail", "Email", "Text", "In-Person Visit", "Drop Box Visit",
  "Follow-Up", "Meeting", "Lunch and Learn", "Screening Event", "Networking",
] as const;

// The direct-communication subset — these become follow-ups once a business has
// been contacted before. Events and drop-box runs are their own metrics.
export const COMMUNICATION_TYPES = [
  "Phone Call", "Voicemail", "Email", "Text", "In-Person Visit", "Meeting", "Follow-Up",
] as const;

// "Calls For Reporting Purpose" — the headline touchpoint count leadership asks
// for: phone calls + drop-ins.
//
// Counted from ACTIVITIES. Voicemail rides with Phone Call to match the
// existing Phone Calls metric, and servicing a drop box counts as a drop-in —
// it is still a visit to the business. Drop Box Visits also keep their own goal
// line, which is a separate figure and not double counting.
export const REPORTING_CALL_TYPES = [
  "In-Person Visit", "Drop Box Visit", "Phone Call", "Voicemail",
] as const;

/** The drop-in half of the reporting-calls number: visits made in person. */
export const DROP_IN_ACTIVITY_TYPES = ["In-Person Visit", "Drop Box Visit"] as const;

export const IN_PERSON_ACTIVITY_TYPES = [
  "In-Person Visit", "Drop Box Visit", "Meeting", "Lunch and Learn",
  "Screening Event", "Networking",
] as const;

export const ACTIVITY_OUTCOMES = [
  "No Answer", "Left Voicemail", "Awaiting Reply", "Spoke with Gatekeeper", "Reached Decision Maker",
  "Good Conversation", "Discussed Partnership", "Interested", "Not Interested", "Follow-Up Needed", "Booked Meeting",
  "Booked Event", "Needs Materials", "Closed / Converted",
] as const;

// Outcomes offered per activity type — a meeting that happened can't be
// "No Answer", and an email doesn't reach a gatekeeper.
const PHONE_OUTCOMES = [
  "No Answer", "Left Voicemail", "Spoke with Gatekeeper", "Reached Decision Maker",
  "Good Conversation", "Discussed Partnership", "Interested", "Not Interested", "Follow-Up Needed", "Booked Meeting",
  "Booked Event", "Needs Materials", "Closed / Converted",
] as const;
const MESSAGE_OUTCOMES = [
  "Awaiting Reply", "Good Conversation", "Discussed Partnership", "Interested", "Not Interested",
  "Follow-Up Needed", "Booked Meeting", "Booked Event", "Needs Materials", "Closed / Converted",
] as const;
const VISIT_OUTCOMES = [
  "Spoke with Gatekeeper", "Reached Decision Maker", "Good Conversation", "Discussed Partnership",
  "Interested", "Not Interested", "Follow-Up Needed", "Booked Meeting", "Booked Event",
  "Needs Materials", "Closed / Converted",
] as const;
// "Good Conversation" leads for meetings — a routine partner check-in that went
// well is the most common result and shouldn't force a prospecting label.
const MEETING_OUTCOMES = [
  "Good Conversation", "Discussed Partnership", "Interested", "Not Interested", "Follow-Up Needed", "Booked Meeting",
  "Booked Event", "Needs Materials", "Closed / Converted",
] as const;

const OUTCOMES_BY_TYPE: Record<string, readonly string[]> = {
  "Phone Call": PHONE_OUTCOMES,
  "Follow-Up": PHONE_OUTCOMES,
  Email: MESSAGE_OUTCOMES,
  Text: MESSAGE_OUTCOMES,
  "In-Person Visit": VISIT_OUTCOMES,
  Meeting: MEETING_OUTCOMES,
  Networking: MEETING_OUTCOMES,
};

/**
 * Booking a new-patient appointment — only meaningful when the person you're
 * talking to is a prospective patient (a lead), which is why it isn't in the
 * general outcome lists. Choosing it captures the appointment itself, so the
 * patient is attributed to whatever produced them.
 */
export const APPOINTMENT_BOOKED_OUTCOME = "Appointment Booked";

/**
 * The outcome choices that make sense for a given activity type.
 * `forLead` adds the patient-booking outcome, which would be nonsense on a
 * conversation with a business contact.
 */
export function outcomesFor(type: string | null, forLead = false): readonly string[] {
  const base = (type && OUTCOMES_BY_TYPE[type]) || ACTIVITY_OUTCOMES;
  if (!forLead) return base;
  // Right after the positive-interest outcomes, where it reads naturally.
  const at = base.indexOf("Interested");
  const out = [...base];
  out.splice(at >= 0 ? at + 1 : out.length, 0, APPOINTMENT_BOOKED_OUTCOME);
  return out;
}

// A "partnership conversation" is one where a partnership was actually
// discussed — so it is now an EXPLICIT choice, not inferred.
//
// This used to include "Good Conversation", "Interested" and "Reached Decision
// Maker", which meant any productive call counted: a pleasant email to a
// business with no partner status was reported as a partnership conversation.
// Only the outcomes below, which state a partnership step outright, qualify.
export const PARTNERSHIP_CONVO_OUTCOMES = [
  "Discussed Partnership", "Booked Event", "Closed / Converted",
] as const;

export const PARTNER_TYPES = [
  "Restaurant Partner", "Gym Partner", "Wellness Partner", "Business Partner",
  "Event Partner", "Referral Partner",
] as const;

export const PARTNER_STATUSES = ["Prospective", "Active", "Paused", "Ended"] as const;
export const DROP_BOX_STATUSES = ["Placed", "Needs Pickup", "Needs Restock", "Removed"] as const;

export const CAMPAIGN_TYPES = [
  "Restaurant Drop Box", "Office Drop Box", "Gym Flyer", "Event Flyer",
  "Email Campaign", "Social Media", "Partner Referral", "Other",
] as const;

export const CAMPAIGN_STATUSES = ["Draft", "Active", "Paused", "Completed"] as const;

export const EVENT_TYPES = [
  "Lunch and Learn", "Gym Screening", "Community Event", "Expo / Booth",
  "Dental CE / Ergonomics Presentation", "Office Visit", "Partner Event",
  // Calendar-only entries: internal meetings and blocked-out time. They are
  // events so they appear on the calendar, but they are not outreach and are
  // excluded from the Events Booked / Events Held metrics.
  "Meeting", "Internal Meeting", "Time Off / Away", "Other",
] as const;

/**
 * Event types that are scheduling entries, not outreach — kept out of Events
 * Booked / Held / Screenings.
 *
 * "Meeting" is included: booking a meeting from a call now creates a calendar
 * entry, and counting those as Events Booked would inflate the 6-events/week
 * goal, which means lunch-and-learns and screenings — not sit-down meetings.
 */
export const NON_OUTREACH_EVENT_TYPES = ["Meeting", "Internal Meeting", "Time Off / Away"] as const;

/** Event types shown in green on the calendar (meetings rather than outreach events). */
export const MEETING_EVENT_TYPES = ["Meeting", "Internal Meeting", "Time Off / Away"] as const;

export const EVENT_STATUSES = [
  "Idea", "Planning", "Date Pending", "Booked", "Confirmed", "Completed",
  "Follow-Up Needed", "Canceled", "Lost",
] as const;

// Event statuses that count as "booked" for metrics.
export const EVENT_BOOKED_STATUSES = ["Booked", "Confirmed", "Completed", "Follow-Up Needed"] as const;

export const LEAD_SOURCES = [
  "Drop Box", "Event", "Screening", "QR Code", "Referral", "Walk-In", "Form", "Other",
] as const;

export const INTEREST_LEVELS = ["Hot", "Warm", "Cool", "Unknown"] as const;

export const LEAD_APPT_STATUSES = [
  "Not Contacted", "Contacted", "Interested", "Booked", "Showed", "No-Show",
  "Rescheduled", "Not Interested",
] as const;

export const APPOINTMENT_STATUSES = [
  "Booked", "Confirmed", "Showed", "No-Show", "Rescheduled", "Canceled",
] as const;

// High-value verticals get a boost in Today's Focus scoring.
export const HIGH_VALUE_VERTICALS = ["Gym", "Dental", "Restaurant", "Wellness", "Corporate Office"] as const;

export const TASK_STATUSES = ["Open", "Completed", "Canceled"] as const;

export const PROJECT_STATUSES = ["Active", "On Hold", "Completed", "Archived"] as const;

// Public QR sign-up form variants (campaign.publicForm). Legacy values map:
// "person" → patient, "business" → lunch.
export const PUBLIC_FORM_TYPES = [
  { value: "patient", label: "New patient sign-up", hint: "Patient contact info → creates a lead." },
  { value: "partnership", label: "Business partnership", hint: "A business that wants to partner → creates the business, a contact, and a lead." },
  { value: "lunch", label: "Lunch & learn interest", hint: "A business interested in hosting a lunch & learn → creates the business, a contact, and a lead." },
] as const;

export type PublicFormType = "patient" | "partnership" | "lunch";

/** Normalize stored/legacy values to a current form type. */
export function normalizePublicForm(value: string | null | undefined): PublicFormType {
  if (value === "partnership") return "partnership";
  if (value === "lunch" || value === "business") return "lunch";
  return "patient"; // "patient", "person", null, anything else
}

export const PARTNERSHIP_INTERESTS = [
  "Restaurant drop box", "Lunch & learn", "Cross-referrals", "Community event / screening", "Not sure yet",
] as const;

/** What marketing money gets spent on. */
export const EXPENSE_CATEGORIES = [
  "Catering / Food", "Printing / Flyers", "Giveaways / Swag", "Event Fee",
  "Mileage / Travel", "Supplies", "Advertising", "Other",
] as const;
