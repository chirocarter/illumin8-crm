import Link from "next/link";
import { listTasks, type SP, spStr } from "@/lib/lists";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink, pillSm } from "@/components/ui";
import { setTaskStatus } from "@/app/actions";
import { Icon } from "@/components/icons";
import { fmtDate, todayISO } from "@/lib/dates";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // Default view: open tasks
  if (!spStr(sp, "status") && !spStr(sp, "due")) sp.status = "Open";
  const rows = await listTasks(sp);
  const today = todayISO();
  const due = spStr(sp, "due");

  const chip = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? pillSm + " pill-active" : pillSm}>
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tasks & Follow-Ups" subtitle={`${rows.length} shown`}
        actions={<BtnLink href="/tasks/new"><Icon name="plus" className="h-4 w-4" /> New Task</BtnLink>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {chip("/tasks", "Open", !due && spStr(sp, "status") === "Open")}
        {chip("/tasks?due=overdue", "Overdue", due === "overdue")}
        {chip("/tasks?due=today", "Due today", due === "today")}
        {chip("/tasks?status=Completed", "Completed", spStr(sp, "status") === "Completed")}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="check" title="All clear"
            hint="No tasks here. Log an activity with a follow-up date to queue the next touch." />
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((t) => {
              const overdue = t.status === "Open" && t.dueDate && t.dueDate < today;
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fafafc]">
                  <form action={setTaskStatus}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={t.status === "Completed" ? "Open" : "Completed"} />
                    <button type="submit" title={t.status === "Completed" ? "Reopen" : "Mark complete"}
                      className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        t.status === "Completed"
                          ? "border-good bg-good text-white"
                          : "border-line bg-card hover:border-accent"}`}>
                      {t.status === "Completed" && <Icon name="check" className="h-3.5 w-3.5" />}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${t.status === "Completed" ? "text-faint line-through" : ""}`}>{t.title}</p>
                    <p className="truncate text-xs text-soft">
                      {t.accountId && <RecordLink href={`/accounts/${t.accountId}`} muted>{t.accountName}</RecordLink>}
                      {t.contactId && <> · <RecordLink href={`/contacts/${t.contactId}`} muted>{t.contactFirst} {t.contactLast}</RecordLink></>}
                      {t.opportunityId && <> · <RecordLink href={`/opportunities/${t.opportunityId}`} muted>opportunity</RecordLink></>}
                      {t.eventId && <> · <RecordLink href={`/events/${t.eventId}`} muted>event</RecordLink></>}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${overdue ? "text-bad" : "text-soft"}`}>
                    {overdue ? `Overdue · ${fmtDate(t.dueDate)}` : fmtDate(t.dueDate)}
                  </span>
                  {t.status !== "Completed" && <Badge>{t.status}</Badge>}
                  <RecordLink href={`/tasks/${t.id}/edit`} muted>Edit</RecordLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
