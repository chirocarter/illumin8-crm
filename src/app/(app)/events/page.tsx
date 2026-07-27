import Link from "next/link";
import { listEvents, type SP, spStr } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink, pillSm } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import SortHeader from "@/components/SortHeader";
import ExportLink from "@/components/ExportLink";
import { Icon } from "@/components/icons";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/taxonomy";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const rows = await listEvents(sp);
  const held = spStr(sp, "heldFrom") || spStr(sp, "heldTo");
  const booked = spStr(sp, "bookedFrom") || spStr(sp, "bookedTo");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Events"
        subtitle={`${rows.length} event${rows.length === 1 ? "" : "s"}${held ? " held in range" : booked ? " booked in range" : ""}`}
        actions={<>
          <ExportLink entity="events" />
          <BtnLink href="/events/new"><Icon name="plus" className="h-4 w-4" /> New Event</BtnLink>
        </>} />

      <div className="mb-3 flex flex-wrap gap-2">
        <Link href="/events" className={!spStr(sp, "needsOutcome") && !spStr(sp, "upcoming") ? pillSm + " pill-active" : pillSm}>All</Link>
        <Link href="/events?upcoming=1" className={spStr(sp, "upcoming") ? pillSm + " pill-active" : pillSm}>Upcoming</Link>
        <Link href="/events?needsOutcome=1" className={spStr(sp, "needsOutcome") ? pillSm + " pill-active" : pillSm + " !text-accent-deep"}>
          Needs outcomes
        </Link>
      </div>

      <FilterBar
        filters={[
          { name: "status", label: "Status", options: [...EVENT_STATUSES] },
          { name: "type", label: "Type", options: [...EVENT_TYPES] },
        ]}
        dateKeys={["from", "to"]} />

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="calendar" title="No events match"
            hint="Six events a week is the target — book the next one from your pipeline."
            action={<BtnLink href="/events/new" variant="outline">Create an event</BtnLink>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th><SortHeader label="Event" sortKey="name" /></th>
                <th><SortHeader label="Type" sortKey="type" /></th>
                <th><SortHeader label="Host" sortKey="host" /></th>
                <th><SortHeader label="Date" sortKey="date" defaultDir="desc" /></th>
                <th><SortHeader label="Status" sortKey="status" /></th>
                <th><SortHeader label="Attendees" sortKey="attendees" defaultDir="desc" /></th>
                <th><SortHeader label="Screenings" sortKey="screenings" defaultDir="desc" /></th>
              </tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><RecordLink href={`/events/${e.id}`}>{e.name}</RecordLink></td>
                    <td className="text-soft">{e.type}</td>
                    <td>{e.accountId ? <RecordLink href={`/accounts/${e.accountId}`} muted>{e.accountName}</RecordLink> : <span className="text-faint">—</span>}</td>
                    <td className="whitespace-nowrap text-soft">{fmtDateTime(e.startsAt)}</td>
                    <td><Badge>{e.status}</Badge></td>
                    <td className="text-soft">{e.actualAttendees || e.expectedAttendees || "—"}</td>
                    <td className="text-soft">{e.screeningsCompleted || "—"}</td>
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
