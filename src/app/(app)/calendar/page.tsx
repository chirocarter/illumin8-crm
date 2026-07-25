import Link from "next/link";
import { db, schema as s } from "@/db";
import { eq, gte, isNotNull, lt } from "drizzle-orm";
import { PageHeader, Card, EmptyState, pillSm } from "@/components/ui";
import { cityWhere } from "@/lib/scope";
import { fmtDate, todayISO } from "@/lib/dates";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

type Item = {
  day: string;          // YYYY-MM-DD
  time: string | null;  // "9:00 AM" or null for all-day
  sort: string;
  label: string;
  href: string;
  kind: "event" | "appointment" | "task" | "pickup";
};

const KIND_STYLE: Record<Item["kind"], string> = {
  event: "bg-accent-soft text-accent-deep",
  appointment: "bg-info-soft text-info",
  task: "bg-hairline text-soft",
  pickup: "bg-warn-soft text-accent-deep",
};

const KIND_LABEL: Record<Item["kind"], string> = {
  event: "Events", appointment: "Appointments", task: "Tasks & calls", pickup: "Drop box pickups",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(spStr(sp, "m") ?? "") ? spStr(sp, "m")! : today.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);

  const first = `${month}-01`;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const last = `${month}-${daysInMonth < 10 ? "0" : ""}${daysInMonth}`;
  const firstWeekday = (new Date(year, mon - 1, 1).getDay() + 6) % 7; // Mon = 0
  const upper = last + "T99";

  const prevM = mon === 1 ? `${year - 1}-12` : `${year}-${mon - 1 < 10 ? "0" : ""}${mon - 1}`;
  const nextM = mon === 12 ? `${year + 1}-01` : `${year}-${mon + 1 < 10 ? "0" : ""}${mon + 1}`;

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
        day: e.startsAt!.slice(0, 10), time: fmtTime(e.startsAt!), sort: e.startsAt!,
        label: e.name, href: `/events/${e.id}`, kind: "event",
      })),
    ...appointments
      .filter((a) => a.status !== "Canceled")
      .map((a): Item => ({
        day: a.scheduledAt!.slice(0, 10), time: fmtTime(a.scheduledAt!), sort: a.scheduledAt!,
        label: `Appt: ${a.personName || "Unnamed"}`, href: `/appointments/${a.id}/edit`, kind: "appointment",
      })),
    ...tasks.map((t): Item => ({
      day: t.dueDate!.slice(0, 10), time: null, sort: t.dueDate! + "T00",
      // Opens the task itself, not the list you'd have to search through.
      label: t.title, href: `/tasks/${t.id}/edit`, kind: "task",
    })),
    ...pickups.map((p): Item => ({
      day: p.due!.slice(0, 10), time: null, sort: p.due! + "T01",
      label: `Pickup: ${p.name}`, href: `/partners/${p.id}`, kind: "pickup",
    })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  const byDay = new Map<string, Item[]>();
  for (const item of items) {
    const list = byDay.get(item.day) ?? [];
    list.push(item);
    byDay.set(item.day, list);
  }

  const dayKey = (d: number) => `${month}-${d < 10 ? "0" : ""}${d}`;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const navBtn = pillSm;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Calendar" subtitle="Events, appointments, follow-up tasks, and drop box pickups in one place" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/calendar?m=${prevM}`} className={navBtn}>←</Link>
        <Link href="/calendar" className={navBtn}>Today</Link>
        <Link href={`/calendar?m=${nextM}`} className={navBtn}>→</Link>
        <span className="ml-2 text-lg font-semibold tracking-tight">{MONTH_NAMES[mon - 1]} {year}</span>
        <span className="ml-auto hidden items-center gap-3 text-xs text-soft md:flex">
          {(Object.keys(KIND_STYLE) as Item["kind"][]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[k].split(" ")[0]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </span>
      </div>

      {/* Month grid — desktop */}
      <Card className="hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-line">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
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
                {d && (
                  <>
                    <span className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday ? "bg-accent text-white" : "text-soft"}`}>
                      {d}
                    </span>
                    <div className="space-y-1">
                      {dayItems.slice(0, 4).map((item, j) => (
                        <Link key={j} href={item.href}
                          className={`block truncate rounded-lg px-1.5 py-0.5 text-[0.68rem] font-medium transition-opacity hover:opacity-75 ${KIND_STYLE[item.kind]}`}
                          title={`${item.time ? item.time + " · " : ""}${item.label}`}>
                          {item.time && <span className="opacity-70">{item.time} </span>}{item.label}
                        </Link>
                      ))}
                      {dayItems.length > 4 && (
                        <span className="block px-1.5 text-[0.65rem] text-faint">+{dayItems.length - 4} more</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Agenda — mobile */}
      <div className="md:hidden">
        {byDay.size === 0 ? (
          <Card><EmptyState icon="calendar" title="Nothing scheduled this month" /></Card>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].map(([day, dayItems]) => (
              <Card key={day} className={day === today ? "ring-2 ring-accent/40" : ""}>
                <p className={`px-4 pt-3 text-xs font-semibold uppercase tracking-wider ${day === today ? "text-accent-deep" : "text-faint"}`}>
                  {day === today ? "Today · " : ""}{fmtDate(day)}
                </p>
                <ul className="p-2">
                  {dayItems.map((item, j) => (
                    <li key={j}>
                      <Link href={item.href} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-hairline">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND_STYLE[item.kind].split(" ")[0]}`} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                        {item.time && <span className="shrink-0 text-xs text-soft">{item.time}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
