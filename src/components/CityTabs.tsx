// City selector in the app's standard pill group — same shape and spacing as
// ScopeToggle, so the two read as one family rather than two inventions.
//
// Pure links: the choice lives in the URL, so a city view is shareable and a
// refresh keeps you where you were. It deliberately does NOT touch the `i8_city`
// cookie — that cookie is the WORKFLOW city (which market you are working in,
// affecting every list and picker), and quietly changing it from a dashboard
// would move someone's whole session without them asking.
import Link from "next/link";

export type CityOption = { id: number; name: string };

export default function CityTabs({
  basePath, sp, cities, activeId, allLabel = "All cities",
}: {
  basePath: string;
  sp: Record<string, string | string[] | undefined>;
  cities: CityOption[];
  /** null = every city */
  activeId: number | null;
  /** Omit the "all" tab by passing null. */
  allLabel?: string | null;
}) {
  // Keep every other param when switching city, so filters survive the click.
  const href = (city: string | undefined) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "city") continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (val) p.set(k, val);
    }
    if (city) p.set("city", city);
    const q = p.toString();
    return `${basePath}${q ? `?${q}` : ""}`;
  };

  const tab = (label: string, active: boolean, to: string) => (
    <Link
      key={label}
      href={to}
      aria-current={active ? "page" : undefined}
      className={`pill-idle rounded-full px-3 py-1.5 text-[0.8rem] font-medium transition-colors ${
        active ? "pill-active" : "text-soft hover:bg-hairline hover:text-ink-hover"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mb-5 print:hidden">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-[1.25rem] border border-line bg-card p-1 shadow-card">
        {allLabel && tab(allLabel, activeId === null, href("all"))}
        {cities.map((c) => tab(c.name, activeId === c.id, href(String(c.id))))}
      </div>
    </div>
  );
}
