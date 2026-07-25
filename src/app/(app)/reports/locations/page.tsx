import { PageHeader, Card, CardHeader, DrillNumber } from "@/components/ui";
import { db, schema as s } from "@/db";
import { sql } from "drizzle-orm";
import { AREAS } from "@/lib/taxonomy";
import { fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { activeCity, cityWhere } from "@/lib/scope";

export const metadata = { title: "Location Report" };
export const dynamic = "force-dynamic";

export default async function LocationReport() {
  // Pinned to the active city — clinics belong to one market, and the area
  // breakdown counts only that city's businesses.
  const city = (await activeCity())?.id ?? null;
  const cityAcct = city ? sql` and accounts.city_id = ${city}` : sql``;

  // By clinic location (assignment) — accounts, open opps, events, appointments, revenue
  const clinics = await db
    .select({
      id: s.locations.id,
      name: s.locations.name,
      // Outer column written out in full — a bare interpolated "id" would bind
      // to the subquery's own table and return wrong counts.
      accounts: sql<number>`(select count(*) from accounts where accounts.clinic_location_id = locations.id)`,
      opps: sql<number>`(select count(*) from opportunities where opportunities.clinic_location_id = locations.id)`,
      events: sql<number>`(select count(*) from events where events.clinic_location_id = locations.id)`,
      appts: sql<number>`(select count(*) from appointments where appointments.location_id = locations.id)`,
      charged: sql<number>`(select coalesce(sum(appointments.revenue),0) from appointments where appointments.location_id = locations.id)`,
      collected: sql<number>`(select coalesce(sum(case when appointments.collected then appointments.revenue else 0 end),0) from appointments where appointments.location_id = locations.id)`,
    })
    .from(s.locations)
    .where(await cityWhere(s.locations.cityId));

  // By business area (where the business physically is)
  const areas = await Promise.all(
    AREAS.map(async (area) => {
      const [row] = await db.all<{ accounts: number; leads: number }>(sql`
        select
          (select count(*) from accounts where accounts.area = ${area}${cityAcct}) as accounts,
          (select count(*) from leads join accounts on leads.account_id = accounts.id where accounts.area = ${area}${cityAcct}) as leads
      `);
      return { area, ...row };
    })
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Location Report" subtitle="Performance by Illumin8 clinic assignment and by business area" />

      <Card>
        <CardHeader title="By Illumin8 Clinic" />
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th>Clinic</th><th className="text-right">Accounts</th><th className="text-right">Opportunities</th>
              <th className="text-right">Events</th><th className="text-right">Appointments</th>
              <th className="text-right">Charged</th><th className="text-right">Collected</th>
            </tr></thead>
            <tbody>
              {clinics.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.name}</td>
                  <td className="text-right"><DrillNumber value={Number(l.accounts)} href={`/accounts${qs({ locationId: l.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(l.opps)} href={`/opportunities${qs({ locationId: l.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(l.events)} href={`/events${qs({ locationId: l.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(l.appts)} href={`/appointments${qs({ locationId: l.id })}`} /></td>
                  <td className="text-right text-soft">{fmtMoney(Number(l.charged))}</td>
                  <td className="text-right text-soft">{fmtMoney(Number(l.collected))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader title="By Business Area" />
        <table className="tbl">
          <thead><tr><th>Area</th><th className="text-right">Businesses</th><th className="text-right">Leads via those businesses</th></tr></thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.area}>
                <td className="font-medium">{a.area}</td>
                <td className="text-right"><DrillNumber value={Number(a.accounts)} href={`/accounts${qs({ area: a.area })}`} /></td>
                <td className="text-right text-soft">{Number(a.leads)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
