import Link from "next/link";
import { PageHeader, BtnLink, Card, EmptyState, pillSm } from "@/components/ui";
import { Icon } from "@/components/icons";
import { todayISO, fmtDate } from "@/lib/dates";
import { activeCity, resolveScope, selectableUsers } from "@/lib/scope";
import { requireUser } from "@/lib/auth";
import { pipelineCards, PIPELINE_STAGES, type PipelineStage } from "@/lib/pipeline";
import ScopeToggle from "@/components/ScopeToggle";
import type { SP } from "@/lib/lists";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

/** What each column means, so the board explains itself. */
const STAGE_HINT: Record<PipelineStage, string> = {
  Prospect: "No contact logged yet",
  Contacted: "You've reached out",
  Interested: "Showed interest or discussed partnering",
  "Meeting Booked": "A meeting is on the books",
  "Event Booked": "An event is scheduled",
  "Event Completed": "The event happened",
  Partner: "Active partner",
};

const STAGE_ACCENT: Record<PipelineStage, string> = {
  Prospect: "text-faint",
  Contacted: "text-soft",
  Interested: "text-info",
  "Meeting Booked": "text-good",
  "Event Booked": "text-accent-deep",
  "Event Completed": "text-accent-deep",
  Partner: "text-good",
};

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayISO();

  const [user, scope, city, people] = await Promise.all([
    requireUser(), resolveScope(sp), activeCity(), selectableUsers(),
  ]);
  const cards = await pipelineCards(scope, today);

  const byStage = new Map<PipelineStage, typeof cards>();
  for (const c of cards) byStage.set(c.stage, [...(byStage.get(c.stage) ?? []), c]);
  // Within a column, overdue follow-ups first, then most recently touched.
  for (const [, list] of byStage) {
    list.sort((a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (b.lastContactedAt ?? "").localeCompare(a.lastContactedAt ?? ""));
  }

  return (
    <div>
      <PageHeader title="Pipeline"
        subtitle={<span>{scope.label} · every business, staged by what&apos;s actually been logged</span>}
        actions={<>
          <BtnLink variant="outline" href="/accounts">List view</BtnLink>
          <BtnLink href="/activities/new"><Icon name="plus" className="h-4 w-4" /> Log Activity</BtnLink>
        </>} />

      <ScopeToggle basePath="/pipeline" sp={sp} mode={scope.mode} cityName={city?.name ?? "My city"}
        isAdmin={user.role === "admin"} people={people} meId={user.id} />

      <p className="mb-4 text-xs text-faint">
        Stages update themselves — log a call and the business moves. Businesses marked
        Not a Fit or Do Not Contact are left off the board.
      </p>

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon="pipeline" title={`No businesses in ${scope.label}`}
            hint="Add a business, or switch scope above to see another city's pipeline." />
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="flex w-[250px] shrink-0 flex-col rounded-card bg-well p-2">
                <div className="mb-2 px-2 pt-1">
                  <span className="flex items-baseline justify-between">
                    <span className={`text-[0.72rem] font-semibold uppercase tracking-wider ${STAGE_ACCENT[stage]}`}>
                      {stage}
                    </span>
                    <span className="text-[0.72rem] font-medium text-faint">{list.length}</span>
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] text-faint">{STAGE_HINT[stage]}</span>
                </div>

                <div className="flex min-h-[60px] flex-col gap-2">
                  {list.slice(0, 40).map((c) => (
                    <Link key={c.accountId} href={`/accounts/${c.accountId}`}
                      className="block rounded-xl bg-card p-3 shadow-card transition-all hover:shadow-lift">
                      <p className="text-[0.83rem] font-medium leading-snug hover:text-accent-deep">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-soft" title={c.reason}>{c.reason}</p>
                      {c.nextFollowUpAt && (
                        <p className={`mt-1.5 text-[0.7rem] ${c.overdue ? "font-medium text-bad" : "text-faint"}`}>
                          ↻ {fmtDate(c.nextFollowUpAt)}
                        </p>
                      )}
                    </Link>
                  ))}
                  {list.length > 40 && (
                    <Link href={`/accounts?status=${encodeURIComponent(stage)}`}
                      className="px-2 py-1 text-[0.7rem] text-faint hover:underline">
                      +{list.length - 40} more
                    </Link>
                  )}
                  {list.length === 0 && (
                    <p className="px-2 py-3 text-center text-[0.7rem] text-faint">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
