import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, count, inArray, lt } from "drizzle-orm";
import { PageHeader, Card, CardHeader, DrillNumber, pillSm } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import ScopeToggle from "@/components/ScopeToggle";
import { metricValues, qs } from "@/lib/metrics";
import { OPEN_STAGES } from "@/lib/taxonomy";
import { requireUser } from "@/lib/auth";
import { activeCity, resolveScope, scopeConds, selectableUsers } from "@/lib/scope";
import {
  weekRangeOf, monthRangeOf, addDays, todayISO, fmtDateLong, fmtMonth, daysBetween,
} from "@/lib/dates";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Performance Report" };
export const dynamic = "force-dynamic";

type Period = "week" | "month";

/** Current + previous ranges and labels for the chosen period and offset. */
function resolvePeriod(period: Period, offset: number) {
  if (period === "week") {
    const anchor = new Date();
    anchor.setDate(anchor.getDate() + offset * 7);
    const cur = weekRangeOf(anchor);
    const prev = weekRangeOf(new Date(anchor.getTime() - 7 * 86400000));
    return { cur, prev, label: `Week of ${fmtDateLong(cur.from)}`, prevLabel: "last week", unit: "week" };
  }
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const cur = monthRangeOf(anchor);
  const prevAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const prev = monthRangeOf(prevAnchor);
  return { cur, prev, label: fmtMonth(cur.from), prevLabel: "last month", unit: "month" };
}

function Delta({ diff, invert = false }: { diff: number; invert?: boolean }) {
  if (diff === 0) return <span className="text-xs text-faint">—</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs font-medium ${good ? "text-good" : "text-bad"}`}>
      {up ? "↑" : "↓"} {Math.abs(diff)}
    </span>
  );
}

export default async function PerformanceReport({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const period: Period = spStr(sp, "period") === "month" ? "month" : "week";
  const offset = Number(spStr(sp, "offset") ?? 0) || 0;
  const { cur, prev, label, prevLabel, unit } = resolvePeriod(period, offset);

  // Whose performance: all cities, this city, or one person.
  const [user, scope, city, people] = await Promise.all([
    requireUser(), resolveScope(sp), activeCity(), selectableUsers(),
  ]);
  const link = scope.params;
  const inScope = scopeConds(s.opportunities, scope);

  const staleCutoff = addDays(todayISO(), -14);
  const [m, mPrev, openOpps, staleOpps, goals] = await Promise.all([
    metricValues(cur.from, cur.to, scope, link),
    metricValues(prev.from, prev.to, scope, link),
    db.select({ c: count() }).from(s.opportunities).where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), ...inScope)),
    db.select({ c: count() }).from(s.opportunities)
      .where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), lt(s.opportunities.stageChangedAt, staleCutoff), ...inScope)),
    db.query.reportGoals.findMany({ orderBy: (g, { asc }) => [asc(g.sortOrder)] }),
  ]);

  const delta = (key: string) => m[key].value - mPrev[key].value;
  const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

  // Goal pace: weekly targets scaled to the period length (a month ≈ 4.3 weeks).
  const weeksInPeriod = Math.max(1, Math.round((daysBetween(cur.from, cur.to) + 1) / 7));

  const activityRows = [
    "businesses_added", "businesses_contacted", "in_person_visits", "phone_calls",
    "emails", "follow_ups_completed", "partnership_conversations", "drop_box_visits",
    "events_booked", "events_held",
  ];
  const outcomeRows = [
    "new_leads", "screenings_completed", "appointments_booked", "appointments_showed", "no_shows",
  ];

  const showed = m.appointments_showed.value;
  const decided = showed + m.no_shows.value;
  const charged = m.money_charged.value;
  const collected = m.money_collected.value;
  const rates = [
    { label: "Lead → Appointment", value: m.new_leads.value > 0 ? `${Math.round((m.appointments_booked.value / m.new_leads.value) * 100)}%` : "—", href: m.appointments_booked.href },
    { label: "Show rate (of decided)", value: decided > 0 ? `${Math.round((showed / decided) * 100)}%` : "—", href: m.appointments_showed.href },
    { label: "Collected / charged", value: charged > 0 ? `${Math.round((collected / charged) * 100)}%` : "—", href: m.money_collected.href },
  ];

  const periodLink = (p: Period, o: number) =>
    `/reports/performance${qs({ period: p, offset: o || undefined, ...link })}`;

  const metricTable = (title: string, keys: string[]) => (
    <Card className="print-keep">
      <CardHeader title={title} />
      <table className="tbl">
        <thead><tr>
          <th>Metric</th>
          <th className="text-right">This {unit}</th>
          <th className="text-right">vs {prevLabel}</th>
        </tr></thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td className="text-soft">{m[k].label}</td>
              <td className="text-right"><DrillNumber value={m[k].value} href={m[k].href} /></td>
              <td className="text-right"><Delta diff={delta(k)} invert={k === "no_shows"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Performance Report"
        subtitle={<span>{label} · {scope.label} · <span className="text-faint">every number opens its source records</span></span>}
        actions={<PrintButton />} />

      <ScopeToggle basePath="/reports/performance" sp={sp} mode={scope.mode} cityName={city?.name ?? "My city"}
        isAdmin={user.role === "admin"} people={people} meId={user.id} />

      {/* Controls (hidden on print) */}
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={periodLink("week", 0)} className={period === "week" ? pillSm + " !bg-ink !text-canvas" : pillSm}>Weekly</Link>
        <Link href={periodLink("month", 0)} className={period === "month" ? pillSm + " !bg-ink !text-canvas" : pillSm}>Monthly</Link>
        <span className="mx-1 h-4 w-px bg-line" />
        <Link href={periodLink(period, offset - 1)} className={pillSm}>← Previous</Link>
        <Link href={periodLink(period, 0)} className={pillSm}>Current</Link>
        {offset < 0 && <Link href={periodLink(period, offset + 1)} className={pillSm}>Next →</Link>}
      </div>

      {/* Print-only heading so the PDF is self-describing */}
      <div className="mb-5 hidden print:block">
        <h1 className="text-2xl font-semibold">Illumin8 Outreach — Performance Report</h1>
        <p className="text-sm text-soft">{scope.label} · {label} ({fmtDateLong(cur.from)} – {fmtDateLong(cur.to)})</p>
      </div>

      {/* Headline money */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Appointments Booked", key: "appointments_booked" },
          { label: "Appointments Showed", key: "appointments_showed" },
        ].map((c) => (
          <Card key={c.key} className="print-keep p-4">
            <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">{c.label}</p>
            <p className="mt-1.5 text-2xl font-semibold leading-none">{m[c.key].value}</p>
            <p className="mt-1.5"><Delta diff={delta(c.key)} /> <span className="text-xs text-faint">vs {prevLabel}</span></p>
          </Card>
        ))}
        <Card className="print-keep p-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">Money Charged</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none text-accent-deep">{money(charged)}</p>
          <p className="mt-1.5"><span className="text-xs text-faint">{money(delta("money_charged") >= 0 ? delta("money_charged") : -delta("money_charged"))} {delta("money_charged") >= 0 ? "more" : "less"} vs {prevLabel}</span></p>
        </Card>
        <Card className="print-keep p-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">Money Collected</p>
          <p className="mt-1.5 text-2xl font-semibold leading-none text-accent-deep">{money(collected)}</p>
          <p className="mt-1.5"><span className="text-xs text-faint">of {money(charged)} charged</span></p>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {metricTable(`Activity · what ${scope.mode !== "person" ? "we" : scope.userId === user.id ? "I" : scope.label} did`, activityRows)}
        {metricTable("Outcomes · what it produced", outcomeRows)}

        <Card className="print-keep">
          <CardHeader title="Conversion Rates" />
          <table className="tbl">
            <tbody>
              {rates.map((r) => (
                <tr key={r.label}>
                  <td className="text-soft">{r.label}</td>
                  <td className="text-right"><DrillNumber value={r.value} href={r.href} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="print-keep">
          <CardHeader title="Pipeline (as of today)" />
          <table className="tbl">
            <tbody>
              <tr>
                <td className="text-soft">Open opportunities</td>
                <td className="text-right"><DrillNumber value={Number(openOpps[0]?.c ?? 0)} href={`/opportunities${qs({ open: "1", ...link })}`} /></td>
              </tr>
              <tr>
                <td className="text-soft">Stale (14+ days in stage)</td>
                <td className="text-right"><DrillNumber value={Number(staleOpps[0]?.c ?? 0)} href={`/opportunities${qs({ stale: "1", ...link })}`} /></td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* Goal pace */}
      <Card className="mt-5 print-keep">
        <CardHeader title={`Goal Pace${weeksInPeriod > 1 ? ` (weekly targets × ${weeksInPeriod})` : ""}`} />
        <table className="tbl">
          <thead><tr>
            <th>Goal</th><th className="text-right">Actual</th><th className="text-right">Target</th><th className="text-right">Progress</th>
          </tr></thead>
          <tbody>
            {goals.map((g) => {
              const metric = m[g.metric];
              if (!metric) return null;
              const target = g.weeklyTarget * weeksInPeriod;
              const pct = target > 0 ? Math.round((metric.value / target) * 100) : 0;
              return (
                <tr key={g.id}>
                  <td className="text-soft">{g.label}</td>
                  <td className="text-right"><DrillNumber value={metric.value} href={metric.href} /></td>
                  <td className="text-right text-soft">{target}</td>
                  <td className="text-right">
                    <span className={`font-medium ${pct >= 100 ? "text-good" : pct >= 60 ? "text-accent-deep" : "text-soft"}`}>{pct}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="mt-4 text-xs text-faint print:mt-6">
        Definitions match the Command Center and weekly reports — one source of truth. “Booked” counts appointments created in
        the period; “charged” and “collected” sum their amounts. Goal targets are the weekly goals from Settings, scaled to the period length.
      </p>
    </div>
  );
}
