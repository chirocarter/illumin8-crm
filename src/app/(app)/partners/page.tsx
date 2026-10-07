// Current partners: every business whose status is Active Partner. A partner
// is a business, not a separate record — this page, the Partner Report and the
// status on the business all mean the same thing.
//
// One large card per partner: the name, and the to-dos still open for it.
import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { PageHeader, Card, BtnLink, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { fmtDate, fmtDateLong, todayISO } from "@/lib/dates";
import { cityWhere } from "@/lib/scope";
import { ACTIVE_PARTNER, PAST_PARTNER } from "@/lib/taxonomy";

const NEW_PARTNER_HREF = `/accounts/new?status=${encodeURIComponent(ACTIVE_PARTNER)}`;

export const metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

/** To-dos shown per card before "+N more" hands off to the full task list. */
const TODOS_PER_CARD = 5;

export default async function PartnersPage() {
  const partners = await db
    .select({
      id: s.accounts.id, name: s.accounts.name, vertical: s.accounts.vertical,
      area: s.accounts.area, partnerSince: s.accounts.partnerSince,
    })
    .from(s.accounts)
    .where(await cityWhere(s.accounts.cityId, eq(s.accounts.status, ACTIVE_PARTNER)))
    .orderBy(sql`${s.accounts.name} collate nocase`);
  const [{ n: pastCount }] = await db.select({ n: count() }).from(s.accounts)
    .where(await cityWhere(s.accounts.cityId, eq(s.accounts.status, PAST_PARTNER)));

  // Open tasks on these businesses: the same set the account page lists under
  // Open Tasks, so the two never disagree.
  const ids = partners.map((p) => p.id);
  const tasks = ids.length === 0 ? [] : await db
    .select({ id: s.tasks.id, title: s.tasks.title, dueDate: s.tasks.dueDate, accountId: s.tasks.accountId })
    .from(s.tasks)
    .where(and(inArray(s.tasks.accountId, ids), eq(s.tasks.status, "Open")));

  // Soonest first, so anything overdue leads; undated ones go last rather
  // than first, which is where SQL would put a null.
  tasks.sort((a, b) =>
    a.dueDate === b.dueDate ? a.id - b.id
    : a.dueDate === null ? 1
    : b.dueDate === null ? -1
    : a.dueDate < b.dueDate ? -1 : 1);
  const tasksFor = new Map<number, typeof tasks>();
  for (const t of tasks) {
    const list = tasksFor.get(t.accountId!) ?? [];
    list.push(t);
    tasksFor.set(t.accountId!, list);
  }

  const today = todayISO();
  const due = (iso: string | null) =>
    iso === null ? { label: "No due date", cls: "text-faint" }
    : iso < today ? { label: `Overdue · ${fmtDate(iso)}`, cls: "text-bad" }
    : iso.slice(0, 10) === today ? { label: "Today", cls: "text-accent-deep" }
    : { label: fmtDate(iso), cls: "text-soft" };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Partners"
        subtitle={<>
          {partners.length} active partner{partners.length === 1 ? "" : "s"}
          {pastCount > 0 && <>
            {" · "}
            <Link href={`/accounts?status=${encodeURIComponent(PAST_PARTNER)}`} className="underline decoration-line underline-offset-4 hover:text-accent-deep">
              {pastCount} past
            </Link>
          </>}
        </>}
        actions={<>
          <BtnLink href="/reports/partners" variant="outline">Partner Report</BtnLink>
          <BtnLink href={NEW_PARTNER_HREF}><Icon name="plus" className="h-4 w-4" /> New Partner</BtnLink>
        </>} />

      {partners.length === 0 ? (
        <Card>
          <EmptyState icon="handshake" title="No active partners yet"
            hint="A business shows up here once its status is Active Partner."
            action={<BtnLink href={NEW_PARTNER_HREF} variant="outline">Add a partner</BtnLink>} />
        </Card>
      ) : (
        // Two across only on wide screens: beside the sidebar, two cards at
        // tablet width are ~230px each — too narrow for a name this size.
        <div className="grid gap-5 xl:grid-cols-2">
          {partners.map((p) => {
            const todos = tasksFor.get(p.id) ?? [];
            const shown = todos.slice(0, TODOS_PER_CARD);
            const details = [p.vertical, p.area !== "Other" ? p.area : null,
              p.partnerSince ? `Partner since ${fmtDateLong(p.partnerSince)}` : null].filter(Boolean);
            return (
              <article key={p.id} className="flex min-w-0 flex-col rounded-[1.75rem] bg-card p-6 shadow-card sm:p-7">
                <Link href={`/accounts/${p.id}`} className="group block">
                  <h2 className="break-words text-[1.75rem] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-accent-deep sm:text-[2rem]">
                    {p.name}
                  </h2>
                  {details.length > 0 && <p className="mt-1.5 text-sm text-soft">{details.join(" · ")}</p>}
                </Link>

                <div className="mt-6 flex flex-1 flex-col border-t border-hairline pt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-faint">
                      To-dos{todos.length > 0 ? ` · ${todos.length}` : ""}
                    </span>
                    <Link href={`/tasks/new?accountId=${p.id}`} className="text-xs font-medium text-accent-deep hover:underline">
                      + Add
                    </Link>
                  </div>

                  {todos.length === 0 ? (
                    <p className="py-2 text-sm text-faint">Nothing on the list.</p>
                  ) : (
                    <ul className="-mx-3">
                      {shown.map((t) => {
                        const d = due(t.dueDate);
                        return (
                          <li key={t.id}>
                            <Link href={`/tasks/${t.id}`}
                              className="flex items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hairline">
                              <span className="min-w-0 break-words text-[0.95rem] font-medium text-ink">{t.title}</span>
                              <span className={`shrink-0 text-xs font-medium ${d.cls}`}>{d.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {todos.length > shown.length && (
                    <Link href={`/tasks?accountId=${p.id}`} className="mt-1 text-sm font-medium text-accent-deep hover:underline">
                      +{todos.length - shown.length} more
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
