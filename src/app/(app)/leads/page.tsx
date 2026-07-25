import { listLeads, type SP } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { INTEREST_LEVELS, LEAD_APPT_STATUSES, LEAD_SOURCES } from "@/lib/taxonomy";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listLeads(sp);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Leads" subtitle={`${rows.length} lead${rows.length === 1 ? "" : "s"}`}
        actions={<>
          <ExportLink entity="leads" />
          <BtnLink href="/leads/new"><Icon name="plus" className="h-4 w-4" /> New Lead</BtnLink>
        </>} />

      <FilterBar
        filters={[
          { name: "apptStatus", label: "Appt Status", options: [...LEAD_APPT_STATUSES] },
          { name: "interest", label: "Interest", options: [...INTEREST_LEVELS] },
          { name: "source", label: "Source", options: [...LEAD_SOURCES] },
        ]}
        dateKeys={["from", "to"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="sparkle" title="No leads match"
            hint="Leads come from drop boxes, events, screenings, and QR scans — every one traces back to its source."
            action={<BtnLink href="/leads/new" variant="outline">Add a lead</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Name" sortKey="name" /></th>
                <th><SortHeader label="Source" sortKey="source" /></th>
                <th>Campaign / Event</th>
                <th><SortHeader label="Interest" sortKey="interest" /></th>
                <th><SortHeader label="Appt Status" sortKey="apptStatus" /></th>
                <th><SortHeader label="Phone" sortKey="phone" /></th>
                <th><SortHeader label="Added" sortKey="added" defaultDir="desc" /></th>
              </tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td><RecordLink href={`/leads/${l.id}`}>{l.firstName} {l.lastName}</RecordLink></td>
                    <td className="text-soft">{l.source ?? "—"}</td>
                    <td>
                      {l.campaignId && <RecordLink href={`/campaigns/${l.campaignId}`} muted>{l.campaignName}</RecordLink>}
                      {l.campaignId && l.eventId && <span className="text-faint"> · </span>}
                      {l.eventId && <RecordLink href={`/events/${l.eventId}`} muted>{l.eventName}</RecordLink>}
                      {!l.campaignId && !l.eventId && <span className="text-faint">—</span>}
                    </td>
                    <td><Badge>{l.interestLevel}</Badge></td>
                    <td><Badge>{l.apptStatus}</Badge></td>
                    <td className="text-soft">{l.phone ?? "—"}</td>
                    <td className="text-soft">{fmtDate(l.createdAt)}</td>
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
