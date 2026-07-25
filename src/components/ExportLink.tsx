"use client";

import { useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/** Exports the *currently filtered* list — same query builder as the page. */
export default function ExportLink({ entity }: { entity: string }) {
  const params = useSearchParams();
  const qs = params.toString();
  return (
    <a href={`/api/export?entity=${entity}${qs ? "&" + qs : ""}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-hairline">
      <Icon name="download" className="h-4 w-4" />
      Export CSV
    </a>
  );
}
