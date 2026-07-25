import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { globalSearch, SEARCH_GROUPS, type SearchHit } from "@/lib/search";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = spStr(sp, "q")?.trim() ?? "";
  const hits = q ? await globalSearch(q, 15) : [];

  const byGroup = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const list = byGroup.get(hit.kind) ?? [];
    list.push(hit);
    byGroup.set(hit.kind, list);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={q ? `Search: “${q}”` : "Search"}
        subtitle={q ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "Use the search bar above"} />

      {q && hits.length === 0 && (
        <Card><EmptyState icon="search" title={`Nothing found for “${q}”`} hint="Try a shorter fragment of the name." /></Card>
      )}

      {SEARCH_GROUPS.map((group) => {
        const items = byGroup.get(group);
        if (!items || items.length === 0) return null;
        return (
          <Card key={group} className="mb-4">
            <p className="px-5 pt-4 text-[0.72rem] font-semibold uppercase tracking-wider text-faint">{group}</p>
            <ul className="px-2 py-2">
              {items.map((hit) => (
                <li key={hit.href}>
                  <Link href={hit.href}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-hairline">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{hit.label}</span>
                      {hit.sub && <span className="block truncate text-xs text-soft">{hit.sub}</span>}
                    </span>
                    {hit.badge && <Badge>{hit.badge}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
