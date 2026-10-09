// Time windows for the "pick a time" screening intake form.
//
// A campaign sets one block of time on one day (e.g. 9:00–11:00 on Oct 21) and
// how many people each window can take. The block is cut into fixed 10-minute
// windows; people pick one on the public form, and the bookings fill a time
// sheet on the campaign and its event.
//
// Everything here is plain string and minute arithmetic on the local wall-clock
// times the campaign was given — no Date objects, so no time zone can shift a
// window. Pure, so tests can pin it down.

export const SCREENING_SLOT_MINUTES = 10;
/** Sixteen hours of windows. Far beyond any screening day, and a bound on page size. */
export const MAX_SCREENING_SLOTS = 96;
export const MAX_SLOT_CAPACITY = 20;

const pad = (n: number) => String(n).padStart(2, "0");

function minutesOf(time: string): number | null {
  const m = time.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

const atMinutes = (date: string, minutes: number) => `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;

/** Every window start ("YYYY-MM-DDTHH:mm:00") in the block. Empty if the block is unusable. */
export function screeningSlots(start: string | null | undefined, end: string | null | undefined): string[] {
  if (!start || !end || start.slice(0, 10) !== end.slice(0, 10)) return [];
  const from = minutesOf(start.slice(11)), to = minutesOf(end.slice(11));
  if (from === null || to === null) return [];
  const out: string[] = [];
  for (let t = from; t + SCREENING_SLOT_MINUTES <= to && out.length < MAX_SCREENING_SLOTS; t += SCREENING_SLOT_MINUTES) {
    out.push(atMinutes(start.slice(0, 10), t));
  }
  return out;
}

/** "9:00 AM" for a window start. */
export function fmtSlotTime(slot: string): string {
  const m = minutesOf(slot.slice(11));
  if (m === null) return slot;
  const h = Math.floor(m / 60), mi = m % 60;
  return `${((h + 11) % 12) + 1}:${pad(mi)} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:00–9:10 AM" — the whole window. */
export function fmtSlotRange(slot: string): string {
  const m = minutesOf(slot.slice(11));
  if (m === null) return slot;
  const endLabel = fmtSlotTime(atMinutes(slot.slice(0, 10), m + SCREENING_SLOT_MINUTES));
  const startLabel = fmtSlotTime(slot);
  // Drop the first AM/PM when both ends share it: "9:00–9:10 AM".
  return startLabel.slice(-2) === endLabel.slice(-2)
    ? `${startLabel.slice(0, -3)}–${endLabel}`
    : `${startLabel}–${endLabel}`;
}

export type SlotSettings = { slotsStart: string; slotsEnd: string; slotCapacity: number };

/**
 * Validate the campaign form's settings: a date, a start and end time, and
 * people per window. Returns the stored form or a message a person can act on.
 */
export function parseSlotSettings(input: {
  date?: string | null; start?: string | null; end?: string | null; capacity?: string | number | null;
}): { ok: true; value: SlotSettings } | { ok: false; error: string } {
  const date = (input.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick the screening date." };
  const [y, mo, d] = date.split("-").map(Number);
  const real = new Date(y, mo - 1, d);
  if (real.getFullYear() !== y || real.getMonth() !== mo - 1 || real.getDate() !== d) {
    return { ok: false, error: "That screening date isn't a real date." };
  }
  const from = minutesOf((input.start ?? "").trim()), to = minutesOf((input.end ?? "").trim());
  if (from === null || to === null) return { ok: false, error: "Set when the first window starts and when the last one ends." };
  if (to - from < SCREENING_SLOT_MINUTES) {
    return { ok: false, error: `The end time must be at least ${SCREENING_SLOT_MINUTES} minutes after the start time.` };
  }
  if ((to - from) / SCREENING_SLOT_MINUTES > MAX_SCREENING_SLOTS) {
    return { ok: false, error: `That's more than ${MAX_SCREENING_SLOTS} ten-minute windows — keep it to one block of up to 16 hours.` };
  }
  const capacity = Number(input.capacity ?? 1);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SLOT_CAPACITY) {
    return { ok: false, error: `People per window must be a whole number from 1 to ${MAX_SLOT_CAPACITY}.` };
  }
  return { ok: true, value: { slotsStart: atMinutes(date, from), slotsEnd: atMinutes(date, to), slotCapacity: capacity } };
}
