import Link from "next/link";
import { db, schema as s } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
import { PageHeader, Card, Badge, BtnLink, EmptyState, RecordLink, pillSm } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/dates";
import { cityWhere } from "@/lib/scope";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const statusFilter = spStr(sp, "status");

  const rows = await db
    .select({
      id: s.projects.id, name: s.projects.name, status: s.projects.status,
      nextStep: s.projects.nextStep, targetDate: s.projects.targetDate,
      accountId: s.projects.accountId, accountName: s.accounts.name,
      // The outer column must be written out in full — interpolating
      // ${s.projects.id} renders a bare "id" that SQLite resolves against the
      // subquery's own table, silently returning wrong counts.
      updates: sql<number>`(select count(*) from activities where activities.project_id = projects.id)`,
      lastUpdate: sql<string | null>`(select max(occurred_at) from activities where activities.project_id = projects.id)`,
      docs: sql<number>`(select count(*) from documents where documents.project_id = projects.id)`,
    })
    .from(s.projects)
    .leftJoin(s.accounts, eq(s.projects.accountId, s.accounts.id))
    .where(await cityWhere(s.projects.cityId, statusFilter ? eq(s.projects.status, statusFilter) : undefined))
    .orderBy(desc(s.projects.createdAt));

  const shown = statusFilter ? rows : rows.filter((r) => r.status !== "Archived");
  const chip = (href: string, label: string, active: boolean) => (
    <Link key={label} href={href} className={active ? pillSm + " !bg-ink !text-canvas" : pillSm}>{label}</Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Projects" subtitle="Long-running initiatives — partnerships, credentialing, big pushes"
        actions={<BtnLink href="/projects/new"><Icon name="plus" className="h-4 w-4" /> New Project</BtnLink>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {chip("/projects", "Open", !statusFilter)}
        {chip("/projects?status=Active", "Active", statusFilter === "Active")}
        {chip("/projects?status=On Hold", "On Hold", statusFilter === "On Hold")}
        {chip("/projects?status=Completed", "Completed", statusFilter === "Completed")}
        {chip("/projects?status=Archived", "Archived", statusFilter === "Archived")}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="target" title="No projects here"
            hint="Create one for anything that takes weeks, not calls — like getting in-network with an insurer."
            action={<BtnLink href="/projects/new" variant="outline">Create a project</BtnLink>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="group flex h-full flex-col p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold leading-snug group-hover:text-accent-deep">{p.name}</h2>
                  <Badge>{p.status}</Badge>
                </div>
                {p.nextStep && <p className="mt-1.5 text-sm text-soft">Next: {p.nextStep}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-xs text-faint">
                  {p.accountName && <span>{p.accountName}</span>}
                  <span>{Number(p.updates)} update{Number(p.updates) === 1 ? "" : "s"}</span>
                  {Number(p.docs) > 0 && <span>{Number(p.docs)} doc{Number(p.docs) === 1 ? "" : "s"}</span>}
                  <span>{p.lastUpdate ? `Last update ${fmtDate(p.lastUpdate)}` : "No updates yet"}</span>
                  {p.targetDate && <span className="text-accent-deep">Target {fmtDate(p.targetDate)}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
