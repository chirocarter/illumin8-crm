import "server-only";

// What a screening intake form offers right now: its event, its 10-minute
// windows and how full each one is, and whether sign-ups are closed.
//
// One function for both the public page and the action that handles its
// submissions, so the times a person is shown and the times the server will
// accept can't drift apart.
import { db, schema as s } from "@/db";
import { asc, count, eq, inArray } from "drizzle-orm";
import { screeningSlots } from "./screening";
import { todayISO } from "./dates";

type Campaign = typeof s.campaigns.$inferSelect;

export type ScreeningWindow = { start: string; taken: number; full: boolean };

export type ScreeningState = {
  event: { id: number; name: string; startsAt: string | null; locationText: string | null } | null;
  /** The screening day, if one is known: the window date, else the event date. */
  date: string | null;
  /** Empty for the interest form, or a "pick a time" form with no usable settings. */
  windows: ScreeningWindow[];
  capacity: number;
  /** Why sign-ups are closed, or null if they're open. */
  closed: "past" | "canceled" | null;
};

export async function screeningState(campaign: Campaign): Promise<ScreeningState> {
  const event = campaign.eventId
    ? await db.query.events.findFirst({
        where: eq(s.events.id, campaign.eventId),
        columns: { id: true, name: true, startsAt: true, locationText: true, status: true },
      })
    : null;

  const slotStarts = campaign.publicForm === "screening_slots"
    ? screeningSlots(campaign.slotsStart, campaign.slotsEnd)
    : [];
  const capacity = Math.max(1, campaign.slotCapacity);

  let windows: ScreeningWindow[] = [];
  if (slotStarts.length) {
    const taken = await db
      .select({ slot: s.screeningBookings.slotStart, n: count() })
      .from(s.screeningBookings)
      .where(eq(s.screeningBookings.campaignId, campaign.id))
      .groupBy(s.screeningBookings.slotStart);
    const byStart = new Map(taken.map((t) => [t.slot, Number(t.n)]));
    windows = slotStarts.map((start) => {
      const n = byStart.get(start) ?? 0;
      return { start, taken: n, full: n >= capacity };
    });
  }

  const date = slotStarts[0]?.slice(0, 10) ?? event?.startsAt?.slice(0, 10) ?? null;
  // By DATE, not time of day: the server clock isn't in the screening's time
  // zone, and the whole day staying open is the safe side to err on.
  const closed = event && ["Canceled", "Lost"].includes(event.status) ? "canceled"
    : date && date < todayISO() ? "past"
    : null;

  return {
    event: event ? { id: event.id, name: event.name, startsAt: event.startsAt, locationText: event.locationText } : null,
    date, windows, capacity, closed,
  };
}

// ---------------------------------------------------------------------------
// The time sheet — the staff-side view of who booked which window.
// ---------------------------------------------------------------------------

export type SheetPerson = { bookingId: number; leadId: number; name: string; phone: string | null };
export type TimeSheet = {
  campaignId: number;
  capacity: number;
  /** Every window in the campaign's current settings, in order, with who's in it. */
  rows: { start: string; people: SheetPerson[] }[];
  /**
   * Bookings that no longer fall on a current window — the times were edited
   * after people booked. Kept visible rather than silently dropped.
   */
  outside: (SheetPerson & { start: string })[];
  booked: number;
  spots: number;
};

/** Time sheets for several campaigns at once (the event page can have more than one). */
export async function timeSheets(campaigns: Campaign[]): Promise<Map<number, TimeSheet>> {
  const slotted = campaigns.filter((c) => c.publicForm === "screening_slots");
  const out = new Map<number, TimeSheet>();
  if (slotted.length === 0) return out;

  const bookings = await db
    .select({
      bookingId: s.screeningBookings.id, campaignId: s.screeningBookings.campaignId,
      start: s.screeningBookings.slotStart, leadId: s.leads.id,
      firstName: s.leads.firstName, lastName: s.leads.lastName, phone: s.leads.phone,
    })
    .from(s.screeningBookings)
    .innerJoin(s.leads, eq(s.leads.id, s.screeningBookings.leadId))
    .where(inArray(s.screeningBookings.campaignId, slotted.map((c) => c.id)))
    .orderBy(asc(s.screeningBookings.slotStart), asc(s.screeningBookings.id));

  for (const c of slotted) {
    const starts = screeningSlots(c.slotsStart, c.slotsEnd);
    const onSheet = new Set(starts);
    const mine = bookings.filter((b) => b.campaignId === c.id);
    const person = (b: (typeof mine)[number]): SheetPerson => ({
      bookingId: b.bookingId, leadId: b.leadId,
      name: `${b.firstName} ${b.lastName}`.trim() || "Unnamed", phone: b.phone,
    });
    out.set(c.id, {
      campaignId: c.id,
      capacity: Math.max(1, c.slotCapacity),
      rows: starts.map((start) => ({ start, people: mine.filter((b) => b.start === start).map(person) })),
      outside: mine.filter((b) => !onSheet.has(b.start)).map((b) => ({ ...person(b), start: b.start })),
      booked: mine.length,
      spots: starts.length * Math.max(1, c.slotCapacity),
    });
  }
  return out;
}
