import Link from "next/link";
import { db, schema as s } from "@/db";
import { eq, gte, isNotNull, lt } from "drizzle-orm";
import { PageHeader, Card, EmptyState, pillSm } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cityWhere } from "@/lib/scope";
import { fmtDate, todayISO, addDays } from "@/lib/dates";
import { MEETING_EVENT_TYPES } from "@/lib/taxonomy";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

type View = "day" | "week" | "month";

type Item = {
  day: string;           // YYYY-MM-DD
  time: string | null;   // "9:00 AM", or null for all-day
  endTime: string | null;
  sort: string;
  label: string;
  href: string;
  kind: "event" | "meeting" | "appointment" | "task" | "pickup";
};

const KIND_STYLE: Record<Item["kind"], string> = {
  event: "bg-accent-soft text-accent-deep",
  meeting: "bg-good-soft text-good",
  appointment: "bg-info-soft text-info",
  task: "bg-hairline text-soft",
  pickup: "bg-warn-soft text-accent-deep",
};

const KIND_LABEL: Record<Item["kind"], string> = {
  event: "Events", meeting: "Meetings & time off", appointment: "Appointments",
  task: "Tasks & calls", pickup: "Drop box pickups",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtTime(iso: string): string | null {
  if (iso.length <= 10) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${m < 10 ? "0" : ""}${m} ${ampm}`;
}

/** Monday-based start of the week containing `iso`. */
function weekStart(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const shift = (d.getDay() + 6) % 7;
  return addDays(iso, -shift);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayISO();

  const viewParam = spStr(sp, "v");
  const view: View = viewParam === "day" || viewParam === "week" ? viewParam : "month";
  // `d` anchors day/week views; `m` anchors the month grid.
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(spStr(sp, "d") ?? "") ? spStr(sp, "d")! : today;

  // ---- Work out the visible window for the chosen view ----
  let first: string, last: string, title: string;
  if (view === "day") {
    first = last = anchor;
    title = fmtDate(anchor);
  } else if (view === "week") {
    first = weekStart(anchor);
    last = addDays(first, 6);
    title = `${fmtDate(first)} – ${fmtDate(last)}`;
  } else {
    const month = /^\d{4}-\d{2}$/.test(spStr(sp, "m") ?? "") ? spStr(sp, "m")! : anchor.slice(0, 7);
    const [y, mo] = month.split("-").map(Number);
    first = `${month}-01`;
    const daysInMonth = new Date(y, mo, 0).getDate();
    last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    title = `${MONTH_NAMES[mo - 1]} ${y}`;
  }
  const upper = last + "T99";

  // Previous / next targets depend on the view's step size.
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const monthOf = first.slice(0, 7);
  const [my, mm] = monthOf.split("-").map(Number);
  const prevHref = view === "month"
    ? `/calendar?v=month&m=${mm === 1 ? `${my - 1}-12` : `${my}-${String(mm - 1).padStart(2, "0")}`}`
    : `/calendar?v=${view}&d=${addDays(first, -step)}`;
  const nextHref = view === "month"
    ? `/calendar?v=month&m=${mm === 12 ? `${my + 1}-01` : `${my}-${String(mm + 1).padStart(2, "0")}`}`
    : `/calendar?v=${view}&d=${addDays(first, step)}`;

  // The calendar shows the city you're working in — nothing from the other market.
  const [events, appointments, tasks, pickups] = await Promise.all([
    db.query.events.findMany({ where: await cityWhere(s.events.cityId, isNotNull(s.events.startsAt), gte(s.events.startsAt, first), lt(s.events.startsAt, upper)) }),
    db.query.appointments.findMany({ where: await cityWhere(s.appointments.cityId, isNotNull(s.appointments.scheduledAt), gte(s.appointments.scheduledAt, first), lt(s.appointments.scheduledAt, upper)) }),
    db.query.tasks.findMany({ where: await cityWhere(s.tasks.cityId, eq(s.tasks.status, "Open"), isNotNull(s.tasks.dueDate), gte(s.tasks.dueDate, first), lt(s.tasks.dueDate, upper)) }),
    db.select({ id: s.partners.id, name: s.accounts.name, due: s.partners.nextPickupDueAt })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(await cityWhere(s.partners.cityId, eq(s.partners.dropBoxActive, true), isNotNull(s.partners.nextPickupDueAt), gte(s.partners.nextPickupDueAt, first), lt(s.partners.nextPickupDueAt, upper))),
  ]);

  const items: Item[] = [
    ...events
      .filter((e) => !["Canceled", "Lost"].includes(e.status))
      .map((e): Item => ({
        day: e.startsAt!.slice(0, 10), time: fmtTime(e.startsAt!),
        endTime: e.endsAt ? fmtTime(e.endsAt) : null, sort: e.startsAt!,
        label: e.name, href: `/events/${e.id}`,
        // Meetings and time off are green — visually separate from outreach events.
        kind: (MEETING_EVENT_TYPES as readonly string[]).includes(e.type) ? "meeting" : "event",
      })),
    ...appointments
      .filter((a) => a.status !== "Canceled")
      .map((a): Item => ({
        day: a.scheduledAt!.slice(0, 10), time: fmtTime(a.scheduledAt!), endTime: null, sort: a.scheduledAt!,
        label: `Appt: ${a.personName || "Unnamed"}`, href: `/appointments/${a.id}/edit`, kind: "appointment",
      })),
    ...tasks.map((t): Item => ({
      day: t.dueDate!.slice(0, 10), time: null, endTime: null, sort: t.dueDate! + "T00",
      label: t.title, href: `/tasks/${t.id}?from=calendar`, kind: "task",
    })),
    ...pickups.map((p): Item => ({
      day: p.due!.slice(0, 10), time: null, endTime: null, sort: p.due! + "T01",
      label: `Pickup: ${p.name}`, href: `/partners/${p.id}`, kind: "pickup",
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  const byDay = new Map<string, Item[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);

  // "Add" prefills the day you're looking at, at 9am — a sensible default that
  // is still editable on the form.
  const addOn = (iso: string) => `${iso}T09:00`;
  const addButtons = (iso: string, compact = false) => (
    <span className={`flex items-center gap-1.5 ${compact ? "" : "flex-wrap"}`}>
      {/* Meeting is its own button because it's the common calendar entry —
          internal meetings and blocked-out time, not outreach. */}
      <Link href={`/events/new?startsAt=${addOn(iso)}&type=Meeting`} className={pillSm}>+ Meeting</Link>
      <Link href={`/events/new?startsAt=${addOn(iso)}`} className={pillSm}>+ Event</Link>
      <Link href={`/tasks/new?dueDate=${iso}`} className={pillSm}>+ Task</Link>
    </span>
  );

  const viewTab = (v: View, label: string) => (
    <Link href={`/calendar?v=${v}&d=${view === "month" ? first : anchor}`}
      className={v === view ? `${pillSm} pill-active` : `${pillSm} pill-idle`}>
      {label}
    </Link>
  );

  /** One item row, used by the day and week views. */
  const itemRow = (item: Item, i: number) => (
    <li key={i}>
      <Link href={item.href} className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-hairline">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${KIND_STYLE[item.kind].split(" ")[0]}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.label}</span>
          {item.time && (
            <span className="block text-xs text-soft">
              {item.time}{item.endTime ? ` – ${item.endTime}` : ""}
            </span>
          )}
        </span>
      </Link>
    </li>
  );

  const weekDays = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : [];

  // Month grid scaffolding
  const firstWeekday = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const daysInMonth = Number(last.slice(8));
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const dayKey = (d: number) => `${monthOf}-${String(d).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Calendar"
        subtitle="Events, appointments, follow-up tasks, and drop box pickups in one place"
        actions={addButtons(view === "month" ? today : anchor)} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-[1.25rem] border border-line bg-card p-1 shadow-card">
          {viewTab("day", "Day")}{viewTab("week", "Week")}{viewTab("month", "Month")}
        </span>
        <span className="mx-1 h-4 w-px bg-line" />
        <Link href={prevHref} className={pillSm}>←</Link>
        <Link href={`/calendar?v=${view}&d=${today}`} className={pillSm}>Today</Link>
        <Link href={nextHref} className={pillSm}>→</Link>
        <span className="ml-2 text-lg font-semibold tracking-tight">{title}</span>
        <span className="ml-auto hidden items-center gap-3 text-xs text-soft md:flex">
          {(Object.keys(KIND_STYLE) as Item["kind"][]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[k].split(" ")[0]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </span>
      </div>

      {/* ---- Day ---- */}
      {view === "day" && (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <p className={`text-sm font-semibold ${anchor === today ? "text-accent-deep" : ""}`}>
              {anchor === today ? "Today · " : ""}{fmtDate(anchor)}
            </p>
            {addButtons(anchor, true)}
          </div>
          {(byDay.get(anchor) ?? []).length === 0 ? (
            <EmptyState icon="calendar" title="Nothing scheduled"
              hint="Add an event or a task for this day using the buttons above." />
          ) : (
            <ul className="p-2">{(byDay.get(anchor) ?? []).map(itemRow)}</ul>
          )}
        </Card>
      )}

      {/* ---- Week: 7 columns on desktop, stacked days on mobile ---- */}
      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays.map((iso) => {
            const dayItems = byDay.get(iso) ?? [];
            const isToday = iso === today;
            return (
              <Card key={iso} className={`min-w-0 ${isToday ? "ring-2 ring-accent/40" : ""}`}>
                <Link href={`/calendar?v=day&d=${iso}`}
                  className="flex items-baseline justify-between gap-2 border-b border-hairline px-3 py-2 transition-colors hover:bg-hairline">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-accent-deep" : "text-faint"}`}>
                    {DOW[(new Date(iso + "T12:00:00").getDay() + 6) % 7]} {Number(iso.slice(8))}
                  </span>
                  {dayItems.length > 0 && <span className="text-[0.7rem] text-faint">{dayItems.length}</span>}
                </Link>
                {dayItems.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-faint">—</p>
                ) : (
                  <ul className="p-1.5">{dayItems.map(itemRow)}</ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- Month: grid on desktop, agenda on mobile ---- */}
      {view === "month" && (
        <>
          <Card className="hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b border-line">
              {DOW.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-faint">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const key = d ? dayKey(d) : null;
                const dayItems = key ? byDay.get(key) ?? [] : [];
                const isToday = key === today;
                return (
                  <div key={i} className={`min-h-28 border-b border-r border-hairline p-1.5 [&:nth-child(7n)]:border-r-0 ${d ? "" : "bg-canvas/60"}`}>
                    {d && key && (
                      <>
                        <Link href={`/calendar?v=day&d=${key}`}
                          className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-hairline ${
                            isToday ? "bg-accent text-white" : "text-soft"}`}>
                          {d}
                        </Link>
                        <div className="space-y-1">
                          {dayItems.slice(0, 4).map((item, j) => (
                            <Link key={j} href={item.href}
                              className={`block truncate rounded-lg px-1.5 py-0.5 text-[0.68rem] font-medium transition-opacity hover:opacity-75 ${KIND_STYLE[item.kind]}`}
                              title={`${item.time ? item.time + (item.endTime ? `–${item.endTime}` : "") + " · " : ""}${item.label}`}>
                              {item.time && <span className="opacity-70">{item.time} </span>}{item.label}
                            </Link>
                          ))}
                          {dayItems.length > 4 && (
                            <Link href={`/calendar?v=day&d=${key}`} className="block px-1.5 text-[0.65rem] text-faint hover:underline">
                              +{dayItems.length - 4} more
                            </Link>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="md:hidden">
            {byDay.size === 0 ? (
              <Card><EmptyState icon="calendar" title="Nothing scheduled this month" /></Card>
            ) : (
              <div className="space-y-4">
                {[...byDay.entries()].map(([day, dayItems]) => (
                  <Card key={day} className={day === today ? "ring-2 ring-accent/40" : ""}>
                    <Link href={`/calendar?v=day&d=${day}`}
                      className={`block px-4 pt-3 text-xs font-semibold uppercase tracking-wider ${day === today ? "text-accent-deep" : "text-faint"}`}>
                      {day === today ? "Today · " : ""}{fmtDate(day)}
                    </Link>
                    <ul className="p-2">{dayItems.map(itemRow)}</ul>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
