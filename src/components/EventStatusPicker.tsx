"use client";

// The status badge on an event card, made changeable in place. Picking a new
// status submits immediately — one gesture, no edit form — and the server
// records the change as an activity so the history explains itself.
import { useRef } from "react";
import { changeEventStatus } from "@/app/actions";
import { EVENT_STATUSES } from "@/lib/taxonomy";

/** Badge colour per status: done is green, dead is muted, everything else warm. */
function tone(status: string): string {
  if (status === "Completed") return "border-good/40 bg-good-soft text-good";
  if (status === "Canceled" || status === "Lost") return "border-line bg-hairline text-faint";
  if (status === "Follow-Up Needed") return "border-bad/30 bg-bad-soft text-bad";
  return "border-accent/30 bg-accent-soft text-accent-deep";
}

export default function EventStatusPicker({ eventId, status, returnTo }: {
  eventId: number;
  status: string;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={changeEventStatus} className="relative shrink-0">
      <input type="hidden" name="id" value={eventId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {/* The select sits invisibly over the badge, so the badge itself is the
          control — native menu on mobile, no custom dropdown to maintain. */}
      <span
        className={`pointer-events-none inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone(status)}`}>
        {status}
        <svg viewBox="0 0 12 12" aria-hidden className="h-2.5 w-2.5 opacity-60">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <select
        name="status"
        defaultValue={status}
        aria-label="Change event status"
        title="Change status"
        onChange={() => formRef.current?.requestSubmit()}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {EVENT_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
      </select>
    </form>
  );
}
