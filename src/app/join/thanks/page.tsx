import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/dates";
import { fmtSlotRange } from "@/lib/screening";

export const metadata = { title: "Thanks! · Illumin8 Chiropractic" };

// The general contact form isn't a sign-up to be scheduled, and a screening
// sign-up may come with a booked time, so each gets its own wording. Every
// other form keeps the original copy.
const COPY = {
  signup: {
    title: "You're on the list!",
    body: "Thanks for signing up — someone from Illumin8 Chiropractic will reach out shortly to get you scheduled.",
  },
  contact: {
    title: "Thanks — we got it!",
    body: "Someone from Illumin8 Chiropractic will be in touch soon.",
  },
  screening: {
    title: "You're signed up!",
    body: "Thanks — someone from Illumin8 Chiropractic will be in touch with your screening details.",
  },
  waitlist: {
    title: "You're on the waitlist",
    body: "Every screening time was taken, so we've added you to the waitlist. We'll reach out if a spot opens up.",
  },
} as const;

/** Only a well-formed window start is ever shown back — the URL is not trusted. */
const SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/;

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ f?: string; t?: string; w?: string }> }) {
  const { f, t, w } = await searchParams;
  const slot = f === "screening" && t && SLOT.test(t) ? t : null;
  const copy = f === "contact" ? COPY.contact
    : f === "screening" ? (w === "1" ? COPY.waitlist : COPY.screening)
    : COPY.signup;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        {slot ? (
          <p className="mt-2 text-sm text-soft">
            Your screening time is <strong className="font-semibold text-ink">{fmtDate(slot)} · {fmtSlotRange(slot)}</strong>.
            We&rsquo;ll see you there!
          </p>
        ) : (
          <p className="mt-2 text-sm text-soft">{copy.body}</p>
        )}
      </div>
    </div>
  );
}
