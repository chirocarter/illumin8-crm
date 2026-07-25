import Link from "next/link";
import { PageHeader, Card, CardHeader, DrillNumber } from "@/components/ui";
import RangeNav from "@/components/RangeNav";
import { metricValues } from "@/lib/metrics";
import { rangeFromSP } from "@/lib/dates";
import { db } from "@/db";
import { resolveScope } from "@/lib/scope";
import type { SP } from "@/lib/lists";

export const metadata = { title: "Goal Progress" };
export const dynamic = "force-dynamic";

export default async function GoalReport({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeFromSP(sp);
  const scope = await resolveScope(sp);
  const [metrics, goals] = await Promise.all([
    metricValues(from, to, scope, scope.params),
    db.query.reportGoals.findMany({ orderBy: (g, { asc }) => [asc(g.sortOrder)] }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Goal Progress" subtitle={`Weekly targets vs. actuals · ${scope.label}`}
        actions={<Link href="/settings" className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-hairline">Edit goals</Link>} />
      <RangeNav basePath="/reports/goals" from={from} to={to} />

      <Card>
        <CardHeader title="This Week vs. Target" />
        <div className="space-y-5 px-5 pb-6">
          {goals.map((g) => {
            const metric = metrics[g.metric];
            if (!metric) return null;
            const pct = g.weeklyTarget > 0 ? Math.round((metric.value / g.weeklyTarget) * 100) : 0;
            const width = Math.min(100, pct);
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{g.label}</span>
                  <span className="text-soft">
                    <DrillNumber value={metric.value} href={metric.href} />
                    <span className="text-faint"> / {g.weeklyTarget} · {pct}%</span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-hairline">
                  <div className={`h-full rounded-full ${pct >= 100 ? "bg-good" : "bg-gradient-to-r from-brand-from to-brand-to"}`}
                    style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="mt-4 text-xs text-faint">
        Actuals use the same metric definitions as the Command Center and weekly reports — one source of truth.
      </p>
    </div>
  );
}
