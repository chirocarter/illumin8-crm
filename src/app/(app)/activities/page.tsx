import { listActivities, type SP, spStr } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { ACTIVITY_OUTCOMES, ACTIVITY_TYPES } from "@/lib/taxonomy";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Activities" };
export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<string, string> = {
  contact: "business-contact activities",
  inperson: "in-person activities",
  phone: "phone activities",
};

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listActivities(sp);
  const group = spStr(sp, "typeGroup");
  const outcomeGroup = spStr(sp, "outcomeGroup");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Activities"
        subtitle={`${rows.length} ${group ? GROUP_LABEL[group] ?? "activities" : outcomeGroup === "partnership" ? "partnership conversations" : "activities"}`}
        actions={<>
          <ExportLink entity="activities" />
          <BtnLink href="/activities/new"><Icon name="plus" className="h-4 w-4" /> Log Activity</BtnLink>
        </>} />

      <FilterBar
        filters={[
          { name: "type", label: "Type", options: [...ACTIVITY_TYPES] },
          { name: "outcome", label: "Outcome", options: [...ACTIVITY_OUTCOMES] },
        ]}
        dateKeys={["from", "to"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="bolt" title="No activities match"
            hint="Every call, visit, and drop box pickup you log builds your proof of work."
            action={<BtnLink href="/activities/new" variant="outline">Log an activity</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="When" sortKey="when" defaultDir="desc" /></th>
                <th><SortHeader label="Type" sortKey="type" /></th>
                <th><SortHeader label="Outcome" sortKey="outcome" /></th>
                <th><SortHeader label="Business" sortKey="business" /></th>
                <th><SortHeader label="Contact" sortKey="contact" /></th>
                <th>Notes</th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-soft">{fmtDateTime(a.occurredAt)}</td>
                    <td className="font-medium">{a.type}</td>
                    <td>{a.outcome ? <Badge>{a.outcome}</Badge> : <span className="text-faint">—</span>}</td>
                    <td>{a.accountId ? <RecordLink href={`/accounts/${a.accountId}`}>{a.accountName}</RecordLink> : <span className="text-faint">—</span>}</td>
                    <td>
                      {a.contactId ? <RecordLink href={`/contacts/${a.contactId}`} muted>{a.contactFirst} {a.contactLast}</RecordLink>
                        : a.leadId ? <RecordLink href={`/leads/${a.leadId}`} muted>{a.leadFirst} {a.leadLast} <span className="text-xs text-accent-deep">(lead)</span></RecordLink>
                        : <span className="text-faint">—</span>}
                    </td>
                    <td className="max-w-sm truncate text-soft">{a.notes ?? "—"}</td>
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
