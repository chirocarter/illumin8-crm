import { listContacts, type SP } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { CONTACT_TYPES } from "@/lib/taxonomy";
import { fmtDate } from "@/lib/dates";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listContacts(sp);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Contacts" subtitle={`${rows.length} ${rows.length === 1 ? "person" : "people"}`}
        actions={<>
          <ExportLink entity="contacts" />
          <BtnLink href="/contacts/new"><Icon name="plus" className="h-4 w-4" /> New Contact</BtnLink>
        </>} />

      <FilterBar searchable
        filters={[{ name: "contactType", label: "Type", options: [...CONTACT_TYPES] }]}
        dateKeys={["createdFrom", "createdTo"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="users" title="No contacts match"
            action={<BtnLink href="/contacts/new" variant="outline">Add a contact</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Name" sortKey="name" /></th>
                <th><SortHeader label="Business" sortKey="business" /></th>
                <th><SortHeader label="Type" sortKey="type" /></th>
                <th><SortHeader label="Influence" sortKey="influence" /></th>
                <th><SortHeader label="Phone" sortKey="phone" /></th>
                <th><SortHeader label="Next Follow-Up" sortKey="followup" defaultDir="asc" /></th>
              </tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><RecordLink href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</RecordLink>
                      {c.title && <span className="block text-xs text-faint">{c.title}</span>}</td>
                    <td>{c.accountId ? <RecordLink href={`/accounts/${c.accountId}`} muted>{c.accountName}</RecordLink> : <span className="text-faint">—</span>}</td>
                    <td className="text-soft">{c.contactType}</td>
                    <td><Badge>{c.influenceLevel}</Badge></td>
                    <td className="text-soft">{c.phone ?? "—"}</td>
                    <td className="text-soft">{fmtDate(c.nextFollowUpAt)}</td>
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
