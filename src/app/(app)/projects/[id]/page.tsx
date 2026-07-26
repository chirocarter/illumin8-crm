import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, EmptyState, Btn, selectCls } from "@/components/ui";
import DocumentsCard from "@/components/DocumentsCard";
import { setProjectStatus } from "@/app/actions";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { PROJECT_STATUSES } from "@/lib/taxonomy";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  const project = await authorize(await db.query.projects.findFirst({ where: eq(s.projects.id, id) }));
  if (!project) notFound();

  const [account, updates, docs, tasks] = await Promise.all([
    project.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, project.accountId) }) : null,
    db.query.activities.findMany({ where: eq(s.activities.projectId, id), orderBy: [desc(s.activities.occurredAt)] }),
    db.query.documents.findMany({
      where: eq(s.documents.projectId, id),
      orderBy: [desc(s.documents.createdAt)],
      columns: { id: true, name: true, fileName: true, mimeType: true, size: true, createdAt: true },
    }),
    db.query.tasks.findMany({ where: and(eq(s.tasks.projectId, id), eq(s.tasks.status, "Open")), orderBy: [s.tasks.dueDate] }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={project.name}
        subtitle={<span className="flex items-center gap-2"><Badge>{project.status}</Badge>
          {project.nextStep && <span className="text-soft">Next: {project.nextStep}</span>}</span>}
        actions={<>
          <BtnLink variant="outline" href={`/projects/${id}/edit`}>Edit</BtnLink>
          <BtnLink variant="outline" href={`/tasks/new${qs({ projectId: id, accountId: project.accountId })}`}>New Task</BtnLink>
          <BtnLink href={`/activities/new${qs({ projectId: id, accountId: project.accountId, type: "Note", returnTo: `/projects/${id}` })}`}>
            Log Update
          </BtnLink>
        </>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <DocumentsCard docs={docs} attach={{ projectId: id }} returnTo={`/projects/${id}`} error={spStr(sp, "docerror")} />

          <Card>
            <CardHeader title="Updates" action={
              <Link href={`/activities${qs({ projectId: id })}`} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>} />
            {updates.length === 0 ? (
              <EmptyState icon="bolt" title="No updates yet"
                hint="Log calls, emails, and progress notes here — they show up in your activity metrics too."
                action={<BtnLink variant="outline" href={`/activities/new${qs({ projectId: id, type: "Note", returnTo: `/projects/${id}` })}`}>Log the first update</BtnLink>} />
            ) : (
              <ul className="px-5 pb-5">
                {updates.map((a) => (
                  <li key={a.id} className="relative border-l border-line py-2.5 pl-5 last:pb-0">
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
            <CardHeader title="About" />
            {project.description && <p className="px-5 pb-4 text-sm text-soft">{project.description}</p>}
            <dl className="space-y-2 border-t border-hairline px-5 py-4 text-sm">
              {([
                ["Related business", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
                ["Target date", fmtDate(project.targetDate)],
                // Never a dead-end number — opens the activities behind it.
                ["Updates", <RecordLink key="u" href={`/activities${qs({ projectId: id })}`}>{updates.length}</RecordLink>],
                ["Started", fmtDate(project.createdAt)],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <form action={setProjectStatus} className="flex items-end gap-2 border-t border-hairline px-5 py-4">
              <input type="hidden" name="id" value={id} />
              <label className="flex-1">
                <span className="mb-1.5 block text-[0.8rem] font-medium text-soft">Status</span>
                <select name="status" defaultValue={project.status} className={selectCls}>
                  {PROJECT_STATUSES.map((st) => <option key={st}>{st}</option>)}
                </select>
              </label>
              <Btn type="submit" variant="outline">Update</Btn>
            </form>
          </Card>

          <Card>
            <CardHeader title="Open Tasks" action={
              <Link href={`/tasks/new${qs({ projectId: id, accountId: project.accountId })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
            {tasks.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">Nothing pending.</p>
            ) : (
              <ul className="px-2 pb-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}/edit`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-hairline">
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
    </div>
  );
}
