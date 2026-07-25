import Link from "next/link";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Reports" };

const REPORTS = [
  { href: "/reports/activity", icon: "bolt", title: "Weekly Activity", desc: "What you did: contacts, visits, calls, follow-ups, drop box runs, events booked & held." },
  { href: "/reports/outcomes", icon: "sparkle", title: "Weekly Outcomes", desc: "What it produced: leads, screenings, appointments, show rate, revenue, conversion." },
  { href: "/reports/pipeline", icon: "pipeline", title: "Pipeline", desc: "Opportunities by stage, type, vertical, and location — plus stale deals and likely bookings." },
  { href: "/reports/partners", icon: "handshake", title: "Partners", desc: "Leads, events, and appointments by partner. Which restaurants and gyms actually produce." },
  { href: "/reports/locations", icon: "building", title: "Locations", desc: "Performance by NE Heights, Westside, Downtown, Rio Rancho, and other areas." },
  { href: "/reports/sources", icon: "megaphone", title: "Source Attribution", desc: "Where results come from: drop boxes, gym events, lunch-and-learns, referrals, and more." },
  { href: "/reports/goals", icon: "chart", title: "Goal Progress", desc: "Weekly targets vs. actuals — 50 contacts, 6 events, 18 appointments, and yours to edit." },
] as const;

export default function ReportsIndex() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Reports"
        subtitle="Deterministic reporting — every number is a SQL query with a click-through to its records. No AI, no estimates." />

      {/* Featured: the all-in-one report for leadership */}
      <Link href="/reports/performance" className="mb-4 block">
        <Card className="group flex items-start gap-4 border border-accent/30 bg-accent-soft/40 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <Icon name="chart" className="h-5 w-5" />
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-semibold group-hover:text-accent-deep">
              Performance Report <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-white">Week / Month</span>
              <Icon name="arrowRight" className="h-4 w-4 text-accent-deep transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-1 block text-sm text-soft">Everything in one place for reporting to leadership — all activity, outcomes, rates, pipeline, and goals for the week or month, with change vs. the previous period. Print or save as PDF.</span>
          </span>
        </Card>
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="group flex h-full items-start gap-4 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
                <Icon name={r.icon} className="h-5 w-5" />
              </span>
              <span>
                <span className="flex items-center gap-1.5 font-semibold group-hover:text-accent-deep">
                  {r.title} <Icon name="arrowRight" className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block text-sm text-soft">{r.desc}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
