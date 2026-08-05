"use client";

// The status badge on an event card, made changeable in place. Picking a status
// submits immediately — one gesture, no edit form — and the server records the
// change as an activity so the history explains itself.
//
// A native <select> was used here first: it rendered the OS menu, which looks
// nothing like the rest of the app. This is a styled popover instead.
import { useEffect, useRef, useState } from "react";
import { changeEventStatus } from "@/app/actions";
import { EVENT_STATUSES } from "@/lib/taxonomy";

/** Badge colour per status: done is green, dead is muted, everything else warm. */
function tone(status: string): string {
  if (status === "Completed") return "border-good/40 bg-good-soft text-good";
  if (status === "Canceled" || status === "Lost") return "border-line bg-hairline text-faint";
  if (status === "Follow-Up Needed") return "border-bad/30 bg-bad-soft text-bad";
  return "border-accent/30 bg-accent-soft text-accent-deep";
}

/** The dot beside each option in the menu, so colour reads before the word. */
function dot(status: string): string {
  if (status === "Completed") return "bg-good";
  if (status === "Canceled" || status === "Lost") return "bg-faint";
  if (status === "Follow-Up Needed") return "bg-bad";
  return "bg-accent";
}

export default function EventStatusPicker({ eventId, status, returnTo }: {
  eventId: number;
  status: string;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef<HTMLInputElement>(null);

  // Close on outside click or Escape — a menu that traps you is worse than none.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    setOpen(false);
    if (next === status) return;          // nothing changed — don't log an activity
    if (pendingRef.current) pendingRef.current.value = next;
    formRef.current?.requestSubmit();
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <form ref={formRef} action={changeEventStatus}>
        <input type="hidden" name="id" value={eventId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input ref={pendingRef} type="hidden" name="status" defaultValue={status} />
      </form>

      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox" aria-expanded={open} title="Change status"
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all hover:shadow-sm active:scale-[0.97] ${tone(status)}`}>
        {status}
        <svg viewBox="0 0 12 12" aria-hidden
          className={`h-2.5 w-2.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        // right-0 so it never runs off the card's right edge on a narrow screen
        <div role="listbox"
          className="rise absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lift">
          {EVENT_STATUSES.map((st) => (
            <button key={st} type="button" role="option" aria-selected={st === status}
              onClick={() => choose(st)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.8rem] transition-colors hover:bg-hairline ${
                st === status ? "font-semibold text-ink" : "text-soft"
              }`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot(st)}`} />
              {st}
              {st === status && <span className="ml-auto text-[0.7rem] text-faint">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
