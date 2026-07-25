import { Icon } from "@/components/icons";

export const metadata = { title: "Thanks! · Illumin8 Chiropractic" };

export default function ThanksPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re on the list!</h1>
        <p className="mt-2 text-sm text-soft">
          Thanks for signing up — someone from Illumin8 Chiropractic will reach out shortly to get you scheduled.
        </p>
      </div>
    </div>
  );
}
