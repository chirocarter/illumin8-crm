import { PageHeader, Card, CardHeader, DrillNumber } from "@/components/ui";
import RangeNav from "@/components/RangeNav";
import { metricValues } from "@/lib/metrics";
import { rangeFromSP, fmtDate, addDays, daysBetween } from "@/lib/dates";
import { db, schema as s } from "@/db";
import { and, count, gte, lt, sql } from "drizzle-orm";
import { activeCity, scopeConds } from "@/lib/scope";
import type { SP } from "@/lib/lists";

export const metadata = { title: "Weekly Activity Report" };
export const dynamic = "force-dynamic";

export default async function ActivityReport({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeFromSP(sp);
  const city = (await activeCity())?.id ?? null;
  const m = await metricValues(from, to, { cityId: city });

  // Per-day activity volume for the simple chart
  const perDay = await db
    .select({ day: sql<string>`substr(${s.activities.occurredAt}, 1, 10)`, c: count() })
    .from(s.activities)
    .where(and(gte(s.activities.occurredAt, from), lt(s.activities.occurredAt, to + "T99"), ...scopeConds(s.activities, { cityId: city })))
    .groupBy(sql`substr(${s.activities.occurredAt}, 1, 10)`);
  const numDays = Math.max(1, daysBetween(from, to));
  const days = Array.from({ length: Math.min(numDays, 14) }, (_, i) => addDays(from, i));
  const maxDay = Math.max(1, ...perDay.map((d) => Number(d.c)));

  const rows = [
    m.businesses_added, m.businesses_contacted, m.all_activities, m.in_person_visits,
    m.phone_calls, m.emails, m.follow_ups_completed, m.partnership_conversations,
    m.drop_box_visits, m.events_booked, m.events_held,
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Weekly Activity Report" subtitle="What you did — every number opens the records behind it"
        actions={<a href={`/api/export?entity=activities&from=${from}&to=${to}`}
          className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-hairline">Export activities CSV</a>} />
      <RangeNav basePath="/reports/activity" from={from} to={to} />

      <div className="grid gap-5 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader title="Activity Metrics" />
          <div className="overflow-x-auto">
            <table className="tbl">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="text-soft">{r.label}</td>
                    <td className="text-right"><DrillNumber value={r.value} href={r.href} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Activities Per Day" />
          <div className="flex h-44 items-end gap-1.5 px-5 pb-5">
            {days.map((d) => {
              const c = Number(perDay.find((p) => p.day === d)?.c ?? 0);
              return (
                <div key={d} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[0.65rem] font-medium text-soft opacity-0 transition-opacity group-hover:opacity-100">{c}</span>
                  <div className="w-full rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent-deep"
                    style={{ height: `${Math.max(3, (c / maxDay) * 110)}px` }} />
                  <span className="text-[0.62rem] text-faint">{fmtDate(d).split(", ")[0]}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <p className="mt-4 text-xs text-faint">
        Definitions: “Businesses contacted” counts distinct businesses with at least one outreach activity in the range.
        “Partnership conversations” are activities whose outcome is Reached Decision Maker, Good Conversation, Interested, Booked Meeting, Booked Event, or Closed/Converted.
        “Events held” are events with status Completed or Follow-Up Needed whose date falls in the range.
      </p>
    </div>
  );
}
