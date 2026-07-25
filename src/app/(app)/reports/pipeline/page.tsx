import { PageHeader, Card, CardHeader, DrillNumber, Badge, RecordLink } from "@/components/ui";
import { db, schema as s } from "@/db";
import { and, count, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { OPEN_STAGES, OPPORTUNITY_STAGES } from "@/lib/taxonomy";
import { addDays, fmtDate, todayISO } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { activeCity, cityWhere, scopeConds } from "@/lib/scope";

export const metadata = { title: "Pipeline Report" };
export const dynamic = "force-dynamic";

export default async function PipelineReport() {
  const staleCutoff = addDays(todayISO(), -14);
  // Pipeline is a working view, so it stays pinned to the active city.
  const city = await activeCity();
  const inCity = scopeConds(s.opportunities, { cityId: city?.id ?? null });
  const open = () => and(inArray(s.opportunities.stage, [...OPEN_STAGES]), ...inCity);

  const [byStage, byType, byVertical, byLocation, staleCount, openCount, likely] = await Promise.all([
    db.select({ k: s.opportunities.stage, c: count() }).from(s.opportunities)
      .where(and(...inCity)).groupBy(s.opportunities.stage),
    db.select({ k: s.opportunities.type, c: count() }).from(s.opportunities)
      .where(open()).groupBy(s.opportunities.type),
    db.select({ k: s.accounts.vertical, c: count() }).from(s.opportunities)
      .innerJoin(s.accounts, eq(s.opportunities.accountId, s.accounts.id))
      .where(open()).groupBy(s.accounts.vertical),
    db.select({ k: s.locations.name, id: s.locations.id, c: count() }).from(s.opportunities)
      .innerJoin(s.locations, eq(s.opportunities.clinicLocationId, s.locations.id))
      .where(open()).groupBy(s.locations.id, s.locations.name),
    db.select({ c: count() }).from(s.opportunities)
      .where(and(inArray(s.opportunities.stage, [...OPEN_STAGES]), lt(s.opportunities.stageChangedAt, staleCutoff), ...inCity)),
    db.select({ c: count() }).from(s.opportunities).where(open()),
    db.query.opportunities.findMany({
      where: await cityWhere(
        s.opportunities.cityId,
        inArray(s.opportunities.stage, ["Proposal / Details Sent", "Event Date Pending", "Event Booked", "Decision Maker Engaged"]),
        isNotNull(s.opportunities.expectedEventDate),
      ),
      orderBy: (o, { asc }) => [asc(o.expectedEventDate)],
      limit: 10,
    }),
  ]);

  const stageOrder = new Map(OPPORTUNITY_STAGES.map((st, i) => [st as string, i]));
  const sortedStages = [...byStage].sort((a, b) => (stageOrder.get(a.k) ?? 99) - (stageOrder.get(b.k) ?? 99));

  const groupTable = (title: string, rows: { k: string; c: number | string }[], hrefFor: (k: string) => string) => (
    <Card>
      <CardHeader title={title} />
      <table className="tbl">
        <thead><tr><th>{title.replace("Open Pipeline by ", "")}</th><th className="text-right">Count</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td className="text-soft">{r.k}</td>
              <td className="text-right"><DrillNumber value={Number(r.c)} href={hrefFor(r.k)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Pipeline Report" subtitle="Current state of every opportunity — click any count to open the list"
        actions={<a href="/api/export?entity=opportunities"
          className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-hairline">Export CSV</a>} />

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">Open opportunities</p>
          <p className="mt-1 text-2xl font-semibold">
            <DrillNumber value={Number(openCount[0]?.c ?? 0)} href="/opportunities?open=1" />
          </p>
          <p className="mt-1 text-xs text-soft">Across all active stages</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">Stale opportunities</p>
          <p className="mt-1 text-2xl font-semibold">
            <DrillNumber value={Number(staleCount[0]?.c ?? 0)} href="/opportunities?stale=1" />
          </p>
          <p className="mt-1 text-xs text-soft">Open, but stage unchanged for 14+ days</p>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {groupTable("Opportunities by Stage", sortedStages, (k) => `/opportunities${qs({ stage: k })}`)}
        {groupTable("Open Pipeline by Type", byType, (k) => `/opportunities${qs({ type: k, open: 1 })}`)}
        {groupTable("Open Pipeline by Vertical", byVertical, (k) => `/opportunities${qs({ vertical: k, open: 1 })}`)}
        <Card>
          <CardHeader title="Open Pipeline by Location" />
          <table className="tbl">
            <thead><tr><th>Location</th><th className="text-right">Count</th></tr></thead>
            <tbody>
              {byLocation.map((r) => (
                <tr key={r.id}>
                  <td className="text-soft">{r.k}</td>
                  <td className="text-right"><DrillNumber value={Number(r.c)} href={`/opportunities${qs({ locationId: r.id, open: 1 })}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Events Likely to Book" action={<span className="text-xs text-faint">Late-stage with an expected date</span>} />
        {likely.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-faint">Nothing in late stages with an expected date yet.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Opportunity</th><th>Stage</th><th>Expected Date</th></tr></thead>
            <tbody>
              {likely.map((o) => (
                <tr key={o.id}>
                  <td><RecordLink href={`/opportunities/${o.id}`}>{o.name}</RecordLink></td>
                  <td><Badge>{o.stage}</Badge></td>
                  <td className="text-soft">{fmtDate(o.expectedEventDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
