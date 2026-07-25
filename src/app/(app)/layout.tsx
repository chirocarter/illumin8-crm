import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalSearch from "@/components/GlobalSearch";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await cookies();
  const dark = store.get("i8_theme")?.value === "dark";

  return (
    <div className="min-h-screen">
      <div className="print:hidden"><Sidebar /></div>
      <div className="md:pl-[220px] print:pl-0">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-md print:hidden">
          <div className="flex items-center gap-3 px-5 py-3 md:px-8">
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle initialDark={dark} />
              <Link href="/activities/new"
                className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-canvas shadow-sm transition-all hover:bg-ink-hover active:scale-[0.98] md:hidden">
                <Icon name="plus" className="h-4 w-4" /> Log
              </Link>
              <Link href="/settings" className="hidden items-center gap-2 rounded-full px-2 py-1 text-sm text-soft transition-colors hover:text-ink-hover md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-deep">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                {user.name}
              </Link>
            </div>
          </div>
          <MobileNav />
        </header>
        <main className="rise px-5 py-6 md:px-8 md:py-7 print:p-0">{children}</main>
      </div>
    </div>
  );
}
