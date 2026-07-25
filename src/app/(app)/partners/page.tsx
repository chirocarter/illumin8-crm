import { db, schema as s } from "@/db";
import { eq, count, sql } from "drizzle-orm";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/dates";
import { todayISO } from "@/lib/dates";
import { cityWhere } from "@/lib/scope";

export const metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const rows = await db
    .select({
      id: s.partners.id, partnerType: s.partners.partnerType, status: s.partners.status,
      dropBoxActive: s.partners.dropBoxActive, dropBoxStatus: s.partners.dropBoxStatus,
      nextPickupDueAt: s.partners.nextPickupDueAt, cardsCollected: s.partners.cardsCollected,
      accountId: s.partners.accountId, accountName: s.accounts.name, vertical: s.accounts.vertical,
      // Outer column written out in full — a bare interpolated "id" would bind
      // to the subquery's own table and return wrong counts.
      leadCount: sql<number>`(select count(*) from leads where leads.partner_id = partners.id)`,
      apptCount: sql<number>`(select count(*) from appointments where appointments.partner_id = partners.id)`,
      eventCount: sql<number>`(select count(*) from events where events.partner_id = partners.id)`,
    })
    .from(s.partners)
    .innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
    .where(await cityWhere(s.partners.cityId));

  const today = todayISO();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Partners" subtitle={`${rows.length} community partner${rows.length === 1 ? "" : "s"}`}
        actions={<BtnLink href="/partners/new"><Icon name="plus" className="h-4 w-4" /> New Partner</BtnLink>} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="handshake" title="No partners yet"
            hint="Turn your best accounts into partners — restaurants with drop boxes, gyms with screening days."
            action={<BtnLink href="/partners/new" variant="outline">Add a partner</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>Partner</th><th>Type</th><th>Status</th><th>Drop Box</th>
                <th>Leads</th><th>Events</th><th>Appointments</th>
              </tr></thead>
              <tbody>
                {rows.map((p) => {
                  const pickupDue = p.dropBoxActive && p.nextPickupDueAt && p.nextPickupDueAt <= today;
                  return (
                    <tr key={p.id}>
                      <td><RecordLink href={`/partners/${p.id}`}>{p.accountName}</RecordLink>
                        <span className="block text-xs text-faint">{p.vertical}</span></td>
                      <td className="text-soft">{p.partnerType}</td>
                      <td><Badge>{p.status}</Badge></td>
                      <td>{p.dropBoxActive
                        ? <span className={`text-xs font-medium ${pickupDue ? "text-bad" : "text-soft"}`}>
                            {pickupDue ? `Pickup due ${fmtDate(p.nextPickupDueAt)}` : (p.dropBoxStatus ?? "Active")} · {p.cardsCollected} cards
                          </span>
                        : <span className="text-faint">—</span>}</td>
                      <td><RecordLink href={`/leads?partnerId=${p.id}`}>{p.leadCount}</RecordLink></td>
                      <td><RecordLink href={`/events?partnerId=${p.id}`}>{p.eventCount}</RecordLink></td>
                      <td><RecordLink href={`/appointments?partnerId=${p.id}`}>{p.apptCount}</RecordLink></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
