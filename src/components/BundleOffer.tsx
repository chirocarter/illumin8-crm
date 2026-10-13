// The "$50 for 2 visits" offer card on the "Learn More or Book $50" form
// (/join/[token], form type `bundle`).
//
// A price block ($50, regularly $97) over two visit tiles, each with a small
// drawing: a thermal-camera scan of the back for visit 1, an EMG-style results
// report with a check for visit 2. Plain SVG and CSS — no images to load, no
// client JS. The scan line sweeps a few times on load; reduced-motion visitors
// get a still picture. Words live in lib/bundle-offer.ts.
import { ABOUT_ILLUMIN8, BUNDLE_OFFER } from "@/lib/bundle-offer";

const CSS = `
@keyframes bo-scan { 0% { transform: translateY(-6px); opacity: 0 } 15% { opacity: .9 } 85% { opacity: .9 } 100% { transform: translateY(84px); opacity: 0 } }
.bo-scan { animation: bo-scan 2.4s ease-in-out .4s 3 both }
@media (prefers-reduced-motion: reduce) { .bo-scan { animation: none; opacity: 0 } }
`;

// Back, neck and shoulders on a 120×80 canvas; the spine runs down x = 60.
const TORSO = "M50 2 H70 V15 C70 21 78 25 92 28 C106 31 114 38 116 48 V80 H4 V48 C6 38 14 31 28 28 C42 25 50 21 50 15 Z";

/** Visit 1: what a thermal scan of the back looks like. */
function ScanArt() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="block h-auto w-full">
      <defs>
        <linearGradient id="bo-cool" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a8f" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <radialGradient id="bo-hot">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.25" stopColor="#f97316" />
          <stop offset="0.6" stopColor="#ef4444" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bo-warm">
          <stop offset="0" stopColor="#facc15" />
          <stop offset="0.55" stopColor="#22c55e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bo-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0" />
          <stop offset="0.5" stopColor="#a5f3fc" />
          <stop offset="1" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
        <clipPath id="bo-torso"><path d={TORSO} /></clipPath>
      </defs>
      <rect width="120" height="80" fill="#0b1026" />
      <path d={TORSO} fill="url(#bo-cool)" />
      <g clipPath="url(#bo-torso)">
        <circle cx="60" cy="24" r="17" fill="url(#bo-hot)" />
        <circle cx="38" cy="38" r="13" fill="url(#bo-warm)" />
        <circle cx="76" cy="60" r="15" fill="url(#bo-hot)" opacity="0.8" />
        <circle cx="86" cy="36" r="10" fill="url(#bo-warm)" />
      </g>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x="57.5" y={6 + i * 8} width="5" height="5.5" rx="1.6" fill="#ffffff" opacity="0.55" />
      ))}
      <rect className="bo-scan" x="0" y="0" width="120" height="2.5" fill="url(#bo-beam)" />
    </svg>
  );
}

/** Visit 2: a results report — left/right readings per level, and a check. */
function PlanArt() {
  const rows: [number, string, number, string][] = [
    [18, "#e7e2df", 26, "#3f9d6b"],
    [30, "#df4b3f", 16, "#3d6fd6"],
    [14, "#e7e2df", 34, "#df4b3f"],
    [22, "#3f9d6b", 12, "#e7e2df"],
  ];
  return (
    <svg viewBox="0 0 120 80" aria-hidden className="block h-auto w-full">
      <rect width="120" height="80" fill="#fdf3e3" />
      <rect x="22" y="8" width="76" height="68" rx="6" fill="#ffffff" stroke="#efdccd" />
      <rect x="32" y="15" width="34" height="4" rx="2" fill="#d6c3b6" />
      <rect x="32" y="22" width="20" height="3" rx="1.5" fill="#eadbd0" />
      {rows.map(([l, lc, r, rc], i) => (
        <g key={i}>
          <rect x={60 - 3 - l} y={33 + i * 9} width={l} height="5" rx="2" fill={lc} />
          <rect x="57.5" y={33 + i * 9} width="5" height="5" rx="1.5" fill="#c49580" />
          <rect x={63} y={33 + i * 9} width={r} height="5" rx="2" fill={rc} />
        </g>
      ))}
      <circle cx="92" cy="66" r="11" fill="#16a34a" stroke="#ffffff" strokeWidth="2.5" />
      <path d="M87 66.5 l3.4 3.4 l6.6 -7" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const Check = () => (
  <svg viewBox="0 0 16 16" aria-hidden className="mt-[0.15rem] h-3 w-3 shrink-0 text-[#d97706]">
    <path d="M3 8.5l3 3 7-7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function BundleGraphic() {
  const o = BUNDLE_OFFER;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#fff7ed] via-[#fdf3e3] to-[#fde8e4] p-4 ring-1 ring-[#f3dcc7]">
      <style>{CSS}</style>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#b45309]">New-patient bundle</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="sr-only">Regularly ${o.regularPrice}, now </span>
            <span className="bg-gradient-to-br from-brand-from to-brand-to bg-clip-text text-[2.6rem] font-extrabold leading-none tracking-tight text-transparent">
              ${o.price}
            </span>
            <span aria-hidden className="text-base font-semibold text-neutral-400 line-through decoration-2">${o.regularPrice}</span>
          </p>
        </div>
        <span className="mb-1 rounded-full bg-white/85 px-2.5 py-1 text-[0.7rem] font-semibold text-[#b45309] ring-1 ring-[#f3dcc7]">
          {o.visits.length} visits
        </span>
      </div>

      <ol className="relative mt-4 grid grid-cols-2 gap-2.5">
        {o.visits.map((v, i) => (
          <li key={v.title} className="min-w-0 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
            <div className="overflow-hidden rounded-lg">{i === 0 ? <ScanArt /> : <PlanArt />}</div>
            <p className="mt-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#b45309]">Visit {i + 1}</p>
            <p className="text-[0.92rem] font-bold leading-tight text-neutral-900">{v.title}</p>
            <ul className="mt-1.5 space-y-1">
              {v.items.map((item) => (
                <li key={item} className="flex gap-1.5 text-[0.75rem] leading-snug text-neutral-600"><Check />{item}</li>
              ))}
            </ul>
          </li>
        ))}
        {/* The hop from the first visit to the second. */}
        <span aria-hidden className="absolute left-1/2 top-9 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-white text-sm font-bold text-[#d97706] shadow ring-1 ring-black/5">
          →
        </span>
      </ol>
    </div>
  );
}

/**
 * Option 2's opening: what Illumin8 does, to hold people over until someone
 * reaches out. The contact form follows it on the page. Anchor: #learn.
 */
export function LearnMoreIntro() {
  const a = ABOUT_ILLUMIN8;
  return (
    <section id="learn" className="scroll-mt-4 px-5 pt-6 sm:px-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#b45309]">Option 2 · Learn more first</p>
      <h2 className="mt-1 text-[1.15rem] font-bold leading-snug tracking-tight text-neutral-900">
        Not ready to book? We&rsquo;ll reach out.
      </h2>

      <div className="mt-3 rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200/70">
        <p className="text-[0.95rem] font-semibold text-neutral-900">{a.tagline}</p>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-neutral-600">{a.summary}</p>

        <ol className="mt-3 space-y-2.5">
          {a.steps.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-from to-brand-to text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.85rem] font-semibold leading-tight text-neutral-900">{st.title}</span>
                <span className="block text-[0.8rem] leading-snug text-neutral-600">{st.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-3.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-neutral-500">We help with</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {a.helpsWith.map((h) => (
            <span key={h} className="rounded-full bg-white px-2.5 py-1 text-[0.75rem] font-medium text-neutral-700 ring-1 ring-neutral-200">{h}</span>
          ))}
        </div>
        <p className="mt-3 text-[0.78rem] text-neutral-500">{a.insurance}</p>
      </div>

      <p className="mt-4 text-[0.9rem] text-neutral-700">Leave your details and someone from our team will reach out.</p>
    </section>
  );
}
