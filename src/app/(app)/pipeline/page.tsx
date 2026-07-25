import Link from "next/link";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { PageHeader, BtnLink, pillSm } from "@/components/ui";
import KanbanBoard from "@/components/KanbanBoard";
import { Icon } from "@/components/icons";
import { OPEN_STAGES } from "@/lib/taxonomy";
import { todayISO } from "@/lib/dates";
import { cityWhere } from "@/lib/scope";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

const BOARD_STAGES = [...OPEN_STAGES, "Nurture"];

export default async function PipelinePage() {
  const rows = await db
    .select({
      id: s.opportunities.id, name: s.opportunities.name, stage: s.opportunities.stage,
      expectedEventDate: s.opportunities.expectedEventDate,
      nextFollowUpAt: s.opportunities.nextFollowUpAt,
      accountId: s.opportunities.accountId, accountName: s.accounts.name,
    })
    .from(s.opportunities)
    .leftJoin(s.accounts, eq(s.opportunities.accountId, s.accounts.id))
    .where(await cityWhere(s.opportunities.cityId));

  const today = todayISO();
  const cards = rows
    .filter((r) => BOARD_STAGES.includes(r.stage))
    .map((r) => ({ ...r, overdue: !!r.nextFollowUpAt && r.nextFollowUpAt < today }));

  const closed = (stage: string) => rows.filter((r) => r.stage === stage).length;

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Drag cards between stages — headers open the filtered list"
        actions={<>
          <BtnLink variant="outline" href="/opportunities">List view</BtnLink>
          <BtnLink href="/opportunities/new"><Icon name="plus" className="h-4 w-4" /> New Opportunity</BtnLink>
        </>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["Completed", "Converted", "Lost / Not Fit"] as const).map((stg) => (
          <Link key={stg} href={`/opportunities?stage=${encodeURIComponent(stg)}`} className={pillSm}>
            {stg} · {closed(stg)}
          </Link>
        ))}
        <Link href="/opportunities?stale=1"
          className={pillSm + " !text-accent-deep hover:!bg-accent-soft"}>
          Stale (14+ days in stage)
        </Link>
      </div>

      <KanbanBoard stages={BOARD_STAGES} cards={cards} />
    </div>
  );
}
