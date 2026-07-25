// Org / City / Person switch for the two surfaces that report numbers.
// Pure links — the scope lives in the URL, so a scoped view is shareable and
// every drill-down carries the same scope through to the records behind it.
import Link from "next/link";
import type { ScopeMode } from "@/lib/scope";

type Person = { id: number; name: string };

export default function ScopeToggle({
  basePath, sp, mode, cityName, isAdmin, people, meId,
}: {
  basePath: string;
  sp: Record<string, string | string[] | undefined>;
  mode: ScopeMode;
  cityName: string;
  isAdmin: boolean;
  people: Person[];
  meId: number | null;
}) {
  // Keep every other param (date range, period, offset) when switching scope.
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "scope" || k === "who") continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (val) p.set(k, val);
    }
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const q = p.toString();
    return `${basePath}${q ? `?${q}` : ""}`;
  };

  const who = Array.isArray(sp.who) ? sp.who[0] : sp.who;
  const activePerson = mode === "person" ? (who ? Number(who) : meId) : null;
  const others = people.filter((p) => p.id !== meId);

  const tab = (label: string, active: boolean, to: string) => (
    <Link
      key={label}
      href={to}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
        active ? "bg-ink text-canvas" : "text-soft hover:bg-hairline hover:text-ink-hover"
      }`}
    >
      {label}
    </Link>
  );

  return (
    // One pill group that wraps as a unit — teammates sit inside it, after a
    // hairline divider, rather than floating below on narrow screens.
    <div className="mb-5 print:hidden">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-[1.25rem] border border-line bg-card p-1 shadow-card">
        {isAdmin && tab("All cities", mode === "org", href({ scope: "org" }))}
        {tab(cityName, mode === "city", href({}))}
        {tab(isAdmin ? "Me" : "My stats", mode === "person" && activePerson === meId, href({ scope: "person" }))}

        {/* Admins can pull up any one person's numbers. */}
        {isAdmin && others.length > 0 && (
          <>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
            {others.map((p) =>
              tab(p.name, mode === "person" && activePerson === p.id, href({ scope: "person", who: String(p.id) })),
            )}
          </>
        )}
      </div>
    </div>
  );
}
