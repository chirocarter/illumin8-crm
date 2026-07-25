// PUBLIC page — what people see when they scan a campaign QR code. No login,
// mobile-first, styled like a mini landing page. Three form variants:
//   patient      → new-patient sign-up (lead)
//   partnership  → a business that wants to partner (account + contact + lead)
//   lunch        → a business interested in a lunch & learn (account + contact + lead)
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { Icon } from "@/components/icons";
import { normalizePublicForm, PARTNERSHIP_INTERESTS, type PublicFormType } from "@/lib/taxonomy";
import { submitPublicLead } from "./actions";

export const metadata = { title: "Illumin8 Chiropractic" };
export const dynamic = "force-dynamic";

const EMPLOYEE_RANGES = ["1–5", "6–15", "16–50", "50+"];
const TIMEFRAMES = ["This month", "Next 1–2 months", "Just exploring"];

const CONFIG: Record<PublicFormType, { headline: string; sub: string; cta: string; privacy: string }> = {
  patient: {
    headline: "Book your first visit",
    sub: "Leave your details and we'll reach out to get you scheduled.",
    cta: "Sign me up",
    privacy: "We'll only use this to contact you about your visit. No spam.",
  },
  partnership: {
    headline: "Let's partner up",
    sub: "Tell us about your business — we'll find the right fit together.",
    cta: "Start the conversation",
    privacy: "We'll only use this to reach out about partnering. No spam.",
  },
  lunch: {
    headline: "Bring a lunch & learn to your team",
    sub: "A free, catered wellness session for your workplace.",
    cta: "Count us in",
    privacy: "We'll only use this to plan your lunch & learn. No spam.",
  },
};

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[0.95rem] text-neutral-900 outline-none transition-shadow placeholder:text-neutral-400 focus:border-[#d97706] focus:ring-2 focus:ring-[#fdf3e3]";
const labelCls = "mb-1.5 block text-[0.8rem] font-medium text-neutral-500";

export default async function JoinPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const campaign = await db.query.campaigns.findFirst({ where: eq(s.campaigns.publicToken, token) });
  if (!campaign || campaign.status === "Completed") notFound();

  const formType = normalizePublicForm(campaign.publicForm);
  const isBusiness = formType === "partnership" || formType === "lunch";
  const cfg = CONFIG[formType];
  const locations = await db.query.locations.findMany({ where: eq(s.locations.active, true) });
  // The patient form is used across many channels (gyms, restaurants, events),
  // so it keeps a clean universal title. Business forms lead with the campaign's
  // offer line ("Drop a card, win team lunch"), which is written as a headline.
  const headline = isBusiness ? (campaign.offer?.trim() || cfg.headline) : cfg.headline;

  const chips = [
    `${locations.length} ABQ location${locations.length === 1 ? "" : "s"}`,
    "2-minute sign-up",
    "No spam",
  ];

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-b from-[#fff7ed] to-[#f4f4f5] px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-[0_10px_40px_-8px_rgba(180,83,9,0.25)]">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-from to-brand-to px-6 pb-8 pt-9 text-center text-white">
          <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-white/20 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-black/10 blur-2xl" />
          <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur-sm">
            <Icon name="sunrise" className="h-8 w-8" />
          </span>
          <p className="relative text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/85">Illumin8 Chiropractic</p>
          <h1 className="relative mx-auto mt-2 max-w-xs text-[1.55rem] font-bold leading-[1.15] tracking-tight">{headline}</h1>
          <p className="relative mx-auto mt-2.5 max-w-xs text-sm text-white/90">{cfg.sub}</p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-medium ring-1 ring-white/25">{c}</span>
            ))}
          </div>
        </div>

        {/* Form */}
        <form action={submitPublicLead} className="space-y-3.5 px-6 pb-7 pt-6">
          <input type="hidden" name="token" value={token} />
          {/* honeypot — hidden from humans */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          {isBusiness && (
            <label className="block">
              <span className={labelCls}>Business name *</span>
              <input name="businessName" required className={inputCls} autoComplete="organization" placeholder="e.g. Zia Title & Escrow" />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{isBusiness ? "Your first name *" : "First name *"}</span>
              <input name="firstName" required className={inputCls} autoComplete="given-name" />
            </label>
            <label className="block">
              <span className={labelCls}>Last name</span>
              <input name="lastName" className={inputCls} autoComplete="family-name" />
            </label>
          </div>

          {isBusiness && (
            <label className="block">
              <span className={labelCls}>Your role</span>
              <input name="role" className={inputCls} placeholder="Owner, HR, office manager…" autoComplete="organization-title" />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Phone</span>
              <input name="phone" type="tel" className={inputCls} autoComplete="tel" placeholder="(505) 555-0123" />
            </label>
            <label className="block">
              <span className={labelCls}>Email</span>
              <input name="email" type="email" className={inputCls} autoComplete="email" />
            </label>
          </div>

          {formType === "patient" && (
            <label className="block">
              <span className={labelCls}>Preferred location</span>
              <select name="preferredLocationId" defaultValue="" className={inputCls}>
                <option value="">No preference</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}

          {formType === "partnership" && (
            <>
              <div>
                <span className={labelCls}>What kind of partnership interests you?</span>
                <div className="flex flex-wrap gap-2">
                  {PARTNERSHIP_INTERESTS.map((i) => (
                    <label key={i} className="cursor-pointer">
                      <input type="checkbox" name="interest" value={i} className="peer sr-only" />
                      <span className="block rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors peer-checked:border-[#d97706] peer-checked:bg-[#fdf3e3] peer-checked:text-[#b45309] peer-focus-visible:ring-2 peer-focus-visible:ring-[#fdf3e3]">
                        {i}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className={labelCls}>Anything else? (optional)</span>
                <textarea name="message" rows={2} className={inputCls} placeholder="Tell us a bit about what you have in mind…" />
              </label>
            </>
          )}

          {formType === "lunch" && (
            <>
              <label className="block">
                <span className={labelCls}>How many people on your team?</span>
                <select name="employees" defaultValue="" className={inputCls}>
                  <option value="">Select…</option>
                  {EMPLOYEE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>Room for a catered session? (break / conference room)</span>
                <select name="meetingSpace" defaultValue="" className={inputCls}>
                  <option value="">Select…</option>
                  <option>Yes</option>
                  <option>No</option>
                  <option>Not sure</option>
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>When works? (optional)</span>
                <select name="timeframe" defaultValue="" className={inputCls}>
                  <option value="">Select…</option>
                  {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </>
          )}

          {error && (
            <p className="rounded-xl bg-[#fef1f1] px-3.5 py-2.5 text-sm font-medium text-[#dc2626]">
              {isBusiness
                ? "Please add your business name, your name, and a phone number or email."
                : "Please add your name and a phone number or email."}
            </p>
          )}

          <button type="submit"
            className="w-full rounded-full bg-[#d97706] py-3.5 text-[0.95rem] font-semibold text-white shadow-sm transition-all hover:bg-[#b45309] active:scale-[0.99]">
            {cfg.cta}
          </button>
          <p className="pt-0.5 text-center text-xs text-neutral-400">{cfg.privacy}</p>
        </form>
      </div>
    </div>
  );
}
