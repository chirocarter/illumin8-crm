import Link from "next/link";
import { badgeClass } from "@/lib/badges";
import { Icon } from "./icons";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    // min-w-0 because a card is usually a grid or flex item, and those default
    // to min-width:auto — refusing to shrink below their content. One wide
    // table inside then widens the whole page instead of scrolling in its own
    // box, and the phone gets a sideways scroll on every screen. Harmless
    // anywhere else: min-width only bites inside a grid or flex parent.
    <div className={`min-w-0 rounded-card bg-card shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, className = "" }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    // gap + a non-shrinking title so a long action (hint text) wraps beside the
    // title instead of overlapping it on narrow screens.
    <div className={`flex items-center justify-between gap-3 px-5 pt-4 pb-3 ${className}`}>
      <h2 className="shrink-0 text-[0.8rem] font-semibold uppercase tracking-wider text-faint">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.85rem] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ children }: { children: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass(children)}`}>
      {children}
    </span>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-all duration-150 active:scale-[0.98] whitespace-nowrap";
const btnStyles = {
  primary: `${btnBase} bg-ink text-canvas hover:bg-ink-hover px-4 py-2 shadow-sm`,
  accent: `${btnBase} bg-accent text-white hover:bg-accent-deep px-4 py-2 shadow-sm`,
  ghost: `${btnBase} text-ink hover:bg-hairline px-4 py-2`,
  outline: `${btnBase} border border-line bg-card text-ink hover:bg-hairline px-4 py-2`,
  danger: `${btnBase} text-bad hover:bg-bad-soft px-4 py-2`,
};

/** Small pill — chips, filters, week nav. The only other sanctioned pill size. */
export const pillSm =
  "pill-idle rounded-full bg-card px-3.5 py-1.5 text-[0.8rem] font-medium text-soft shadow-card transition-colors hover:text-ink-hover";
type BtnVariant = keyof typeof btnStyles;

export function BtnLink({ href, variant = "primary", children }: { href: string; variant?: BtnVariant; children: React.ReactNode }) {
  return <Link href={href} className={btnStyles[variant]}>{children}</Link>;
}

export function Btn({ variant = "primary", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button className={btnStyles[variant]} {...props}>{children}</button>;
}

// ----- Form primitives -----
export const inputCls =
  "w-full rounded-xl border border-line bg-card px-3.5 py-2 text-sm outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft placeholder:text-faint";
export const selectCls = inputCls + " appearance-none";

export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[0.8rem] font-medium text-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon = "sparkle", title, hint, action }: { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-soft">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Every number in the app that has a source list behind it renders through this.
    `spark` draws a tiny per-day bar strip (pinned to the card's bottom edge so
    strips align across a row); `delta` renders "↑ n vs last week". */
export function LinkableMetric({ label, value, href, sub, accent = false, spark, delta, deltaText }: {
  label: string; value: React.ReactNode; href: string; sub?: React.ReactNode; accent?: boolean;
  spark?: number[];
  /** difference vs the previous period; colors + arrow are derived from the sign */
  delta?: number;
  /** optional display override for the delta magnitude (e.g. "$120") */
  deltaText?: string;
}) {
  const sparkMax = spark ? Math.max(1, ...spark) : 1;
  return (
    <Link href={href}
      className="group flex flex-col rounded-card bg-card p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
      {/* Only the label hugs the top; everything else is one block anchored
          to the bottom edge, so numbers/deltas/sparks align across a row. */}
      <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">{label}</p>
      <div className="mt-auto pt-3">
        <p className={`text-[1.65rem] font-semibold leading-none tracking-tight ${accent ? "text-accent-deep" : "text-ink"}`}>
          {value}
        </p>
        {typeof delta === "number" && (
          <p className={`mt-1.5 text-xs font-medium leading-none ${delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-faint"}`}>
            {delta === 0
              ? "— even with last week"
              : `${delta > 0 ? "↑" : "↓"} ${deltaText ?? Math.abs(delta)} vs last week`}
          </p>
        )}
        {sub && <p className="mt-1.5 text-xs leading-none text-soft">{sub}</p>}
        {spark && (
          <span className="mt-2.5 flex h-5 items-end gap-[3px]" aria-hidden>
            {spark.map((v, i) => (
              <span key={i}
                className={`w-full rounded-full transition-colors ${v > 0 ? "bg-accent/70 group-hover:bg-accent" : "bg-hairline"}`}
                style={{ height: v > 0 ? `${Math.max(20, (v / sparkMax) * 100)}%` : "3px" }} />
            ))}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Small inline drill-down number used inside report tables. */
export function DrillNumber({ value, href }: { value: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:text-accent-deep hover:decoration-accent">
      {value}
    </Link>
  );
}

/** Name-of-record link (contact, account, event…). Universal click-through pattern. */
export function RecordLink({ href, children, muted = false }: { href: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <Link href={href} className={`font-medium transition-colors hover:text-accent-deep ${muted ? "text-soft" : "text-ink"}`}>
      {children}
    </Link>
  );
}
