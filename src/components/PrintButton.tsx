"use client";

import { Icon } from "./icons";

/** Triggers the browser's print dialog (use "Save as PDF" to email a snapshot). */
export default function PrintButton() {
  return (
    <button onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-hairline">
      <Icon name="download" className="h-4 w-4" />
      Print / PDF
    </button>
  );
}
