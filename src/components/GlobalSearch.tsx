"use client";

// Global search with live preview: results appear as you type (debounced),
// arrow keys + Enter navigate, Enter with nothing highlighted opens the
// full /search page. Same query as /search via /api/search.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { badgeClass } from "@/lib/badges";
import type { SearchHit } from "@/lib/search";

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlightState] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror highlight in a ref so Enter always sees the latest value, even
  // when multiple key events land in one React batch.
  const highlightRef = useRef(-1);
  const setHighlight = (updater: number | ((h: number) => number)) => {
    const next = typeof updater === "function" ? updater(highlightRef.current) : updater;
    highlightRef.current = next;
    setHighlightState(next);
  };

  // Debounced fetch
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setHighlight(-1);
        setLoading(false);
      } catch {
        /* aborted or offline — keep previous results */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  // Close when clicking outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const goFull = () => {
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const pick = (hit: SearchHit) => {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % Math.max(hits.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? hits.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = highlightRef.current;
      if (open && h >= 0 && hits[h]) pick(hits[h]);
      else goFull();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Group hits preserving their order
  const groups: { kind: string; items: { hit: SearchHit; index: number }[] }[] = [];
  hits.forEach((hit, index) => {
    const last = groups[groups.length - 1];
    if (last && last.kind === hit.kind) last.items.push({ hit, index });
    else groups.push({ kind: hit.kind, items: [{ hit, index }] });
  });

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative flex-1 md:max-w-md">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint">
        <Icon name="search" className="h-4 w-4" />
      </span>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search businesses, contacts, events…"
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        className="w-full rounded-full border border-line bg-card py-2 pl-9 pr-4 text-sm outline-none transition-shadow placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />

      {showPanel && (
        <div className="absolute top-full z-50 mt-2 max-h-[65vh] w-full overflow-y-auto rounded-xl border border-line bg-card shadow-lift">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-faint">{loading ? "Searching…" : `Nothing found for “${q.trim()}”`}</p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.kind} className="border-b border-hairline last:border-b-0">
                  <p className="px-3.5 pb-1 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-wider text-faint">{g.kind}</p>
                  {g.items.map(({ hit, index }) => (
                    <button
                      key={hit.href}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(hit)}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors ${
                        highlight === index ? "bg-hairline" : ""}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{hit.label}</span>
                        {hit.sub && <span className="block truncate text-xs text-soft">{hit.sub}</span>}
                      </span>
                      {hit.badge && (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass(hit.badge)}`}>
                          {hit.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              <button onClick={goFull}
                className="flex w-full items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-accent-deep transition-colors hover:bg-hairline">
                See all results for “{q.trim()}”
                <Icon name="arrowRight" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
