import { listOpportunities, type SP, spStr } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { OPPORTUNITY_STAGES, OPPORTUNITY_TYPES, VERTICALS } from "@/lib/taxonomy";
import { fmtDate, fmtMoney } from "@/lib/dates";

export const metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listOpportunities(sp);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Opportunities"
        subtitle={`${rows.length} ${spStr(sp, "stale") ? "stale " : ""}opportunit${rows.length === 1 ? "y" : "ies"}`}
        actions={<>
          <ExportLink entity="opportunities" />
          <BtnLink variant="outline" href="/pipeline">Board view</BtnLink>
          <BtnLink href="/opportunities/new"><Icon name="plus" className="h-4 w-4" /> New</BtnLink>
        </>} />

      <FilterBar
        filters={[
          { name: "stage", label: "Stage", options: [...OPPORTUNITY_STAGES] },
          { name: "type", label: "Type", options: [...OPPORTUNITY_TYPES] },
          { name: "vertical", label: "Vertical", options: [...VERTICALS] },
        ]}
        dateKeys={["createdFrom", "createdTo"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="pipeline" title="No opportunities match"
            action={<BtnLink href="/opportunities/new" variant="outline">Create one</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Opportunity" sortKey="name" /></th>
                <th><SortHeader label="Business" sortKey="business" /></th>
                <th><SortHeader label="Type" sortKey="type" /></th>
                <th><SortHeader label="Stage" sortKey="stage" /></th>
                <th><SortHeader label="Event Date" sortKey="eventDate" /></th>
                <th><SortHeader label="Next Follow-Up" sortKey="followup" /></th>
              </tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><RecordLink href={`/opportunities/${o.id}`}>{o.name}</RecordLink></td>
                    <td>{o.accountId ? <RecordLink href={`/accounts/${o.accountId}`} muted>{o.accountName}</RecordLink> : <span className="text-faint">—</span>}</td>
                    <td className="text-soft">{o.type}</td>
                    <td><Badge>{o.stage}</Badge></td>
                    <td className="text-soft">{fmtDate(o.expectedEventDate)}</td>
                    <td className="text-soft">{fmtDate(o.nextFollowUpAt)}</td>
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
