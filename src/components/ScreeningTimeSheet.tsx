import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fmtSlotRange, fmtSlotTime } from "@/lib/screening";
import type { TimeSheet } from "@/lib/screening-intake";

/**
 * Who booked which 10-minute window on a "pick a time" screening form.
 *
 * One row per window, every seat shown: a booked seat is the person's name
 * (opening their lead), an open one says so. Shared by the campaign page and
 * the event page so both read the same sheet the same way.
 */
export default function ScreeningTimeSheet({ sheet, title = "Screening time sheet", subtitle, editHref }: {
  sheet: TimeSheet;
  title?: string;
  /** e.g. the campaign's name, linked, when shown on an event page. */
  subtitle?: React.ReactNode;
  editHref: string;
}) {
  const first = sheet.rows[0]?.start;
  const last = sheet.rows[sheet.rows.length - 1]?.start;

  return (
    <Card>
      <CardHeader title={title} action={
        <span className="text-xs font-medium text-soft">
          {sheet.booked} of {sheet.spots} spot{sheet.spots === 1 ? "" : "s"} booked
        </span>} />
      {subtitle && <div className="-mt-1.5 px-5 pb-2 text-sm">{subtitle}</div>}

      {sheet.rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-faint">
          No times set yet. <Link href={editHref} className="font-medium text-accent-deep hover:underline">Set the screening date and times</Link> to build the sheet.
        </p>
      ) : (
        <>
          <p className="px-5 pb-3 text-xs text-soft">
            {fmtDate(first)} · {fmtSlotTime(first)} – {fmtSlotRange(last).split("–")[1]} · {sheet.capacity} per window
          </p>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {sheet.rows.map((r) => (
              <li key={r.start} className="flex items-start gap-3 px-5 py-2">
                <span className="w-[6.5rem] shrink-0 pt-1 text-xs font-medium tabular-nums text-soft">{fmtSlotRange(r.start)}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {r.people.map((p) => (
                    <Link key={p.bookingId} href={`/leads/${p.leadId}`}
                      className="max-w-full truncate rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-deep transition-colors hover:bg-accent hover:text-white">
                      {p.name}{p.phone && <span className="font-normal opacity-75"> · {p.phone}</span>}
                    </Link>
                  ))}
                  {Array.from({ length: Math.max(0, sheet.capacity - r.people.length) }, (_, i) => (
                    <span key={i} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-faint">Open</span>
                  ))}
                  {r.people.length > sheet.capacity && (
                    <span className="px-1 py-1 text-xs font-medium text-bad">Over capacity</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {sheet.outside.length > 0 && (
        <div className="border-t border-hairline px-5 py-3">
          <p className="mb-1.5 text-xs font-medium text-bad">Booked at times no longer on this sheet</p>
          <div className="flex flex-wrap gap-1.5">
            {sheet.outside.map((p) => (
              <Link key={p.bookingId} href={`/leads/${p.leadId}`}
                className="rounded-full bg-bad-soft px-2.5 py-1 text-xs font-medium text-bad hover:underline">
                {fmtDate(p.start)} {fmtSlotRange(p.start)} · {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
