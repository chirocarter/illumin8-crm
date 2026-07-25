"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/accounts", label: "Accounts" },
  { href: "/contacts", label: "Contacts" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/calendar", label: "Calendar" },
  { href: "/activities", label: "Activities" },
  { href: "/tasks", label: "Tasks" },
  { href: "/partners", label: "Partners" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/projects", label: "Projects" },
  { href: "/events", label: "Events" },
  { href: "/leads", label: "Leads" },
  { href: "/appointments", label: "Appts" },
  { href: "/documents", label: "Docs" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex gap-1.5 overflow-x-auto border-b border-line bg-card px-3 py-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium ${
            isActive(n.href) ? "bg-ink text-canvas" : "bg-hairline text-soft"
          }`}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
