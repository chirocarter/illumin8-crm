import { PageHeader, Card, CardHeader, DrillNumber } from "@/components/ui";
import RangeNav from "@/components/RangeNav";
import { metricValues, qs } from "@/lib/metrics";
import { rangeFromSP, fmtMoney } from "@/lib/dates";
import { activeCity } from "@/lib/scope";
import type { SP } from "@/lib/lists";

export const metadata = { title: "Weekly Outcome Report" };
export const dynamic = "force-dynamic";

export default async function OutcomeReport({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeFromSP(sp);
  const m = await metricValues(from, to, { cityId: (await activeCity())?.id ?? null });

  const leads = m.new_leads.value;
  const appts = m.appointments_booked.value;
  const showed = m.appointments_showed.value;
  const noShows = m.no_shows.value;
  const decided = showed + noShows;
  const screenings = m.screenings_completed.value;

  const rows = [
    m.new_leads, m.screenings_completed, m.appointments_booked, m.appointments_showed, m.no_shows,
  ];

  const charged = m.money_charged.value;
  const collected = m.money_collected.value;
  const rates: { label: string; value: string; href: string }[] = [
    { label: "Lead → Appointment booked", value: leads > 0 ? `${Math.round((appts / leads) * 100)}%` : "—", href: m.appointments_booked.href },
    { label: "Show rate (of decided)", value: decided > 0 ? `${Math.round((showed / decided) * 100)}%` : "—", href: m.appointments_showed.href },
    { label: "Screening → Appointment", value: screenings > 0 ? `${Math.round((appts / screenings) * 100)}%` : "—", href: m.appointments_booked.href },
    { label: "Collected / charged", value: charged > 0 ? `${Math.round((collected / charged) * 100)}%` : "—", href: m.money_collected.href },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Weekly Outcome Report" subtitle="What the outreach engine produced"
        actions={<a href={`/api/export?entity=appointments${qs({ cfrom: from, cto: to }).replace("?", "&")}`}
          className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-hairline">Export appointments CSV</a>} />
      <RangeNav basePath="/reports/outcomes" from={from} to={to} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Outcomes" />
          <table className="tbl">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="text-soft">{r.label}</td>
                  <td className="text-right"><DrillNumber value={r.value} href={r.href} /></td>
                </tr>
              ))}
              <tr>
                <td className="text-soft">Money charged (appointments booked in range)</td>
                <td className="text-right"><DrillNumber value={fmtMoney(m.money_charged.value)} href={m.money_charged.href} /></td>
              </tr>
              <tr>
                <td className="text-soft">Money collected</td>
                <td className="text-right"><DrillNumber value={fmtMoney(m.money_collected.value)} href={m.money_collected.href} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card>
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
          <p className="px-5 pb-4 text-xs text-faint">
            Rates are computed from the raw counts above — click any rate to inspect the records it's based on.
          </p>
        </Card>
      </div>
    </div>
  );
}
