import { listAppointments, type SP } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { APPOINTMENT_STATUSES } from "@/lib/taxonomy";
import { fmtDateTime, fmtMoney } from "@/lib/dates";

export const metadata = { title: "Appointments" };
export const dynamic = "force-dynamic";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listAppointments(sp);
  const charged = rows.reduce((sum, r) => sum + r.revenue, 0);
  const collected = rows.reduce((sum, r) => sum + (r.collected ? r.revenue : 0), 0);
  const showed = rows.filter((r) => r.status === "Showed").length;
  const decided = rows.filter((r) => ["Showed", "No-Show"].includes(r.status)).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Appointments"
        subtitle={`${rows.length} shown · ${decided > 0 ? `${Math.round((showed / decided) * 100)}% show rate · ` : ""}${fmtMoney(collected)} collected of ${fmtMoney(charged)} charged`}
        actions={<>
          <ExportLink entity="appointments" />
          <BtnLink href="/appointments/new"><Icon name="plus" className="h-4 w-4" /> New Appointment</BtnLink>
        </>} />

      <FilterBar
        filters={[{ name: "status", label: "Status", options: [...APPOINTMENT_STATUSES] }]}
        dateKeys={["from", "to"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="clock" title="No appointments match"
            hint="Track every outreach-generated appointment here to prove what the engine produces."
            action={<BtnLink href="/appointments/new" variant="outline">Add an appointment</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Person" sortKey="person" /></th>
                <th><SortHeader label="Scheduled" sortKey="scheduled" defaultDir="desc" /></th>
                <th><SortHeader label="Status" sortKey="status" /></th>
                <th><SortHeader label="Source" sortKey="source" /></th>
                <th>Campaign / Event</th>
                <th><SortHeader label="Location" sortKey="location" /></th>
                <th><SortHeader label="Charged" sortKey="charged" defaultDir="desc" /></th>
                <th><SortHeader label="Collected" sortKey="collected" defaultDir="desc" /></th>
                <th></th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.leadId
                      ? <RecordLink href={`/leads/${a.leadId}`}>{a.personName || "—"}</RecordLink>
                      : <span className="font-medium">{a.personName || "—"}</span>}</td>
                    <td className="whitespace-nowrap text-soft">{fmtDateTime(a.scheduledAt)}</td>
                    <td><Badge>{a.status}</Badge></td>
                    <td className="text-soft">{a.source ?? "—"}</td>
                    <td>
                      {a.campaignId && <RecordLink href={`/campaigns/${a.campaignId}`} muted>{a.campaignName}</RecordLink>}
                      {a.campaignId && a.eventId && <span className="text-faint"> · </span>}
                      {a.eventId && <RecordLink href={`/events/${a.eventId}`} muted>{a.eventName}</RecordLink>}
                      {!a.campaignId && !a.eventId && <span className="text-faint">—</span>}
                    </td>
                    <td className="text-soft">{a.locationName ?? "—"}</td>
                    <td className="text-soft">{a.revenue ? fmtMoney(a.revenue) : "—"}</td>
                    <td>{a.revenue
                      ? (a.collected
                          ? <span className="font-medium text-good">{fmtMoney(a.revenue)}</span>
                          : <span className="text-xs font-medium text-warn">Not yet</span>)
                      : <span className="text-faint">—</span>}</td>
                    <td><RecordLink href={`/appointments/${a.id}/edit`} muted>Edit</RecordLink></td>
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
