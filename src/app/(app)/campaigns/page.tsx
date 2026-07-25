import { db, schema as s } from "@/db";
import { eq, sql } from "drizzle-orm";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/dates";
import { cityWhere } from "@/lib/scope";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const rows = await db
    .select({
      id: s.campaigns.id, name: s.campaigns.name, type: s.campaigns.type,
      status: s.campaigns.status, startDate: s.campaigns.startDate, offer: s.campaigns.offer,
      accountId: s.campaigns.accountId, accountName: s.accounts.name,
      // Outer column written out in full — a bare interpolated "id" would bind
      // to the subquery's own table and return wrong counts.
      leadCount: sql<number>`(select count(*) from leads where leads.campaign_id = campaigns.id)`,
      apptCount: sql<number>`(select count(*) from appointments where appointments.campaign_id = campaigns.id)`,
      eventCount: sql<number>`(select count(*) from events where events.campaign_id = campaigns.id)`,
    })
    .from(s.campaigns)
    .leftJoin(s.accounts, eq(s.campaigns.accountId, s.accounts.id))
    .where(await cityWhere(s.campaigns.cityId));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Campaigns" subtitle={`${rows.length} campaign${rows.length === 1 ? "" : "s"}`}
        actions={<BtnLink href="/campaigns/new"><Icon name="plus" className="h-4 w-4" /> New Campaign</BtnLink>} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="megaphone" title="No campaigns yet"
            hint="Create a drop box, flyer, or QR campaign so every lead traces back to its source."
            action={<BtnLink href="/campaigns/new" variant="outline">Create a campaign</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Campaign</th><th>Type</th><th>Partner / Account</th><th>Status</th>
                <th>Started</th><th>Leads</th><th>Events</th><th>Appointments</th>
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><RecordLink href={`/campaigns/${c.id}`}>{c.name}</RecordLink>
                      {c.offer && <span className="block max-w-[220px] truncate text-xs text-faint">{c.offer}</span>}</td>
                    <td className="text-soft">{c.type}</td>
                    <td>{c.accountId ? <RecordLink href={`/accounts/${c.accountId}`} muted>{c.accountName}</RecordLink> : <span className="text-faint">—</span>}</td>
                    <td><Badge>{c.status}</Badge></td>
                    <td className="text-soft">{fmtDate(c.startDate)}</td>
                    <td><RecordLink href={`/leads?campaignId=${c.id}`}>{c.leadCount}</RecordLink></td>
                    <td><RecordLink href={`/events?campaignId=${c.id}`}>{c.eventCount}</RecordLink></td>
                    <td><RecordLink href={`/appointments?campaignId=${c.id}`}>{c.apptCount}</RecordLink></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
