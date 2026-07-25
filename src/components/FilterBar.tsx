"use client";

// URL-driven filter bar: every change updates searchParams, so any filtered
// view is shareable and every metric can deep-link to it.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterDef = {
  name: string;
  label: string;
  options: (string | { value: string; label: string })[];
};

export default function FilterBar({ filters = [], dateKeys, searchable = false }: {
  filters?: FilterDef[];
  /** e.g. ["from","to"] or ["cfrom","cto"] */
  dateKeys?: [string, string];
  searchable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  // sort/dir are managed by the column headers, not filters — leave them be.
  const IGNORED = new Set(["highlight", "sort", "dir"]);
  const hasFilters = [...params.keys()].some((k) => !IGNORED.has(k));

  const clearFilters = () => {
    const next = new URLSearchParams();
    for (const k of ["sort", "dir"]) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    startTransition(() => router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname));
  };

  const selectCls =
    "rounded-full border border-line bg-card px-3.5 py-1.5 text-[0.8rem] font-medium text-ink outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchable && (
        <input
          defaultValue={params.get("q") ?? ""}
          placeholder="Filter by name…"
          className={selectCls + " w-44"}
          onKeyDown={(e) => {
            if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
          }}
          onBlur={(e) => {
            if (e.target.value !== (params.get("q") ?? "")) set("q", e.target.value);
          }}
        />
      )}
      {filters.map((f) => (
        <select key={f.name} value={params.get(f.name) ?? ""} className={selectCls}
          onChange={(e) => set(f.name, e.target.value)}>
          <option value="">{f.label}: All</option>
          {f.options.map((o) => {
            const v = typeof o === "string" ? { value: o, label: o } : o;
            return <option key={v.value} value={v.value}>{v.label}</option>;
          })}
        </select>
      ))}
      {dateKeys && (
        <span className="flex items-center gap-1.5 text-[0.8rem] text-soft">
          <input type="date" value={params.get(dateKeys[0]) ?? ""} className={selectCls}
            onChange={(e) => set(dateKeys[0], e.target.value)} />
          –
          <input type="date" value={params.get(dateKeys[1]) ?? ""} className={selectCls}
            onChange={(e) => set(dateKeys[1], e.target.value)} />
        </span>
      )}
      {hasFilters && (
        <button onClick={clearFilters}
          className="rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium text-accent-deep transition-colors hover:bg-accent-soft">
          Clear filters
        </button>
      )}
    </div>
  );
}
