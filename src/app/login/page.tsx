import { login } from "./actions";
import { Icon } from "@/components/icons";
import { inputCls } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="relative w-full max-w-sm">
        {/* soft brand glow behind the mark */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/4 rounded-full bg-accent/15 blur-3xl" />
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-lift">
            <Icon name="sunrise" className="h-7 w-7" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Illumin8 Outreach</h1>
          <p className="mt-1 text-sm text-soft">Community outreach command center</p>
        </div>
        <form action={login} className="space-y-3 rounded-card bg-card p-6 shadow-card">
          <label className="block">
            <span className="mb-1.5 block text-[0.8rem] font-medium text-soft">Email</span>
            <input name="email" type="email" required autoComplete="email"
              defaultValue="carter@illumin8chiro.com" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.8rem] font-medium text-soft">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </label>
          {error && <p className="text-sm text-bad">Incorrect email or password.</p>}
          <button type="submit"
            className="w-full rounded-full bg-ink py-3 text-sm font-semibold text-canvas shadow-sm transition-all hover:bg-ink-hover active:scale-[0.99]">
            Sign in
          </button>
          {/* Deliberately no credential hint here — this page is public. */}
          <p className="pt-1 text-center text-xs text-faint">Ask an admin if you need access.</p>
        </form>
      </div>
    </div>
  );
}
