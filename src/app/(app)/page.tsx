import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Card, CardHeader, LinkableMetric, EmptyState, RecordLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import ScopeToggle from "@/components/ScopeToggle";
import EventStatusPicker from "@/components/EventStatusPicker";
import { metricValues, pulseCounts, spendFor, qs } from "@/lib/metrics";
import { todaysFocus } from "@/lib/focus";
import { ensureFollowUpTasks } from "@/lib/housekeeping";
import { thisWeekRange, lastWeekRange, fmtDate, fmtDateTime, fmtMoney, todayISO, daysBetween } from "@/lib/dates";
import { CONTACT_ACTIVITY_TYPES, IN_PERSON_ACTIVITY_TYPES, PARTNERSHIP_CONVO_OUTCOMES } from "@/lib/taxonomy";
import { requireUser } from "@/lib/auth";
import { completeFocusItem } from "@/app/actions";
import { activeCity, resolveScope, scopeConds, selectableUsers } from "@/lib/scope";
import type { SP } from "@/lib/lists";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  task: "check", opportunity: "pipeline", event: "calendar", pickup: "megaphone",
};

export default async function CommandCenter({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const week = thisWeekRange();
  const prevWeek = lastWeekRange();
  const user = await requireUser();
  // Materialize "Enter outcomes" tasks for any event that has passed without results.
  await ensureFollowUpTasks();

  // Whose numbers this page is showing — all cities, this city, or one person.
  const [scope, city, people] = await Promise.all([resolveScope(sp), activeCity(), selectableUsers()]);
  const link = scope.params;
  const inScope = (t: Parameters<typeof scopeConds>[0]) => scopeConds(t, scope);

  // Spend is personal: on the default city view you see YOUR hours and YOUR
  // spend, not the team's. Switching the toggle to a person or org follows it.
  const spendScope = scope.mode === "city" ? { ...scope, userId: user.id } : scope;

  const [metrics, prevMetrics, pulse, focus, weekEvents, goals, weekActivities, weekAccounts, mySpend] = await Promise.all([
    metricValues(week.from, week.to, scope, link),
    metricValues(prevWeek.from, prevWeek.to, scope, link),
    pulseCounts(scope, link),
    // Today's Focus is always *my* work in *my* city — it ignores the toggle.
    todaysFocus(8, { cityId: city?.id ?? null, userId: user.id }),
    db.query.events.findMany({
      where: and(
        gte(s.events.startsAt, week.from),
        lt(s.events.startsAt, week.to + "T99"),
        inArray(s.events.status, ["Booked", "Confirmed", "Date Pending", "Planning", "Completed", "Follow-Up Needed"]),
        ...inScope(s.events),
      ),
      orderBy: [asc(s.events.startsAt)],
    }),
    db.query.reportGoals.findMany({ orderBy: (g, { asc }) => [asc(g.sortOrder)] }),
    db.query.activities.findMany({
      where: and(gte(s.activities.occurredAt, week.from), lt(s.activities.occurredAt, week.to + "T99"), eq(s.activities.systemGenerated, false), ...inScope(s.activities)),
      columns: { type: true, outcome: true, occurredAt: true },
    }),
    db.query.accounts.findMany({
      where: and(gte(s.accounts.createdAt, week.from), lt(s.accounts.createdAt, week.to + "T99"), ...inScope(s.accounts)),
      columns: { createdAt: true },
    }),
    spendFor(week.from, week.to, spendScope),
  ]);

  // Per-day (Mon–Sun) mini-trends for the activity cards — same definitions
  // as the metrics, bucketed by day. Decorative, but never a different story.
  const bucket = (rows: { occurredAt?: string; createdAt?: string }[], test: (r: any) => boolean) => {
    const days = new Array<number>(7).fill(0);
    for (const r of rows) {
      if (!test(r)) continue;
      const iso = (r.occurredAt ?? r.createdAt ?? "").slice(0, 10);
      const idx = daysBetween(week.from, iso);
      if (idx >= 0 && idx < 7) days[idx]++;
    }
    return days;
  };
  const sparks: Record<string, number[]> = {
    businesses_contacted: bucket(weekActivities, (r) => (CONTACT_ACTIVITY_TYPES as readonly string[]).includes(r.type)),
    in_person_visits: bucket(weekActivities, (r) => (IN_PERSON_ACTIVITY_TYPES as readonly string[]).includes(r.type)),
    follow_ups_completed: bucket(weekActivities, (r) => r.type === "Follow-Up"),
    partnership_conversations: bucket(weekActivities, (r) => (PARTNERSHIP_CONVO_OUTCOMES as readonly string[]).includes(r.outcome)),
    drop_box_visits: bucket(weekActivities, (r) => r.type === "Drop Box Visit"),
    businesses_added: bucket(weekAccounts, () => true),
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const deltaOf = (key: string) => metrics[key].value - prevMetrics[key].value;

  const m = (key: string) => metrics[key];
  const weekEventsHref = `/events${qs({ from: week.from, to: week.to, ...link })}`;
  const today = todayISO();

  // "what I did" / "what Dr. Nate did" / "what we did" — reads naturally in
  // every scope instead of "what Albuquerque did".
  const doer =
    scope.mode !== "person" ? "we" : scope.userId === user.id ? "I" : scope.label;

  // Four each, so the rows stay even. Drop-box visits and partnership
  // conversations still appear in full on the performance report.
  const activityCards = [
    m("businesses_contacted"), m("in_person_visits"), m("follow_ups_completed"),
    m("businesses_added"),
  ];
  const outcomeCards = [
    m("new_leads"), m("meetings_booked"), m("events_booked"), m("events_held"),
    m("screenings_completed"), m("appointments_booked"),
  ];

  return (
    // flex-col on mobile so sections can be reordered (action first); plain
    // block on desktop, where DOM order already reads well.
    <div className="mx-auto flex max-w-6xl flex-col md:block">
      <div className="order-1 mb-6 md:order-none">
        <p className="text-sm font-medium text-accent-deep">{greeting}, {user.name}</p>
        <h1 className="mt-0.5 text-[1.85rem] font-semibold tracking-tight">Command Center</h1>
        <p className="mt-0.5 text-sm text-soft">
          Week of {fmtDate(week.from)} · {scope.label} — every number opens its source records.
        </p>
      </div>

      {/* Whose numbers: all cities / this city / one person. Sits above
          everything it governs on mobile. Needs its own top margin there —
          it follows the Events card, which has no bottom margin; on desktop
          it trails the header's mb-6 and needs nothing. */}
      <div className="order-4 mt-6 md:order-none md:mt-0">
        <ScopeToggle basePath="/" sp={sp} mode={scope.mode} cityName={city?.name ?? "My city"}
          isAdmin={user.role === "admin"} people={people} meId={user.id} />
      </div>

      {/* Primary action — the thing you actually do in the field (mobile only;
          desktop already has a Log Activity button in the sidebar). */}
      <Link href="/activities/new"
        className="btn-glow order-2 mb-5 flex items-center justify-center gap-2 rounded-full py-3.5 text-[0.95rem] font-semibold active:scale-[0.99] md:hidden">
        <Icon name="plus" className="h-5 w-5 text-accent" /> Log Activity
      </Link>

      {/* Pulse row — on mobile it sits below Today's Focus so the screen
          opens with what to do, not with numbers. */}
      <div className="stagger order-5 grid grid-cols-2 gap-3 md:order-none lg:grid-cols-4">
        <LinkableMetric label="Today's Follow-Ups" value={pulse.dueToday.value} href={pulse.dueToday.href} sub="Open tasks due today" />
        <LinkableMetric label="Overdue Follow-Ups" value={pulse.overdue.value} href={pulse.overdue.href} accent={pulse.overdue.value > 0} sub="Need attention first" />
        <LinkableMetric label="This Week's Events" value={weekEvents.length} href={weekEventsHref} sub="Scheduled this week" />
        <LinkableMetric label="Active Opportunities" value={pulse.activeOpps.value} href={pulse.activeOpps.href} sub="Open pipeline" />
      </div>

      <div className="order-3 grid gap-5 md:order-none md:mt-5 lg:grid-cols-3">
        {/* Today's Focus */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Today's Focus" action={
            <span className="hidden text-xs text-faint sm:inline">Ranked by due dates, stage & vertical</span>
          } />
          {focus.length === 0 ? (
            <EmptyState icon="check" title="Nothing urgent today"
              hint="No overdue follow-ups, due tasks, or imminent events. Go build pipeline." />
          ) : (
            <ul className="px-2 pb-2">
              {focus.map((f, i) => (
                // The Done button sits beside the link, not inside it — a button
                // nested in an anchor is invalid and swallows the click.
                <li key={i} className="flex items-center gap-1 rounded-xl transition-colors hover:bg-hairline">
                  <Link href={f.href}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      f.score >= 55 ? "bg-bad-soft text-bad" : f.score >= 45 ? "bg-warn-soft text-accent-deep" : "bg-info-soft text-info"
                    }`}>
                      <Icon name={KIND_ICON[f.kind]} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{f.title}</span>
                      <span className="block truncate text-xs text-soft">{f.reason}</span>
                    </span>
                    <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-faint" />
                  </Link>
                  {f.done && (
                    <form action={completeFocusItem} className="shrink-0 pr-2">
                      <input type="hidden" name="target" value={f.done.target} />
                      <input type="hidden" name="id" value={f.done.id} />
                      <button type="submit" title="Mark done"
                        className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-medium text-soft transition-colors hover:border-good hover:bg-good-soft hover:text-good">
                        Done
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* This week's events */}
        <Card className="min-w-0">
          <CardHeader title="This Week's Events" action={
            <Link href={weekEventsHref} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>
          } />
          {weekEvents.length === 0 ? (
            <EmptyState icon="calendar" title="No events this week"
              hint="Book one from the pipeline — aim for 6 per week." />
          ) : (
            <ul className="px-2 pb-2">
              {weekEvents.map((e) => {
                const isDone = e.status === "Completed";
                return (
                  // The badge is its own control, so it sits beside the link
                  // rather than inside it.
                  <li key={e.id} className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-hairline">
                    <Link href={`/events/${e.id}`} className="block min-w-0 flex-1">
                      {/* min-w-0 lets the truncate shrink instead of widening the card */}
                      <span className={`block truncate text-sm font-medium ${
                        isDone ? "text-soft line-through decoration-good decoration-2" : ""}`}>
                        {e.name}
                      </span>
                      <span className={`mt-0.5 block text-xs ${
                        isDone ? "text-faint"
                        : e.startsAt && e.startsAt.slice(0, 10) === today ? "font-medium text-accent-deep"
                        : "text-soft"}`}>
                        {fmtDateTime(e.startsAt)}
                      </span>
                    </Link>
                    <EventStatusPicker eventId={e.id} status={e.status} returnTo="/" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Activity metrics — what I did */}
      <h2 className="order-6 mb-3 mt-8 text-[0.8rem] font-semibold uppercase tracking-wider text-faint md:order-none">
        Activity · what {doer} did this week
      </h2>
      <div className="stagger order-7 grid grid-cols-2 gap-3 md:order-none lg:grid-cols-4">
        {activityCards.map((mm) => (
          <LinkableMetric key={mm.key} label={mm.label} value={mm.value} href={mm.href}
            spark={sparks[mm.key]} delta={deltaOf(mm.key)} />
        ))}
      </div>

      {/* Outcome metrics — what it produced */}
      <h2 className="order-8 mb-3 mt-7 text-[0.8rem] font-semibold uppercase tracking-wider text-faint md:order-none">
        Outcomes · what it produced this week
      </h2>
      <div className="stagger order-9 grid grid-cols-2 gap-3 md:order-none md:grid-cols-4">
        {outcomeCards.map((mm) => (
          <LinkableMetric key={mm.key} label={mm.label} value={mm.value} href={mm.href} delta={deltaOf(mm.key)} />
        ))}
        <LinkableMetric label="Money Collected" value={fmtMoney(m("money_collected").value)} href={m("money_collected").href} accent
          delta={deltaOf("money_collected")} deltaText={fmtMoney(Math.abs(deltaOf("money_collected")))}
          sub={`of ${fmtMoney(m("money_charged").value)} charged`} />
        {/* Your own hours and spend (see spendScope). No delta arrow — the card
            colours up green and down red, which would read as "spending more is
            good". The breakdown below carries the meaning. */}
        <LinkableMetric label={scope.mode === "city" ? "My Marketing Spend" : "Marketing Spend"}
          value={fmtMoney(mySpend.total)} href={`/spend${qs({ from: week.from, to: week.to })}`}
          sub={`${mySpend.hours.toFixed(1)} h + ${fmtMoney(mySpend.direct)} spend`} />
      </div>

      {/* Goal progress */}
      <Card className="order-10 mt-7 md:order-none">
        {/* Targets are per-person weekly goals, so the scope is named to keep
            an org-wide total from reading as one person's progress. */}
        <CardHeader title={`Weekly Goal Progress · ${scope.label}`} action={
          <Link href={`/reports/goals${qs(link)}`} className="text-xs font-medium text-accent-deep hover:underline">Full report</Link>
        } />
        <div className="grid gap-x-8 gap-y-4 px-5 pb-5 md:grid-cols-2">
          {goals.map((g) => {
            const metric = metrics[g.metric];
            if (!metric) return null;
            const pct = g.weeklyTarget > 0 ? Math.min(100, Math.round((metric.value / g.weeklyTarget) * 100)) : 0;
            return (
              <Link key={g.id} href={metric.href} className="group block">
                <span className="flex items-baseline justify-between text-sm">
                  <span className="font-medium transition-colors group-hover:text-accent-deep">{g.label}</span>
                  <span className="text-soft">{metric.value} <span className="text-faint">/ {g.weeklyTarget}</span></span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hairline">
                  <span
                    className={`block h-full rounded-full transition-all ${pct >= 100 ? "bg-good" : "bg-gradient-to-r from-brand-from to-brand-to"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
