import { Icon } from "@/components/icons";

export const metadata = { title: "Thanks! · Illumin8 Chiropractic" };

// The general contact form isn't a sign-up to be scheduled, so it gets its own
// wording. Every other form keeps the original copy.
const COPY = {
  signup: {
    title: "You're on the list!",
    body: "Thanks for signing up — someone from Illumin8 Chiropractic will reach out shortly to get you scheduled.",
  },
  contact: {
    title: "Thanks — we got it!",
    body: "Someone from Illumin8 Chiropractic will be in touch soon.",
  },
} as const;

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const copy = f === "contact" ? COPY.contact : COPY.signup;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-soft">{copy.body}</p>
      </div>
    </div>
  );
}
