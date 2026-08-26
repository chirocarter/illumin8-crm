import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, count, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { PageHeader, Card, CardHeader, DrillNumber, pillSm } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import ScopeToggle from "@/components/ScopeToggle";
import { metricValues, qs } from "@/lib/metrics";
import { OPEN_STAGES, REPORTING_CALL_TYPES, OUTREACH_EVENT_ACTIVITY_TYPES } from "@/lib/taxonomy";
import { requireUser } from "@/lib/auth";
import { activeCity, resolveScope, scopeConds, selectableUsers } from "@/lib/scope";
import {
  weekRangeOf, monthRangeOf, addDays, todayISO, fmtDateLong, fmtMonth, daysBetween,
} from "@/lib/dates";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Performance Report" };
export const dynamic = "force-dynamic";

type Period = "week" | "month" | "custom";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * An explicit from/to pair, if the URL carries a usable one.
 *
 * Reversed dates are swapped rather than rejected — picking the end first is an
 * easy slip and silently showing an empty report would look like a data problem
 * rather than a typo.
 */
function customRange(sp: SP): { from: string; to: string } | null {
  const from = spStr(sp, "from");
  const to = spStr(sp, "to");
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Current + previous ranges and labels for the chosen period and offset. */
function resolvePeriod(period: Period, offset: number, custom: { from: string; to: string } | null) {
  if (period === "custom" && custom) {
    // Compare against the window of the same length immediately before it, so
    // "vs previous period" means something whatever length you picked.
    const days = daysBetween(custom.from, custom.to) + 1;
    const prev = { from: addDays(custom.from, -days), to: addDays(custom.from, -1) };
    return {
      cur: custom,
      prev,
      label: `${fmtDateLong(custom.from)} – ${fmtDateLong(custom.to)}`,
      prevLabel: `previous ${days} day${days === 1 ? "" : "s"}`,
      unit: "period",
    };
  }
  if (period === "week") {
    // Offset 0 is the last COMPLETED Fri–Thu week, not the one in progress.
    // This report is pulled Friday morning for the period that closed the night
    // before; landing on a week that is a few hours old would show an empty
    // report and force a click backwards every single time. Offset +1 reaches
    // the in-progress week, which is what the Command Center shows.
    const anchor = new Date();
    anchor.setDate(anchor.getDate() + (offset - 1) * 7);
    const prevAnchor = new Date(anchor);
    prevAnchor.setDate(prevAnchor.getDate() - 7);
    const cur = weekRangeOf(anchor);
    const prev = weekRangeOf(prevAnchor);
    return { cur, prev, label: `Week of ${fmtDateLong(cur.from)}`, prevLabel: "last week", unit: "week" };
  }
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const cur = monthRangeOf(anchor);
  const prevAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const prev = monthRangeOf(prevAnchor);
  return { cur, prev, label: fmtMonth(cur.from), prevLabel: "last month", unit: "month" };
}

/** Whether the period being shown has finished, is running, or hasn't started. */
function periodState(cur: { from: string; to: string }): "Completed" | "In progress" | "Upcoming" {
  const today = todayISO();
  if (cur.to < today) return "Completed";
  if (cur.from > today) return "Upcoming";
  return "In progress";
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
  const custom = customRange(sp);
  const asked = spStr(sp, "period");
  // A usable from/to pair wins: it can only get into the URL deliberately, and
  // honouring `period` over it would silently ignore the dates you just picked.
  const period: Period = custom ? "custom" : asked === "month" ? "month" : "week";
  const offset = Number(spStr(sp, "offset") ?? 0) || 0;
  const { cur, prev, label, prevLabel, unit } = resolvePeriod(period, offset, custom);
  const state = periodState(cur);
  // Weekly can step forward into the week in progress; monthly stops at today's.
  const maxOffset = period === "week" ? 1 : 0;
  // Stepping a custom range moves it by its own length, keeping the window size.
  const curDays = daysBetween(cur.from, cur.to) + 1;

  // Whose performance: all cities, this city, or one person.
  const [user, scope, city, people] = await Promise.all([
    requireUser(), resolveScope(sp), activeCity(), selectableUsers(),
  ]);
  const link = scope.params;
  const inScope = scopeConds(s.opportunities, scope);

  // Month to date — cumulative progress alongside the week. Anchored on the
  // month the period STARTS in: the week of Jul 27 runs into August, and
  // reporting "Aug 1–2" for it would read as a month that had barely begun.
  // Capped at today so a week running into the future doesn't imply data we
  // cannot have yet. Redundant on a monthly report, so hidden there.
  const mtdFrom = `${cur.from.slice(0, 7)}-01`;
  const mtdTo = cur.to > todayISO() ? todayISO() : cur.to;
  const showMtd = period === "week";

  // New patients per clinic, so you can see where the appointments landed.
  // Counted on createdAt, matching Appointments Booked exactly.
  const byOffice = await db
    .select({
      locationId: s.appointments.locationId,
      office: s.locations.name,
      appts: count(),
      charged: sum(s.appointments.revenue),
      collected: sql<number>`coalesce(sum(case when ${s.appointments.collected} then ${s.appointments.revenue} else 0 end), 0)`,
    })
    .from(s.appointments)
    .leftJoin(s.locations, eq(s.appointments.locationId, s.locations.id))
    .where(and(
      gte(s.appointments.createdAt, cur.from),
      lt(s.appointments.createdAt, cur.to + "T99"),
      ...scopeConds(s.appointments, scope),
    ))
    .groupBy(s.appointments.locationId, s.locations.name);

  // Composition of Calls For Reporting Purpose. The headline is a single
  // number, but an admin reading the PDF should be able to see what is inside
  // it without asking, so the four parts are shown alongside and must sum to it.
  const callParts = await db
    .select({ type: s.activities.type, n: count() })
    .from(s.activities)
    .where(and(
      gte(s.activities.occurredAt, cur.from),
      lt(s.activities.occurredAt, cur.to + "T99"),
      eq(s.activities.systemGenerated, false),
      inArray(s.activities.type, [...REPORTING_CALL_TYPES]),
      ...scopeConds(s.activities, scope),
    ))
    .groupBy(s.activities.type);
  const partOf = (types: string[]) =>
    callParts.filter((r) => types.includes(r.type)).reduce((t, r) => t + Number(r.n), 0);
  // Each part carries the query that reproduces its OWN number. Two of these
  // span more than one activity type, so a single `type=` filter would open a
  // list that disagrees with the figure above it.
  const callBreakdown = [
    { label: "Drop-Ins", value: partOf(["In-Person Visit"]), query: { type: "In-Person Visit" } },
    { label: "Phone Calls", value: partOf(["Phone Call", "Voicemail"]), query: { typeGroup: "phone" } },
    { label: "Meetings", value: partOf(["Meeting"]), query: { type: "Meeting" } },
    { label: "Events", value: partOf([...OUTREACH_EVENT_ACTIVITY_TYPES]), query: { typeGroup: "outreachevents" } },
  ];

  const staleCutoff = addDays(todayISO(), -14);
  const [m, mPrev, mMtd, openOpps, staleOpps, goals] = await Promise.all([
    metricValues(cur.from, cur.to, scope, link),
    metricValues(prev.from, prev.to, scope, link),
    showMtd ? metricValues(mtdFrom, mtdTo, scope, link) : Promise.resolve(null),
    db.select({ c: count() }).from(s.opportunities).where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), ...inScope)),
    db.select({ c: count() }).from(s.opportunities)
      .where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), lt(s.opportunities.stageChangedAt, staleCutoff), ...inScope)),
    db.query.reportGoals.findMany({ orderBy: (g, { asc }) => [asc(g.sortOrder)] }),
  ]);

  const delta = (key: string) => m[key].value - mPrev[key].value;
  const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

  // Goal pace: weekly targets scaled to the period length (a month ≈ 4.3 weeks).
  //
  // Week and month keep the whole-number scaling they have always used, so the
  // targets on those reports don't move under anyone mid-conversation. A custom
  // range can be any length, and rounding 10 days up to 2 whole weeks would set
  // a target 40% too high — so it scales by the exact days instead.
  const weeksInPeriod = period === "custom"
    ? curDays / 7
    : Math.max(1, Math.round((daysBetween(cur.from, cur.to) + 1) / 7));
  const paceLabel = period === "custom"
    ? ` (weekly targets × ${weeksInPeriod.toFixed(2).replace(/\.?0+$/, "")})`
    : weeksInPeriod > 1 ? ` (weekly targets × ${weeksInPeriod})` : "";

  const activityRows = [
    "businesses_added", "businesses_contacted", "in_person_visits", "phone_calls",
    "emails", "follow_ups_completed", "partnership_conversations", "drop_box_visits",
  ];
  // Meetings and events are tracked side by side but never added together —
  // a meeting is a conversation, an event is something you ran.
  const meetingRows = ["meetings_booked", "meetings_attended"];
  const eventRows = ["events_booked", "events_held", "screenings_completed"];
  const outcomeRows = [
    "new_leads", "partnerships_confirmed", "appointments_booked", "appointments_showed", "no_shows",
  ];
  const spendRows = ["hours_worked", "labour_cost", "direct_spend", "marketing_spend"];
  const isMoneyRow = (k: string) => k !== "hours_worked";

  const showed = m.appointments_showed.value;
  const decided = showed + m.no_shows.value;
  const charged = m.money_charged.value;
  const collected = m.money_collected.value;
  const rates = [
    { label: "Lead → Appointment", value: m.new_leads.value > 0 ? `${Math.round((m.appointments_booked.value / m.new_leads.value) * 100)}%` : "—", href: m.appointments_booked.href },
    { label: "Show rate (of decided)", value: decided > 0 ? `${Math.round((showed / decided) * 100)}%` : "—", href: m.appointments_showed.href },
    { label: "Collected / charged", value: charged > 0 ? `${Math.round((collected / charged) * 100)}%` : "—", href: m.money_collected.href },
  ];

  // from/to are omitted for week and month so switching back off a custom range
  // doesn't drag the old dates along and pin the report to them forever.
  const periodLink = (p: Period, o: number) =>
    `/reports/performance${qs({ period: p, offset: o || undefined, ...link })}`;
  const customLink = (r: { from: string; to: string }) =>
    `/reports/performance${qs({ from: r.from, to: r.to, ...link })}`;
  const shifted = (dir: -1 | 1) =>
    customLink({ from: addDays(cur.from, dir * curDays), to: addDays(cur.to, dir * curDays) });

  const metricTable = (title: string, keys: string[]) => (
    <Card className="print-keep">
      <CardHeader title={title} />
      <div className="overflow-x-auto">
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
      </div>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Screen header. Hidden on paper — the print masthead below replaces it,
          otherwise the PDF carries the title twice plus a dead "Print" button. */}
      <div className="print:hidden">
        <PageHeader title="Performance Report"
          subtitle={<span>{label} · {scope.label} · <span className="text-faint">every number opens its source records</span></span>}
          actions={<PrintButton />} />

        <ScopeToggle basePath="/reports/performance" sp={sp} mode={scope.mode} cityName={city?.name ?? "My city"}
          isAdmin={user.role === "admin"} people={people} meId={user.id} />
      </div>

      {/* Controls (hidden on print) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={periodLink("week", 0)} className={period === "week" ? pillSm + " pill-active" : pillSm}>Weekly</Link>
        <Link href={periodLink("month", 0)} className={period === "month" ? pillSm + " pill-active" : pillSm}>Monthly</Link>
        {/* Anchored on the range already on screen, so "Custom" opens showing
            the period you were just looking at rather than an empty form. */}
        <Link href={customLink(cur)} className={period === "custom" ? pillSm + " pill-active" : pillSm}>Custom</Link>
        <span className="mx-1 h-4 w-px bg-line" />
        {period === "custom" ? (
          <>
            <Link href={shifted(-1)} className={pillSm}>← Previous {curDays}d</Link>
            <Link href={periodLink("week", 0)} className={pillSm}>Back to weekly</Link>
            <Link href={shifted(1)} className={pillSm}>Next {curDays}d →</Link>
          </>
        ) : (
          <>
            <Link href={periodLink(period, offset - 1)} className={pillSm}>← Previous</Link>
            {/* On the weekly view offset 0 is the week that just closed, so "Latest"
                is the honest label — "Current" would promise the live one. */}
            <Link href={periodLink(period, 0)} className={offset === 0 ? pillSm + " pill-active" : pillSm}>
              {period === "week" ? "Latest closed week" : "Current"}
            </Link>
            {offset < maxOffset && <Link href={periodLink(period, offset + 1)} className={pillSm}>Next →</Link>}
          </>
        )}
        <span className={`ml-1 rounded-full px-2.5 py-1 text-[0.7rem] font-medium ${
          state === "Completed" ? "bg-good-soft text-good"
            : state === "In progress" ? "bg-warn-soft text-accent-deep"
            : "bg-info-soft text-info"}`}>
          {state === "In progress" ? `In progress — partial ${unit}` : state}
        </span>
      </div>

      {/* Date pickers. A plain GET form: no client JS, and the resulting URL is
          shareable and printable exactly as it appears. Hidden scope fields keep
          "All cities" or a person selected when the dates change. */}
      {period === "custom" && (
        <form method="get" action="/reports/performance"
          className="mb-5 flex flex-wrap items-end gap-3 rounded-card bg-card p-4 shadow-card print:hidden">
          {Object.entries(link).map(([k, v]) =>
            v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />)}
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-medium uppercase tracking-wider text-faint">From</span>
            <input type="date" name="from" defaultValue={cur.from} required
              className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.7rem] font-medium uppercase tracking-wider text-faint">To</span>
            <input type="date" name="to" defaultValue={cur.to} required
              className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm" />
          </label>
          <button type="submit" className={pillSm + " pill-active"}>Apply</button>
          <span className="text-xs text-faint">
            {curDays} day{curDays === 1 ? "" : "s"} · compared with the {curDays} before it
          </span>
        </form>
      )}

      {/* Print masthead — the PDF has to explain itself to someone who wasn't
          the one who generated it: who, what period, and when it was run. */}
      <div className="print-masthead mb-6 hidden print:block">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-soft">Illumin8 Chiropractic</p>
        <h1 className="mt-1 text-[1.6rem] font-semibold leading-tight tracking-tight">Community Outreach — Performance Report</h1>
        <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[0.8rem] text-soft">
          <span><span className="text-faint">Scope:</span> <span className="font-medium text-ink">{scope.label}</span></span>
          {/* Weeks run Fri–Thu. Spelled out because a reader who wasn't handed
              this in person will otherwise assume Mon–Sun and misread it. */}
          <span><span className="text-faint">Period:</span> <span className="font-medium text-ink">{label}</span> ({fmtDateLong(cur.from)} – {fmtDateLong(cur.to)}{period === "week" ? ", Fri–Thu" : period === "custom" ? `, custom ${curDays}-day range` : ""})</span>
          <span><span className="text-faint">Status:</span> <span className="font-medium text-ink">{state}</span></span>
          <span><span className="text-faint">Compared with:</span> {prevLabel}</span>
          <span><span className="text-faint">Generated:</span> {fmtDateLong(todayISO())}</span>
        </div>
      </div>

      {/* Calls For Reporting Purpose — the headline leadership asks for, so it
          leads the report on screen and on paper. print-keep stops it splitting
          across a page break, which would strand the total from its parts. */}
      <Card className="mb-5 print-keep print-callout border-2 border-accent/40 p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-accent-deep">
              Calls For Reporting Purpose
            </p>
            <Link href={m.calls_for_reporting.href}
              className="mt-1 block text-[2.75rem] font-semibold leading-none tracking-tight text-ink transition-colors hover:text-accent-deep">
              {m.calls_for_reporting.value}
            </Link>
            <p className="mt-2 text-xs text-soft">
              <Delta diff={delta("calls_for_reporting")} /> <span className="text-faint">vs {prevLabel}</span>
            </p>
          </div>

          {/* The four parts, each drilling into its own records. They sum to the
              headline, so the number can be checked rather than taken on faith. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
            {callBreakdown.map((part, i) => (
              <div key={part.label} className="flex items-center gap-2">
                {i > 0 && <span className="text-lg font-light text-faint">+</span>}
                <Link href={`/activities${qs({ from: cur.from, to: cur.to, ...part.query, ...link })}`}
                  className="rounded-xl bg-well px-3 py-2 text-center transition-colors hover:bg-hairline">
                  <span className="block text-lg font-semibold leading-none">{part.value}</span>
                  <span className="mt-1 block text-[0.65rem] font-medium uppercase tracking-wider text-faint">{part.label}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </Card>

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

      {/* Month to date — the running totals leadership asks for alongside the
          week. Same metric definitions, just a wider window. */}
      {mMtd && (
        <Card className="print-keep mb-5">
          <CardHeader title={`Month to Date · ${fmtMonth(mtdFrom)}`} action={
            <span className="text-xs text-faint">{fmtDateLong(mtdFrom)} – {fmtDateLong(mtdTo)}</span>
          } />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            {[
              { label: "Events Booked", metric: mMtd.events_booked, money: false },
              { label: "New Patient Appointments", metric: mMtd.appointments_booked, money: false },
              { label: "Money Collected", metric: mMtd.money_collected, money: true },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">{c.label}</p>
                <p className={`mt-1.5 text-2xl font-semibold leading-none ${c.money ? "text-accent-deep" : ""}`}>
                  <DrillNumber value={c.money ? money(c.metric.value) : c.metric.value} href={c.metric.href} />
                </p>
                <p className="mt-1.5 text-xs text-faint">
                  {c.money ? money(m.money_collected.value) : m[c.metric.key].value} this {unit}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {metricTable(`Activity · what ${scope.mode !== "person" ? "we" : scope.userId === user.id ? "I" : scope.label} did`, activityRows)}
        {metricTable("Outcomes · what it produced", outcomeRows)}
        {metricTable("Meetings · sit-downs, not events", meetingRows)}
        {metricTable("Events · screenings, lunch & learns, booths", eventRows)}

        {/* What the outreach cost — hours priced per person, plus money spent. */}
        <Card className="print-keep">
          <CardHeader title="Marketing Spend" action={
            <span className="hidden text-xs text-faint sm:inline">Hours × each person&apos;s rate, plus spend</span>} />
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Metric</th><th className="text-right">This {unit}</th><th className="text-right">vs {prevLabel}</th>
              </tr></thead>
              <tbody>
                {spendRows.map((k) => (
                  <tr key={k}>
                    <td className="text-soft">{m[k].label}</td>
                    <td className="text-right">
                      <DrillNumber
                        value={isMoneyRow(k) ? money(m[k].value) : m[k].value.toFixed(1)}
                        href={m[k].href} />
                    </td>
                    <td className="text-right text-xs text-faint">
                      {isMoneyRow(k) ? money(Math.abs(delta(k))) : Math.abs(delta(k)).toFixed(1)}
                      {delta(k) >= 0 ? " more" : " less"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Which office the new patients went to */}
        <Card className="print-keep">
          <CardHeader title="New Patients by Office" action={
            <span className="hidden text-xs text-faint sm:inline">Booked this {unit}</span>} />
          {byOffice.length === 0 ? (
            <p className="px-5 pb-5 pt-1 text-sm text-faint">No appointments booked this {unit}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  <th>Office</th>
                  <th className="text-right">Patients</th>
                  <th className="text-right">Collected</th>
                </tr></thead>
                <tbody>
                  {byOffice
                    .slice()
                    .sort((a, b) => Number(b.appts) - Number(a.appts))
                    .map((o) => (
                      <tr key={o.locationId ?? "none"}>
                        <td className="text-soft">{o.office ?? "No office set"}</td>
                        <td className="text-right">
                          {/* "none" rather than an omitted param — otherwise the
                              unassigned row would open every appointment. */}
                          <DrillNumber value={Number(o.appts)}
                            href={`/appointments${qs({ cfrom: cur.from, cto: cur.to, locationId: o.locationId ?? "none", ...link })}`} />
                        </td>
                        <td className="text-right text-soft">{money(Number(o.collected ?? 0))}</td>
                      </tr>
                    ))}
                  <tr>
                    <td className="font-medium">Total</td>
                    <td className="text-right font-medium">
                      {byOffice.reduce((n, o) => n + Number(o.appts), 0)}
                    </td>
                    <td className="text-right font-medium">
                      {money(byOffice.reduce((n, o) => n + Number(o.collected ?? 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="print-keep">
          <CardHeader title="Conversion Rates" />
          <div className="overflow-x-auto">
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
          </div>
        </Card>

        <Card className="print-keep">
          <CardHeader title="Pipeline (as of today)" />
          <div className="overflow-x-auto">
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
          </div>
        </Card>
      </div>

      {/* Goal pace */}
      <Card className="mt-5 print-keep">
        <CardHeader title={`Goal Pace${paceLabel}`} />
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>Goal</th><th className="text-right">Actual</th><th className="text-right">Target</th><th className="text-right">Progress</th>
            </tr></thead>
            <tbody>
              {goals.map((g) => {
                const metric = m[g.metric];
                if (!metric) return null;
                // A custom range scales fractionally, so the percentage uses the
                // exact target while the column shows a whole number to aim at.
                const target = g.weeklyTarget * weeksInPeriod;
                const pct = target > 0 ? Math.round((metric.value / target) * 100) : 0;
                return (
                  <tr key={g.id}>
                    <td className="text-soft">{g.label}</td>
                    <td className="text-right"><DrillNumber value={metric.value} href={metric.href} /></td>
                    <td className="text-right text-soft">{Math.round(target)}</td>
                    <td className="text-right">
                      <span className={`font-medium ${pct >= 100 ? "text-good" : pct >= 60 ? "text-accent-deep" : "text-soft"}`}>{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-faint print:mt-5 print:border-t print:border-line print:pt-3">
        <span className="hidden font-medium text-soft print:inline">How these numbers are defined — </span>
        <strong className="font-medium text-soft">Calls For Reporting Purpose</strong> = drop-ins + phone calls + meetings + events,
        counted from logged activities (In-Person Visit, Phone Call, Meeting, Screening Event, Lunch and Learn).
        Counted once each — an event is not also counted from the events calendar.
        Definitions match the Command Center and weekly reports — one source of truth. “Booked” counts appointments created in
        the period; “charged” and “collected” sum their amounts. Goal targets are the weekly goals from Settings, scaled to the period length.
        {period === "custom"
          ? ` This is a custom ${curDays}-day range compared with the ${curDays} days immediately before it.`
          : " Weeks run Friday through Thursday."}
      </p>

      {/* Signature line — these reports go to leadership, so the paper copy
          states who it covers and who produced it. */}
      <p className="hidden text-[0.7rem] text-faint print:mt-2 print:block">
        Illumin8 Chiropractic · Community Outreach · {scope.label} · prepared by {user.name}
      </p>
    </div>
  );
}
