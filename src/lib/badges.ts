// Deterministic status → color tone mapping used by <Badge>.
type Tone = "green" | "blue" | "amber" | "red" | "gray" | "purple";

const TONES: Record<Tone, string> = {
  green: "bg-good-soft text-good",
  blue: "bg-info-soft text-info",
  amber: "bg-warn-soft text-accent-deep",
  red: "bg-bad-soft text-bad",
  gray: "bg-hairline text-soft",
  purple: "bg-purple-soft text-purple",
};

const STATUS_TONE: Record<string, Tone> = {
  // Accounts
  "New Prospect": "gray", Researched: "gray", Contacted: "blue", "Follow-Up Needed": "amber",
  Interested: "blue", "Partner Candidate": "purple", "Active Partner": "green",
  "Event Booked": "green", "Event Completed": "green", Converted: "green",
  Nurture: "gray", "Not a Fit": "red", "Do Not Contact": "red",
  // Opportunity stages
  "Prospect Identified": "gray", "First Contact Needed": "amber", "Follow-Up Scheduled": "amber",
  "Decision Maker Engaged": "blue", "Proposal / Details Sent": "purple",
  "Event Date Pending": "purple", Completed: "green", "Lost / Not Fit": "red",
  // Events
  Idea: "gray", Planning: "gray", "Date Pending": "purple", Booked: "green",
  Confirmed: "green", Canceled: "red", Lost: "red",
  // Leads / appointments
  "Not Contacted": "gray", Showed: "green", "No-Show": "red", Rescheduled: "amber",
  "Not Interested": "red", "Awaiting Reply": "gray", "Good Conversation": "green",
  // Activity outcomes. Green is reserved for a real step forward: a meeting or
  // event on the calendar, or finally getting past the gatekeeper to the person
  // who can say yes. The rest stay neutral so the wins are what catch the eye.
  "Booked Meeting": "green", "Booked Event": "green", "Reached Decision Maker": "green",
  // Partners / campaigns / tasks / projects
  Prospective: "gray", Active: "green", Paused: "amber", Ended: "red",
  Draft: "gray", Open: "blue", "On Hold": "amber", Archived: "gray",
  // Drop box
  Placed: "green", "Needs Pickup": "amber", "Needs Restock": "amber", Removed: "red",
  // Interest levels
  Hot: "red", Warm: "amber", Cool: "blue", Unknown: "gray",
  // Relationship
  Cold: "gray", Strong: "green", Champion: "green", Building: "blue", Established: "green", New: "gray",
};

export function badgeClass(status: string): string {
  return TONES[STATUS_TONE[status] ?? "gray"];
}
