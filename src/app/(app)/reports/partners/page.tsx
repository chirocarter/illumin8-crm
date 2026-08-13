import { PageHeader, Card, CardHeader, DrillNumber, RecordLink, Badge } from "@/components/ui";
import { db, schema as s } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { activeCity, scopeConds } from "@/lib/scope";

export const metadata = { title: "Partner Report" };
export const dynamic = "force-dynamic";

export default async function PartnerReport() {
  // Pinned to the active city — partners and campaigns from the other market
  // don't belong in this city's workflow view.
  const city = (await activeCity())?.id ?? null;

  const partners = await db
    .select({
      id: s.partners.id, type: s.partners.partnerType, status: s.partners.status,
      name: s.accounts.name, cards: s.partners.cardsCollected, spent: s.partners.revenueSpent,
      // Outer column written out in full — a bare interpolated "id" would bind
      // to the subquery's own table and return wrong counts.
      leads: sql<number>`(select count(*) from leads where leads.partner_id = partners.id)`,
      events: sql<number>`(select count(*) from events where events.partner_id = partners.id)`,
      appts: sql<number>`(select count(*) from appointments where appointments.partner_id = partners.id)`,
      showed: sql<number>`(select count(*) from appointments where appointments.partner_id = partners.id and appointments.status = 'Showed')`,
      charged: sql<number>`(select coalesce(sum(appointments.revenue),0) from appointments where appointments.partner_id = partners.id)`,
      collected: sql<number>`(select coalesce(sum(case when appointments.collected then appointments.revenue else 0 end),0) from appointments where appointments.partner_id = partners.id)`,
    })
    .from(s.partners)
    .innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
    .where(and(...scopeConds(s.partners, { cityId: city })));

  const campaigns = await db
    .select({
      id: s.campaigns.id, name: s.campaigns.name, type: s.campaigns.type,
      leads: sql<number>`(select count(*) from leads where leads.campaign_id = campaigns.id)`,
      appts: sql<number>`(select count(*) from appointments where appointments.campaign_id = campaigns.id)`,
      collected: sql<number>`(select coalesce(sum(case when appointments.collected then appointments.revenue else 0 end),0) from appointments where appointments.campaign_id = campaigns.id)`,
    })
    .from(s.campaigns)
    .where(and(...scopeConds(s.campaigns, { cityId: city })));

  const sorted = [...partners].sort((a, b) => Number(b.appts) - Number(a.appts));
  const bestCampaigns = [...campaigns].sort((a, b) => Number(b.leads) - Number(a.leads));

  const section = (title: string, rows: typeof sorted) => (
    <Card className="mt-5">
      <CardHeader title={title} />
      {rows.length === 0 ? <p className="px-5 pb-4 text-sm text-faint">None yet.</p> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>Partner</th><th>Status</th><th className="text-right">Leads</th><th className="text-right">Events</th>
              <th className="text-right">Appointments</th><th className="text-right">Showed</th>
              <th className="text-right">Charged</th><th className="text-right">Collected</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><RecordLink href={`/partners/${p.id}`}>{p.name}</RecordLink>
                    <span className="block text-xs text-faint">{p.type}</span></td>
                  <td><Badge>{p.status}</Badge></td>
                  <td className="text-right"><DrillNumber value={Number(p.leads)} href={`/leads${qs({ partnerId: p.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(p.events)} href={`/events${qs({ partnerId: p.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(p.appts)} href={`/appointments${qs({ partnerId: p.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(p.showed)} href={`/appointments${qs({ partnerId: p.id, status: "Showed" })}`} /></td>
                  <td className="text-right text-soft">{fmtMoney(Number(p.charged))}</td>
                  <td className="text-right text-soft">{fmtMoney(Number(p.collected))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Partner Report" subtitle="Which partnerships actually produce — sorted by appointments generated" />

      {section("All Partners", sorted)}
      {section("Restaurants", sorted.filter((p) => p.type === "Restaurant Partner"))}
      {section("Gyms", sorted.filter((p) => p.type === "Gym Partner"))}

      <Card className="mt-5">
        <CardHeader title="Best-Performing Campaigns" />
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Campaign</th><th>Type</th><th className="text-right">Leads</th><th className="text-right">Appointments</th><th className="text-right">Lead → Appt</th><th className="text-right">Collected</th></tr></thead>
            <tbody>
              {bestCampaigns.map((c) => (
                <tr key={c.id}>
                  <td><RecordLink href={`/campaigns/${c.id}`}>{c.name}</RecordLink></td>
                  <td className="text-soft">{c.type}</td>
                  <td className="text-right"><DrillNumber value={Number(c.leads)} href={`/leads${qs({ campaignId: c.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(c.appts)} href={`/appointments${qs({ campaignId: c.id })}`} /></td>
                  <td className="text-right text-soft">{Number(c.leads) > 0 ? `${Math.round((Number(c.appts) / Number(c.leads)) * 100)}%` : "—"}</td>
                  <td className="text-right text-soft">{fmtMoney(Number(c.collected))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
