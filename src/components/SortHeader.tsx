"use client";

// Clickable, URL-driven sortable column header. Click cycles:
//   inactive → default direction → opposite → back to the list's default order.
// Sort state lives in ?sort=&dir= alongside filters, so it's shareable and the
// CSV export (same query builder) comes out in the same order.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export default function SortHeader({ label, sortKey, align = "left", defaultDir = "asc" }: {
  label: string;
  sortKey: string;
  align?: "left" | "right";
  defaultDir?: "asc" | "desc";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const activeKey = params.get("sort");
  const activeDir = params.get("dir") === "desc" ? "desc" : "asc";
  const isActive = activeKey === sortKey;

  const onClick = () => {
    const next = new URLSearchParams(params.toString());
    if (!isActive) {
      next.set("sort", sortKey);
      next.set("dir", defaultDir);
    } else if (activeDir === defaultDir) {
      next.set("dir", defaultDir === "asc" ? "desc" : "asc");
    } else {
      next.delete("sort");
      next.delete("dir");
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <button type="button" onClick={onClick}
      className={`group inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-ink-hover ${
        isActive ? "text-ink" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}>
      {label}
      <span className={`text-[0.7rem] leading-none ${isActive ? "text-accent-deep" : "text-line group-hover:text-faint"}`}>
        {isActive ? (activeDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}
