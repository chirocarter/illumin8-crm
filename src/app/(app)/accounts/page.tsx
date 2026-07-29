import { listAccounts, type SP } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { ACCOUNT_STATUSES, AREAS, VERTICALS } from "@/lib/taxonomy";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listAccounts(sp);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Accounts" subtitle={`${rows.length} business${rows.length === 1 ? "" : "es"}`}
        actions={<>
          <ExportLink entity="accounts" />
          <BtnLink href="/accounts/new"><Icon name="plus" className="h-4 w-4" /> New Account</BtnLink>
        </>} />

      <FilterBar searchable
        filters={[
          // multi so you can show, say, Interested + Partner Candidate together
          { name: "status", label: "Status", options: [...ACCOUNT_STATUSES], multi: true },
          { name: "vertical", label: "Vertical", options: [...VERTICALS] },
          { name: "area", label: "Area", options: [...AREAS] },
        ]}
        dateKeys={["createdFrom", "createdTo"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="building" title="No businesses match"
            hint="Adjust filters or add your first business to start building the outreach engine."
            action={<BtnLink href="/accounts/new" variant="outline">Add a business</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Business" sortKey="name" /></th>
                <th><SortHeader label="Vertical" sortKey="vertical" /></th>
                <th><SortHeader label="Area" sortKey="area" /></th>
                <th><SortHeader label="Status" sortKey="status" /></th>
                <th><SortHeader label="Relationship" sortKey="relationship" /></th>
                <th><SortHeader label="Last Contacted" sortKey="lastContacted" defaultDir="desc" /></th>
                <th><SortHeader label="Next Follow-Up" sortKey="followup" /></th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><RecordLink href={`/accounts/${a.id}`}>{a.name}</RecordLink>
                      {a.doNotContact && <span className="ml-2 text-xs font-medium text-bad">DNC</span>}</td>
                    <td className="text-soft">{a.vertical}</td>
                    <td className="text-soft">{a.area}</td>
                    <td><Badge>{a.status}</Badge></td>
                    <td><Badge>{a.relationshipStrength}</Badge></td>
                    <td className="text-soft">{fmtDate(a.lastContactedAt)}</td>
                    <td className="text-soft">{fmtDate(a.nextFollowUpAt)}</td>
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
