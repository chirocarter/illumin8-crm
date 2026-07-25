import Link from "next/link";
import { addDays, fmtDateLong, thisWeekRange } from "@/lib/dates";
import { pillSm } from "./ui";

/** Week navigation for reports: prev / this / next week + visible range. */
export default function RangeNav({ basePath, from, to }: { basePath: string; from: string; to: string }) {
  const thisWeek = thisWeekRange();
  const prev = { from: addDays(from, -7), to: addDays(to, -7) };
  const next = { from: addDays(from, 7), to: addDays(to, 7) };
  const link = (r: { from: string; to: string }) => `${basePath}?from=${r.from}&to=${r.to}`;
  const isThisWeek = from === thisWeek.from && to === thisWeek.to;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={link(prev)} className={pillSm}>← Previous week</Link>
      <Link href={link(thisWeek)}
        className={isThisWeek ? pillSm + " !bg-ink !text-canvas" : pillSm}>
        This week
      </Link>
      <Link href={link(next)} className={pillSm}>Next week →</Link>
      <span className="ml-2 text-sm text-soft">{fmtDateLong(from)} – {fmtDateLong(to)}</span>
    </div>
  );
}
