// PUBLIC page — what people see when they scan a campaign QR code. No login,
// mobile-first, styled like a mini landing page. Six form variants:
//   patient      → new-patient sign-up (lead)
//   partnership  → a business that wants to partner (account + contact + lead)
//   lunch        → a business interested in a lunch & learn (account + contact + lead)
//   contact      → general contact: name, phone, email, "already a patient?",
//                  optional question (lead)
//   screening    → "yes, I'll take part in the spinal health screening at
//                  <event>": name, phone, email, current symptoms (lead)
//   screening_slots → the same, plus one 10-minute window (lead + booking on
//                  the campaign's time sheet); a waitlist when every window is full
//
// Both screening forms open with a sample neck EMG read-out (NeckScanPreview)
// so people see what the screening is before they sign up.
//
// LAYOUT RULES, both learned on real phones:
//   • On a phone the form fills the screen edge to edge. The floating card with
//     gutters only appears from the sm breakpoint up, where there is room for it.
//   • Every field is 16px text. iPhone Safari zooms in on focus for anything
//     smaller, which pushes the page wider than the screen and makes it scroll
//     side to side — the exact thing this page must never do.
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { Icon } from "@/components/icons";
import { NeckScanPreview } from "@/components/NeckScanPreview";
import {
  normalizePublicForm, isScreeningForm, PARTNERSHIP_INTERESTS, SCREENING_SYMPTOMS, type PublicFormType,
} from "@/lib/taxonomy";
import { screeningState, type ScreeningState } from "@/lib/screening-intake";
import { fmtSlotTime, SCREENING_SLOT_MINUTES } from "@/lib/screening";
import { fmtDate } from "@/lib/dates";
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
  contact: {
    headline: "Get in touch",
    sub: "Leave your details and someone from our team will reach out.",
    cta: "Send",
    privacy: "We'll only use this to get back to you. No spam.",
  },
  // Screening subs are replaced with the event's own name when there is one.
  screening: {
    headline: "Spinal Health Screening",
    sub: "Sign up for our upcoming screening — it takes a minute.",
    cta: "Count me in",
    privacy: "We'll only use this to plan your screening and follow up. No spam.",
  },
  screening_slots: {
    headline: "Spinal Health Screening",
    sub: "Pick a time for your screening — it takes a minute.",
    cta: "Reserve my time",
    privacy: "We'll only use this to plan your screening and follow up. No spam.",
  },
};

// text-base (16px) is load-bearing, not a style choice: below 16px iPhone
// Safari zooms the page on focus and the form starts scrolling sideways.
const inputCls =
  "block w-full min-w-0 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-shadow placeholder:text-neutral-400 focus:border-[#d97706] focus:ring-2 focus:ring-[#fdf3e3]";
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

  const isContact = formType === "contact";
  const isScreening = isScreeningForm(formType);
  const screening: ScreeningState | null = isScreening ? await screeningState(campaign) : null;
  const windows = screening?.windows ?? [];
  const openWindows = windows.filter((w) => !w.full).length;
  // Every window taken: still take their details, as a waitlist.
  const waitlist = formType === "screening_slots" && windows.length > 0 && openWindows === 0;
  const eventName = screening?.event?.name ?? null;

  const chips = isScreening
    ? [
        ...(screening?.date ? [fmtDate(screening.date)] : []),
        ...(screening?.event?.locationText ? [screening.event.locationText.slice(0, 40)] : []),
        windows.length ? `${SCREENING_SLOT_MINUTES}-minute times` : "Takes 1 minute",
      ]
    : isContact
    ? ["Takes 30 seconds", "No spam"]
    : [
        `${locations.length} ABQ location${locations.length === 1 ? "" : "s"}`,
        "2-minute sign-up",
        "No spam",
      ];
  const sub = isScreening && eventName ? `at ${eventName}` : cfg.sub;
  const errorText =
    error === "slot" ? "Sorry — that time was just taken. Please pick another."
    : error === "pick" ? "Please pick a time for your screening."
    : isScreening ? "Please confirm you'd like to take part, and add your first and last name and a phone number."
    : isContact ? "Please add your first name and a phone number."
    : isBusiness ? "Please add your business name, your name, and a phone number or email."
    : "Please add your name and a phone number or email.";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-white sm:flex sm:items-start sm:justify-center sm:bg-gradient-to-b sm:from-[#fff7ed] sm:to-[#f4f4f5] sm:px-4 sm:py-8">
      <div className="min-h-screen w-full overflow-hidden bg-white sm:min-h-0 sm:max-w-md sm:rounded-[1.75rem] sm:shadow-[0_10px_40px_-8px_rgba(180,83,9,0.25)]">
        {/* Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-from to-brand-to px-6 pb-8 pt-9 text-center text-white">
          <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-white/20 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-black/10 blur-2xl" />
          <span className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur-sm">
            <Icon name="sunrise" className="h-8 w-8" />
          </span>
          <p className="relative text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/85">Illumin8 Chiropractic</p>
          <h1 className="relative mx-auto mt-2 max-w-xs break-words text-[1.55rem] font-bold leading-[1.15] tracking-tight">{headline}</h1>
          <p className="relative mx-auto mt-2.5 max-w-xs break-words text-sm text-white/90">{sub}</p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-medium ring-1 ring-white/25">{c}</span>
            ))}
          </div>
        </div>

        {/* Screening forms show what the screening is before asking for a yes. */}
        {isScreening && !screening?.closed && <NeckScanPreview />}

        {screening?.closed ? (
          <div className="px-6 pb-10 pt-8 text-center">
            <p className="text-base font-semibold text-neutral-900">
              {screening.closed === "canceled" ? "This screening was canceled." : "This screening has already taken place."}
            </p>
            <p className="mt-1.5 text-sm text-neutral-500">Sign-ups are closed. Thanks for your interest!</p>
          </div>
        ) : (
        /* Form */
        <form action={submitPublicLead} className="space-y-3.5 px-5 pb-8 pt-6 sm:px-6 sm:pb-7">
          <input type="hidden" name="token" value={token} />
          {/* honeypot — hidden from humans */}
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          {/* Screening forms open with the yes they're giving. Required. */}
          {isScreening && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors has-checked:border-[#d97706] has-checked:bg-[#fdf3e3]">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#d97706]" />
              <span className="text-[0.95rem] text-neutral-800">
                Yes — I&rsquo;d like to take part in the spinal health screening
                {eventName ? <> at <strong className="font-semibold">{eventName}</strong></> : " you're holding"}.
              </span>
            </label>
          )}

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
              <span className={labelCls}>{isScreening ? "Last name *" : "Last name"}</span>
              <input name="lastName" required={isScreening} className={inputCls} autoComplete="family-name" />
            </label>
          </div>

          {isBusiness && (
            <label className="block">
              <span className={labelCls}>Your role</span>
              <input name="role" className={inputCls} placeholder="Owner, HR, office manager…" autoComplete="organization-title" />
            </label>
          )}

          {/* Stacked on a phone: side by side, an email address has ~140px. */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-3">
            <label className="block">
              <span className={labelCls}>{isContact || isScreening ? "Phone *" : "Phone"}</span>
              <input name="phone" type="tel" required={isContact || isScreening} inputMode="tel"
                className={inputCls} autoComplete="tel" placeholder="(505) 555-0123" />
            </label>
            <label className="block">
              <span className={labelCls}>Email</span>
              <input name="email" type="email" inputMode="email" className={inputCls} autoComplete="email" />
            </label>
          </div>

          {/* The whole row is the tap target, not just the 20px box. */}
          {isContact && (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors has-checked:border-[#d97706] has-checked:bg-[#fdf3e3]">
              <input type="checkbox" name="existingPatient" value="yes" className="h-5 w-5 shrink-0 accent-[#d97706]" />
              <span className="text-[0.95rem] text-neutral-800">I&rsquo;m already an Illumin8 patient</span>
            </label>
          )}

          {isContact && (
            <label className="block">
              <span className={labelCls}>Questions or comments (optional)</span>
              <textarea name="message" rows={3} maxLength={1000} className={inputCls}
                placeholder="Anything you'd like us to know?" />
            </label>
          )}

          {isScreening && (
            <fieldset>
              <legend className={labelCls}>Are you dealing with any of these right now? (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {SCREENING_SYMPTOMS.map((sym) => (
                  <label key={sym} className="cursor-pointer">
                    <input type="checkbox" name="symptom" value={sym} className="peer sr-only" />
                    <span className="block rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 transition-colors peer-checked:border-[#d97706] peer-checked:bg-[#fdf3e3] peer-checked:text-[#b45309] peer-focus-visible:ring-2 peer-focus-visible:ring-[#fdf3e3]">
                      {sym}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {formType === "screening_slots" && windows.length > 0 && (waitlist ? (
            <p className="rounded-xl bg-[#fef7e8] px-3.5 py-2.5 text-sm text-[#b45309]">
              Every time is taken right now. Leave your details and we&rsquo;ll add you to the waitlist.
            </p>
          ) : (
            <fieldset>
              <legend className={labelCls}>Pick a {SCREENING_SLOT_MINUTES}-minute time *</legend>
              <p className="-mt-0.5 mb-2 text-xs text-neutral-500">
                {screening?.date ? `${fmtDate(screening.date)} · ` : ""}{openWindows} of {windows.length} times open
              </p>
              <div className="grid grid-cols-3 gap-2">
                {windows.map((w) => (
                  <label key={w.start} className={w.full ? "cursor-not-allowed" : "cursor-pointer"}>
                    <input type="radio" name="slot" value={w.start} required disabled={w.full} className="peer sr-only" />
                    <span className="block rounded-xl border border-neutral-200 bg-white px-1 py-2 text-center text-sm font-medium text-neutral-800 transition-colors peer-checked:border-[#d97706] peer-checked:bg-[#fdf3e3] peer-checked:text-[#b45309] peer-focus-visible:ring-2 peer-focus-visible:ring-[#fdf3e3] peer-disabled:border-neutral-100 peer-disabled:bg-neutral-50 peer-disabled:text-neutral-400">
                      {fmtSlotTime(w.start)}
                      {w.full && <span className="block text-[0.65rem] font-normal">Full</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

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
            <p className="rounded-xl bg-[#fef1f1] px-3.5 py-2.5 text-sm font-medium text-[#dc2626]">{errorText}</p>
          )}

          <button type="submit"
            className="w-full rounded-full bg-[#d97706] py-3.5 text-[0.95rem] font-semibold text-white shadow-sm transition-all hover:bg-[#b45309] active:scale-[0.99]">
            {waitlist ? "Join the waitlist" : cfg.cta}
          </button>
          <p className="pt-0.5 text-center text-xs text-neutral-400">{cfg.privacy}</p>
        </form>
        )}
      </div>
    </div>
  );
}
