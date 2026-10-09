// "What you'll get" — the sample neck EMG read-out shown on the public
// screening forms (/join/[token], screening and screening_slots).
//
// A drawn back of the neck with one result bar on each side of every cervical
// vertebra, C1–C7, coloured like the scanner's report. The bars grow out from
// the spine once on load (CSS only, no client JS); people who ask for reduced
// motion get them already drawn. Data and geometry live in lib/neck-scan.ts.
//
// The read-out is an illustration and says so ("Sample read-out").
import {
  neckScanRows, SCAN_LEVELS, FIGURE, VIEW, CENTER_X, VERTEBRA, type BarGeom, type ScanLevel,
} from "@/lib/neck-scan";

const LEVELS: ScanLevel[] = [0, 1, 2, 3];

const CSS = `
@keyframes ns-grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.ns-bar { transform-box: fill-box; animation: ns-grow .7s cubic-bezier(.2,.8,.2,1) both }
.ns-left { transform-origin: right center }
.ns-right { transform-origin: left center }
@media (prefers-reduced-motion: reduce) { .ns-bar { animation: none } }
`;

function Bar({ b }: { b: BarGeom }) {
  const s = SCAN_LEVELS[b.level];
  return (
    <rect
      className={`ns-bar ns-${b.side}`}
      style={{ animationDelay: `${(0.25 + b.index * 0.07).toFixed(2)}s` }}
      x={b.x} y={b.y} width={b.w} height={b.h} rx={2.5}
      fill={s.fill} stroke={s.stroke} strokeWidth={b.level === 0 ? 1.2 : 0}
    />
  );
}

export function NeckScanPreview() {
  const rows = neckScanRows();
  const f = FIGURE;

  return (
    <section className="px-5 pt-6 sm:px-6">
      <style>{CSS}</style>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#b45309]">What you&rsquo;ll get</p>
      <h2 className="mt-1 text-[1.15rem] font-bold leading-snug tracking-tight text-neutral-900">
        A neck scan, vertebra by vertebra
      </h2>

      <div className="relative mt-3 overflow-hidden rounded-2xl bg-[#f7ece3] ring-1 ring-[#efdccd]">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-white/85 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8a5240] ring-1 ring-[#ead6c8]">
          Sample read-out
        </span>
        <svg
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
          role="img"
          aria-label="Sample neck EMG read-out: a bar on the left and right of each vertebra from C1 to C7, coloured normal, mild, moderate or high."
          className="block h-auto w-full"
        >
          <defs>
            <linearGradient id="ns-skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e9c2a5" />
              <stop offset="1" stopColor="#ddb091" />
            </linearGradient>
            <radialGradient id="ns-shoulder" cx="0.5" cy="0" r="0.9">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#7a4632" stopOpacity="0.22" />
            </radialGradient>
            <linearGradient id="ns-hair" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a3128" />
              <stop offset="1" stopColor="#2c1d18" />
            </linearGradient>
            <linearGradient id="ns-spine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#9a5c45" stopOpacity="0" />
              <stop offset="0.5" stopColor="#9a5c45" stopOpacity="0.22" />
              <stop offset="1" stopColor="#9a5c45" stopOpacity="0" />
            </linearGradient>
            <filter id="ns-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* Figure */}
          <ellipse {...f.earLeft} fill="#dcab8c" />
          <ellipse {...f.earRight} fill="#dcab8c" />
          <path d={f.body} fill="url(#ns-skin)" />
          <path d={f.body} fill="url(#ns-shoulder)" />
          {f.shade.map((d) => <path key={d} d={d} fill="#9a5c45" opacity={0.18} filter="url(#ns-soft)" />)}
          <rect x={CENTER_X - 9} y={150} width={18} height={180} fill="url(#ns-spine)" />
          <path d={f.hair} fill="url(#ns-hair)" />
          {f.strands.map((d) => <path key={d} d={d} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={2} />)}

          {/* Read-out: left bar, right bar, vertebra label, readings at the edges */}
          {rows.map((r) => (
            <g key={r.vertebra}>
              <Bar b={r.left} />
              <Bar b={r.right} />
              <rect x={CENTER_X - VERTEBRA.w / 2} y={r.cy - VERTEBRA.h / 2} width={VERTEBRA.w} height={VERTEBRA.h}
                rx={4.5} fill="#fbf3ec" stroke="#c49580" strokeWidth={1} />
              <text x={CENTER_X} y={r.cy + 3.2} textAnchor="middle" fontSize={9} fontWeight={600} fill="#8a5240">{r.vertebra}</text>
              <text x={8} y={r.cy + 3.5} fontSize={10} fill="#8c7a70" className="tabular-nums">{r.left.value.toFixed(1)}</text>
              <text x={352} y={r.cy + 3.5} textAnchor="end" fontSize={10} fill="#8c7a70" className="tabular-nums">{r.right.value.toFixed(1)}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[0.75rem] text-neutral-600">
        {LEVELS.map((l) => {
          const s = SCAN_LEVELS[l];
          return (
            <span key={l} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-4 rounded-[3px]"
                style={{ background: s.fill, boxShadow: `inset 0 0 0 1.2px ${s.stroke}` }} />
              {s.label}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-[0.9rem] leading-relaxed text-neutral-600">
        Surface EMG sensors rest lightly on the skin &mdash; no needles &mdash; and measure muscle tension on each
        side of your neck, at every vertebra from <span className="font-semibold text-neutral-800">C1 to C7</span>.
        You&rsquo;ll see your own results right there, and we&rsquo;ll walk you through them.
      </p>
    </section>
  );
}
