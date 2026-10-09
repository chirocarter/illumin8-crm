"use client";

// The campaign form's "QR sign-up form" picker, plus the settings the two
// screening intake forms need. A client component only so those settings can
// appear (and become required) the moment a screening form is picked; the
// server re-validates everything in actions.ts.
import { useEffect, useRef, useState } from "react";
import { Field, inputCls, selectCls } from "@/components/ui";
import { PUBLIC_FORM_TYPES, type PublicFormType } from "@/lib/taxonomy";
import { screeningSlots, SCREENING_SLOT_MINUTES, MAX_SLOT_CAPACITY } from "@/lib/screening";

export type ScreeningEventOption = { id: number; label: string; startsAt: string | null; endsAt: string | null };

export default function PublicFormSettings({ initial, events, error }: {
  initial: {
    publicForm: PublicFormType;
    eventId: number | null;
    slotDate: string; slotStartTime: string; slotEndTime: string; slotCapacity: number;
  };
  events: ScreeningEventOption[];
  error?: string;
}) {
  const [form, setForm] = useState<PublicFormType>(initial.publicForm);
  const [eventId, setEventId] = useState(initial.eventId ? String(initial.eventId) : "");
  const [date, setDate] = useState(initial.slotDate);
  const [start, setStart] = useState(initial.slotStartTime);
  const [end, setEnd] = useState(initial.slotEndTime);
  const [capacity, setCapacity] = useState(String(initial.slotCapacity));

  const screening = form === "screening" || form === "screening_slots";
  const slotsForm = form === "screening_slots";
  const hint = PUBLIC_FORM_TYPES.find((t) => t.value === form)?.hint;
  const windows = date && start && end ? screeningSlots(`${date}T${start}:00`, `${date}T${end}:00`).length : 0;
  const people = windows * (Number(capacity) || 0);

  // An end time that leaves no room for a window can't be expressed with
  // min/max on a time input, so the browser is told directly — it then blocks
  // the submit with this message, the same way it does for a blank field.
  const endRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.setCustomValidity(
      date && start && end && windows === 0
        ? `The last window must end at least ${SCREENING_SLOT_MINUTES} minutes after the first one starts.`
        : "",
    );
  }, [date, start, end, windows]);

  // Picking an event fills in any blank date/time from it. Never overwrites
  // what someone already typed.
  function pickEvent(id: string) {
    setEventId(id);
    const ev = events.find((e) => String(e.id) === id);
    if (!ev?.startsAt) return;
    if (!date) setDate(ev.startsAt.slice(0, 10));
    const t = ev.startsAt.slice(11, 16);
    if (!start && t && t !== "00:00") setStart(t);
    if (!end && ev.endsAt && ev.endsAt.slice(0, 10) === ev.startsAt.slice(0, 10)) setEnd(ev.endsAt.slice(11, 16));
  }

  return (
    <>
      <Field label="QR sign-up form" className="md:col-span-2" hint={hint}>
        <select name="publicForm" value={form} onChange={(e) => setForm(e.target.value as PublicFormType)} className={selectCls}>
          {PUBLIC_FORM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      {screening && (
        <div className="md:col-span-2 rounded-2xl border border-line bg-hover p-4">
          <p className="mb-3 text-[0.8rem] font-semibold text-ink">Screening settings</p>
          {error && (
            <p className="mb-3 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">{error}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Screening event" className="md:col-span-2"
              hint="Its name, date and place head the form, and its page shows everyone who signs up.">
              <select name="eventId" value={eventId} onChange={(e) => pickEvent(e.target.value)} className={selectCls}>
                <option value="">Not tied to an event — the form says “our upcoming screening”</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </Field>

            {slotsForm && (
              <>
                <Field label="Screening date">
                  <input name="slotDate" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label="People per window" hint="How many people you can screen at once.">
                  <input name="slotCapacity" type="number" required min={1} max={MAX_SLOT_CAPACITY} step={1}
                    value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
                </Field>
                <Field label="First window starts">
                  <input name="slotStartTime" type="time" required step={60} value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Last window ends">
                  <input ref={endRef} name="slotEndTime" type="time" required step={60} value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
                </Field>
                <p className="text-xs text-soft md:col-span-2">
                  {windows > 0
                    ? `${windows} windows of ${SCREENING_SLOT_MINUTES} minutes · room for up to ${people} ${people === 1 ? "person" : "people"}.`
                    : `Set a date and a start and end time at least ${SCREENING_SLOT_MINUTES} minutes apart.`}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
