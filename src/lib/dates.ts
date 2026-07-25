// Local-time date helpers. All DB datetimes are local ISO strings, so string
// comparison == chronological comparison.

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toISODateTime(d: Date): string {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function nowISO(): string {
  return toISODateTime(new Date());
}

/** Monday of the week containing `d` (weeks run Mon–Sun). */
export function startOfWeek(d: Date = new Date()): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

export function endOfWeek(d: Date = new Date()): Date {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6); // Sunday — ranges are inclusive on both ends
  return s;
}

/** [inclusive from, inclusive to] ISO date strings for the current Mon–Sun week. */
export function thisWeekRange(): { from: string; to: string } {
  return { from: toISODate(startOfWeek()), to: toISODate(endOfWeek()) };
}

export function lastWeekRange(): { from: string; to: string } {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return { from: toISODate(startOfWeek(d)), to: toISODate(endOfWeek(d)) };
}

/** Mon–Sun (inclusive) week containing `d`. */
export function weekRangeOf(d: Date): { from: string; to: string } {
  return { from: toISODate(startOfWeek(d)), to: toISODate(endOfWeek(d)) };
}

/** Full calendar month (inclusive both ends) containing `d`. */
export function monthRangeOf(d: Date): { from: string; to: string } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); // day 0 of next month
  return { from: toISODate(first), to: toISODate(last) };
}

/** Long month label, e.g. "July 2026". */
export function fmtMonth(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + "T00:00:00");
  const b = new Date(toISO.slice(0, 10) + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue, Jul 7" — short human-friendly date. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "—";
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Jul 7, 2026" */
export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Jul 7, 11:30 AM" */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mins = d.getMinutes();
  const time = mins === 0 ? `${h} ${ampm}` : `${h}:${pad(mins)} ${ampm}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
}

/** Resolve a report date range from searchParams, defaulting to this week. */
export function rangeFromSP(sp: Record<string, string | string[] | undefined>): { from: string; to: string } {
  const get = (k: string) => {
    const v = sp[k];
    const str = Array.isArray(v) ? v[0] : v;
    return str && str.length ? str : undefined;
  };
  const def = thisWeekRange();
  return { from: get("from") ?? def.from, to: get("to") ?? def.to };
}

export function fmtMoney(n: number | null | undefined): string {
  if (!n) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}
