import { PageHeader, Card, CardHeader, DrillNumber } from "@/components/ui";
import RangeNav from "@/components/RangeNav";
import { db, schema as s } from "@/db";
import { and, count, gte, isNotNull, lt, sql } from "drizzle-orm";
import { rangeFromSP, fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { activeCity, scopeConds } from "@/lib/scope";
import type { SP } from "@/lib/lists";

export const metadata = { title: "Source Attribution Report" };
export const dynamic = "force-dynamic";

export default async function SourceReport({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeFromSP(sp);

  const city = (await activeCity())?.id ?? null;
  // Keeps the campaign-type subqueries in the same city as the rows they roll up.
  const cityC2 = city ? sql` and c2.city_id = ${city}` : sql``;

  const [leadsBySource, apptsBySource, campaignTypes] = await Promise.all([
    db.select({ k: s.leads.source, c: count() }).from(s.leads)
      .where(and(gte(s.leads.createdAt, from), lt(s.leads.createdAt, to + "T99"), isNotNull(s.leads.source), ...scopeConds(s.leads, { cityId: city })))
      .groupBy(s.leads.source),
    db.select({
      k: s.appointments.source, c: count(),
      charged: sql<number>`coalesce(sum(${s.appointments.revenue}),0)`,
      collected: sql<number>`coalesce(sum(case when ${s.appointments.collected} then ${s.appointments.revenue} else 0 end),0)`,
    })
      .from(s.appointments)
      .where(and(gte(s.appointments.createdAt, from), lt(s.appointments.createdAt, to + "T99"), isNotNull(s.appointments.source), ...scopeConds(s.appointments, { cityId: city })))
      .groupBy(s.appointments.source),
    // All-time: which campaign types generate leads & appointments.
    // The outer column is written out in full (`campaigns.type`): interpolating
    // ${s.campaigns.type} renders a bare "type" that binds to c2 instead,
    // making the condition always true and counting every campaign's leads.
    db.select({
      k: s.campaigns.type,
      leads: sql<number>`(select count(*) from leads where leads.campaign_id in (select id from campaigns c2 where c2.type = campaigns.type${cityC2}))`,
      appts: sql<number>`(select count(*) from appointments where appointments.campaign_id in (select id from campaigns c2 where c2.type = campaigns.type${cityC2}))`,
    }).from(s.campaigns).where(and(...scopeConds(s.campaigns, { cityId: city }))).groupBy(s.campaigns.type),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Source Attribution" subtitle="Where leads and appointments actually come from" />
      <RangeNav basePath="/reports/sources" from={from} to={to} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Leads by Source (in range)" />
          {leadsBySource.length === 0 ? <p className="px-5 pb-4 text-sm text-faint">No leads in this range.</p> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Source</th><th className="text-right">Leads</th></tr></thead>
                <tbody>
                  {leadsBySource.map((r) => (
                    <tr key={r.k}>
                      <td className="text-soft">{r.k}</td>
                      <td className="text-right"><DrillNumber value={Number(r.c)} href={`/leads${qs({ source: r.k, from, to })}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Appointments by Source (booked in range)" />
          {apptsBySource.length === 0 ? <p className="px-5 pb-4 text-sm text-faint">No appointments booked in this range.</p> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Source</th><th className="text-right">Appointments</th><th className="text-right">Charged</th><th className="text-right">Collected</th></tr></thead>
                <tbody>
                  {apptsBySource.map((r) => (
                    <tr key={r.k}>
                      <td className="text-soft">{r.k}</td>
                      <td className="text-right"><DrillNumber value={Number(r.c)} href={`/appointments${qs({ source: r.k, cfrom: from, cto: to })}`} /></td>
                      <td className="text-right text-soft">{fmtMoney(Number(r.charged))}</td>
                      <td className="text-right text-soft">{fmtMoney(Number(r.collected))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Campaign Types — All Time" />
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Campaign type</th><th className="text-right">Leads</th><th className="text-right">Appointments</th></tr></thead>
            <tbody>
              {campaignTypes.map((r) => (
                <tr key={r.k}>
                  <td className="text-soft">{r.k}</td>
                  <td className="text-right">{Number(r.leads)}</td>
                  <td className="text-right">{Number(r.appts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 text-xs text-faint">Totals across all campaigns of each type. Open a campaign for its full funnel.</p>
      </Card>
    </div>
  );
}
