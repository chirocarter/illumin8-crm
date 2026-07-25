"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Command Center", icon: "dashboard" },
  { href: "/accounts", label: "Accounts", icon: "building" },
  { href: "/contacts", label: "Contacts", icon: "users" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/activities", label: "Activities", icon: "bolt" },
  { href: "/tasks", label: "Tasks", icon: "check" },
  { href: "/partners", label: "Partners", icon: "handshake" },
  { href: "/campaigns", label: "Campaigns", icon: "megaphone" },
  { href: "/projects", label: "Projects", icon: "target" },
  { href: "/events", label: "Events", icon: "flag" },
  { href: "/leads", label: "Leads", icon: "sparkle" },
  { href: "/appointments", label: "Appointments", icon: "clock" },
  { href: "/documents", label: "Documents", icon: "folder" },
  { href: "/reports", label: "Reports", icon: "chart" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-card md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
          <Icon name="sunrise" className="h-5 w-5" />
        </span>
        <span className="leading-tight">
          <span className="block text-[0.95rem] font-semibold tracking-tight">Illumin8</span>
          <span className="block text-[0.68rem] font-medium uppercase tracking-widest text-faint">Outreach</span>
        </span>
      </Link>

      <div className="px-3 pb-2">
        <Link href="/activities/new"
          className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-2 text-sm font-medium text-canvas shadow-sm transition-all hover:bg-ink-hover active:scale-[0.98]">
          <Icon name="plus" className="h-4 w-4" />
          Log Activity
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[0.85rem] font-medium transition-colors ${
              isActive(item.href)
                ? "bg-accent-soft text-accent-deep"
                : "text-soft hover:bg-hairline hover:text-ink-hover"
            }`}>
            <Icon name={item.icon} className="h-[17px] w-[17px]" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-hairline px-3 py-3">
        <Link href="/settings"
          className={`flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[0.85rem] font-medium transition-colors ${
            isActive("/settings") ? "bg-accent-soft text-accent-deep" : "text-soft hover:bg-hairline hover:text-ink-hover"
          }`}>
          <Icon name="gear" className="h-[17px] w-[17px]" />
          Settings
        </Link>
        <form action="/api/logout" method="post">
          <button type="submit"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-[0.85rem] font-medium text-soft transition-colors hover:bg-hairline hover:text-ink-hover">
            <Icon name="logout" className="h-[17px] w-[17px]" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
