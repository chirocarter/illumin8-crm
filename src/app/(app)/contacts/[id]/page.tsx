import Link from "next/link";
import RecordActions from "@/components/RecordActions";
import type { SP } from "@/lib/lists";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, EmptyState } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function ContactDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { id: idStr } = await params;
  const id = Number(idStr);
  const contact = await authorize(await db.query.contacts.findFirst({ where: eq(s.contacts.id, id) }));
  if (!contact) notFound();

  const [account, activities, opportunities, events, tasks, appointments] = await Promise.all([
    contact.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, contact.accountId) }) : null,
    db.query.activities.findMany({ where: eq(s.activities.contactId, id), orderBy: [desc(s.activities.occurredAt)], limit: 20 }),
    db.query.opportunities.findMany({ where: eq(s.opportunities.contactId, id), orderBy: [desc(s.opportunities.createdAt)] }),
    db.query.events.findMany({ where: eq(s.events.contactId, id), orderBy: [desc(s.events.startsAt)] }),
    db.query.tasks.findMany({ where: and(eq(s.tasks.contactId, id), eq(s.tasks.status, "Open")), orderBy: [s.tasks.dueDate] }),
    db.query.appointments.findMany({ where: eq(s.appointments.contactId, id) }),
  ]);

  const info: [string, React.ReactNode][] = [
    ["Business", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
    ["Title", contact.title ?? "—"],
    ["Type", contact.contactType],
    // A contact with no direct number falls back to the business main line, so
    // there is always something to dial. Labelled, because showing the business
    // number bare would read as this person's cell and get saved as one.
    ["Phone", contact.phone ? formatPhone(contact.phone)
      : account?.phone ? (
        <span key="phone">
          {formatPhone(account.phone)}
          <span className="mt-0.5 block text-xs font-normal text-faint">
            Main line at <RecordLink href={`/accounts/${account.id}`} muted>{account.name}</RecordLink> — no direct number on file
          </span>
        </span>
      ) : "—"],
    ["Email", contact.email ?? "—"],
    ["Prefers", contact.preferredMethod ?? "—"],
    ["Influence", contact.influenceLevel],
    ["Source", contact.source ?? "—"],
    ["Last contacted", fmtDate(contact.lastContactedAt)],
    ["Next follow-up", fmtDate(contact.nextFollowUpAt)],
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle={<span className="flex items-center gap-2"><Badge>{contact.relationshipStatus}</Badge>
          {contact.title && <span className="text-soft">{contact.title}{account ? ` · ${account.name}` : ""}</span>}</span>}
        actions={<>
          <BtnLink variant="outline" href={`/contacts/${id}/edit`}>Edit</BtnLink>
          <BtnLink variant="outline" href={`/tasks/new${qs({ contactId: id, accountId: contact.accountId })}`}>New Task</BtnLink>
          <BtnLink href={`/activities/new${qs({ contactId: id, accountId: contact.accountId })}`}>Log Activity</BtnLink>
        </>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {opportunities.length > 0 && (
            <Card>
              <CardHeader title="Opportunities" />
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Stage</th><th>Type</th></tr></thead>
                  <tbody>{opportunities.map((o) => (
                    <tr key={o.id}>
                      <td><RecordLink href={`/opportunities/${o.id}`}>{o.name}</RecordLink></td>
                      <td><Badge>{o.stage}</Badge></td>
                      <td className="text-soft">{o.type}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {events.length > 0 && (
            <Card>
              <CardHeader title="Events" />
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Event</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>{events.map((e) => (
                    <tr key={e.id}>
                      <td><RecordLink href={`/events/${e.id}`}>{e.name}</RecordLink></td>
                      <td className="text-soft">{fmtDateTime(e.startsAt)}</td>
                      <td><Badge>{e.status}</Badge></td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {appointments.length > 0 && (
            <Card>
              <CardHeader title="Appointments" />
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>When</th><th>Status</th><th>Charged</th><th>Collected?</th></tr></thead>
                  <tbody>{appointments.map((a) => (
                    <tr key={a.id}>
                      <td><RecordLink href={`/appointments${qs({ leadId: a.leadId })}`}>{fmtDateTime(a.scheduledAt)}</RecordLink></td>
                      <td><Badge>{a.status}</Badge></td>
                      <td className="text-soft">{a.revenue ? fmtMoney(a.revenue) : "—"}</td>
                      <td>{a.revenue ? (a.collected ? <span className="font-medium text-good">Yes</span> : <span className="text-warn">Not yet</span>) : <span className="text-faint">—</span>}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity Timeline" action={
              <Link href={`/activities${qs({ contactId: id })}`} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>} />
            {activities.length === 0 ? (
              <EmptyState icon="bolt" title="No activity with this person yet"
                action={<BtnLink variant="outline" href={`/activities/new${qs({ contactId: id, accountId: contact.accountId })}`}>Log the first touch</BtnLink>} />
            ) : (
              <ul className="px-5 pb-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative border-l border-line py-2.5 pl-5">
                    <span className="absolute -left-[5px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
                    <p className="text-sm"><span className="font-medium">{a.type}</span>
                      {a.outcome && <> · <Badge>{a.outcome}</Badge></>}
                      <span className="ml-2 text-xs text-faint">{fmtDateTime(a.occurredAt)}</span></p>
                    {a.notes && <p className="mt-0.5 text-sm text-soft">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Contact Info" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {contact.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{contact.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Open Tasks" action={
              <Link href={`/tasks/new${qs({ contactId: id, accountId: contact.accountId })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
            {tasks.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">Nothing pending.</p>
            ) : (
              <ul className="px-2 pb-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-hairline">
                      <span className="block text-sm font-medium">{t.title}</span>
                      <span className="block text-xs text-soft">Due {fmtDate(t.dueDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RecordActions kind="contact" id={id} name={`${contact.firstName} ${contact.lastName}`.trim()} sp={sp} />
    </div>
  );
}
