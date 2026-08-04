// A task in context: what it's about, who it concerns, what's already been
// said, and a way to finish it — so clicking a task on the calendar answers
// "what is this?" without opening the edit form.
import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, desc, eq, or } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, EmptyState, Btn } from "@/components/ui";
import { setTaskStatus } from "@/app/actions";
import { authorize } from "@/lib/scope";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const dynamic = "force-dynamic";

export default async function TaskDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  const task = await authorize(await db.query.tasks.findFirst({ where: eq(s.tasks.id, id) }));

  // Where "Done" and "Back" should return to — the calendar sends ?from=
  const from = spStr(sp, "from");
  const backHref = from === "calendar" ? "/calendar" : from === "home" ? "/" : "/tasks";
  const backLabel = from === "calendar" ? "Back to calendar" : from === "home" ? "Back to Command Center" : "All tasks";

  const [account, contact, opportunity, event, project, history, leads] = await Promise.all([
    task.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, task.accountId) }) : null,
    task.contactId ? db.query.contacts.findFirst({ where: eq(s.contacts.id, task.contactId) }) : null,
    task.opportunityId ? db.query.opportunities.findFirst({ where: eq(s.opportunities.id, task.opportunityId) }) : null,
    task.eventId ? db.query.events.findFirst({ where: eq(s.events.id, task.eventId) }) : null,
    task.projectId ? db.query.projects.findFirst({ where: eq(s.projects.id, task.projectId) }) : null,

    // Everything already said to this person / business, newest first.
    task.contactId || task.accountId
      ? db.query.activities.findMany({
          where: or(
            ...(task.contactId ? [eq(s.activities.contactId, task.contactId)] : []),
            ...(task.accountId ? [eq(s.activities.accountId, task.accountId)] : []),
          ),
          orderBy: [desc(s.activities.occurredAt)],
          limit: 12,
        })
      : [],

    task.accountId
      ? db.query.leads.findMany({ where: eq(s.leads.accountId, task.accountId), orderBy: [desc(s.leads.createdAt)], limit: 8 })
      : [],
  ]);

  const isOpen = task.status === "Open";
  const overdue = isOpen && !!task.dueDate && task.dueDate < todayISO();
  const who = contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{task.status}</Badge>
            {task.dueDate && (
              <span className={overdue ? "font-medium text-bad" : "text-soft"}>
                Due {fmtDate(task.dueDate)}{overdue ? " · overdue" : ""}
              </span>
            )}
            {task.completedAt && <span className="text-soft">Completed {fmtDate(task.completedAt)}</span>}
          </span>
        }
        actions={<>
          <BtnLink variant="outline" href={backHref}>{backLabel}</BtnLink>
          <BtnLink variant="outline" href={`/tasks/${id}/edit`}>Edit</BtnLink>
          {/* Finish it here — no need to open the edit form */}
          <form action={setTaskStatus}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={isOpen ? "Completed" : "Open"} />
            <input type="hidden" name="returnTo" value={backHref} />
            <Btn type="submit">{isOpen ? "Mark complete" : "Reopen"}</Btn>
          </form>
        </>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Past communications */}
          <Card>
            <CardHeader title="Past communications" action={
              (task.contactId || task.accountId) ? (
                <Link href={`/activities${qs({ contactId: task.contactId, accountId: task.contactId ? undefined : task.accountId })}`}
                  className="text-xs font-medium text-accent-deep hover:underline">View all</Link>
              ) : null
            } />
            {history.length === 0 ? (
              <EmptyState icon="bolt" title="Nothing logged yet"
                hint={who ? `No calls, emails or visits recorded with ${who} yet.` : "No activity recorded for this task's business yet."} />
            ) : (
              <ul className="px-5 pb-5">
                {history.map((a) => (
                  <li key={a.id} className="relative border-l border-line py-2.5 pl-5 last:pb-0">
                    <span className="absolute -left-[5px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
                    <p className="text-sm">
                      <span className="font-medium">{a.type}</span>
                      {a.outcome && <> · <Badge>{a.outcome}</Badge></>}
                      <span className="ml-2 text-xs text-faint">{fmtDateTime(a.occurredAt)}</span>
                    </p>
                    {a.notes && <p className="mt-0.5 text-sm text-soft">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {task.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-wrap px-5 pb-5 text-sm text-soft">{task.notes}</p>
            </Card>
          )}

          {/* Leads at this business */}
          {leads.length > 0 && (
            <Card>
              <CardHeader title={`Leads at ${account?.name ?? "this business"}`} action={
                <Link href={`/leads${qs({ accountId: task.accountId })}`}
                  className="text-xs font-medium text-accent-deep hover:underline">View all</Link>
              } />
              <ul className="divide-y divide-hairline px-5 pb-2">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                    <RecordLink href={`/leads/${l.id}`}>{`${l.firstName} ${l.lastName}`.trim()}</RecordLink>
                    <span className="flex items-center gap-2 text-xs text-soft">
                      {l.phone && <span>{l.phone}</span>}
                      <Badge>{l.apptStatus}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* What this task is attached to */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="About" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              {([
                ["Business", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
                ["Contact", contact ? <RecordLink key="c" href={`/contacts/${contact.id}`}>{who}</RecordLink> : "—"],
                ["Opportunity", opportunity ? <RecordLink key="o" href={`/opportunities/${opportunity.id}`}>{opportunity.name}</RecordLink> : "—"],
                ["Event", event ? <RecordLink key="e" href={`/events/${event.id}`}>{event.name}</RecordLink> : "—"],
                ["Project", project ? <RecordLink key="p" href={`/projects/${project.id}`}>{project.name}</RecordLink> : "—"],
                ["Created", fmtDate(task.createdAt)],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {(contact || account) && (
            <Card>
              <CardHeader title="Log this" />
              <div className="px-5 pb-5">
                <BtnLink
                  href={`/activities/new${qs({
                    accountId: task.accountId, contactId: task.contactId,
                    returnTo: `/tasks/${id}${from ? `?from=${from}` : ""}`,
                  })}`}>
                  Log an activity
                </BtnLink>
                <p className="mt-2 text-xs text-faint">
                  Logging a call or email here closes this follow-up automatically.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
