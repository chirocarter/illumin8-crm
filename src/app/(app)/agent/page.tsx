import { PageHeader, Card, CardHeader, RecordLink, EmptyState } from "@/components/ui";
import { approveAIProspect, rejectAIProspect } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { activeCity } from "@/lib/scope";
import { agentDashboard } from "@/lib/agent-dashboard";
import { STALE_RUN_HOURS } from "@/lib/agent-runs";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "AI Agent" };
export const dynamic = "force-dynamic";

/**
 * How the agent's own vocabulary reads to a person.
 *
 * "rejected" here means the RESEARCH decided not to put a candidate forward —
 * no account was ever created. That is a different event from a human turning
 * down a candidate the agent did create, which appears as a review status.
 * These labels keep the two apart without renaming the stored vocabulary.
 */
const ACTION_LABEL: Record<string, string> = {
  discovered: "Discovered",
  duplicate_skipped: "Skipped as duplicate",
  researched: "Researched",
  qualified: "Qualified by agent",
  rejected: "Rejected by agent (during research)",
  created: "Created for review",
  error: "Error",
};

const COUNT_ORDER = [
  "discovered", "duplicate_skipped", "researched", "qualified", "rejected", "created", "error",
] as const;

/** started_at is stored in local time, so it parses as local. */
function ageHours(stamp: string): number {
  const t = Date.parse(stamp.replace(" ", "T"));
  return Number.isFinite(t) ? (Date.now() - t) / 3600000 : 0;
}

export default async function AgentPage() {
  await requireUser();
  // The human city scope, exactly as every other page uses it — no second
  // authorization system, and no mixing of markets.
  const city = await activeCity();
  const { latestRun, counts, pending, recent, errors, unreconciled } =
    await agentDashboard(city?.id ?? null);

  const stale = latestRun?.status === "running" && ageHours(latestRun.startedAt) > STALE_RUN_HOURS;
  const runTone =
    latestRun?.status === "failed" ? "bg-bad-soft text-bad"
    : latestRun?.status === "completed" ? "bg-good-soft text-good"
    : stale ? "bg-warn-soft text-accent-deep"
    : "bg-info-soft text-info";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="AI Agent"
        subtitle={
          <span>
            Candidate businesses found by the outreach agent · {city?.name ?? "All cities"} — nothing here
            counts toward your numbers until you approve it
          </span>
        } />

      {/* Only rendered when something is actually wrong. */}
      {unreconciled.length > 0 && (
        <Card className="mb-5 border-2 border-bad/40">
          <CardHeader title="Integrity warning" />
          <div className="px-5 pb-5 text-sm">
            <p className="text-soft">
              {unreconciled.length} AI-created {unreconciled.length === 1 ? "business has" : "businesses have"} no
              matching &ldquo;created&rdquo; entry in the agent&rsquo;s log. That should not happen in normal
              operation and may mean a write was interrupted. Nothing has been changed automatically — this is
              only a flag.
            </p>
            <ul className="mt-3 space-y-1">
              {unreconciled.map((u) => (
                <li key={u.id}>
                  <RecordLink href={`/accounts/${u.id}`}>{u.name}</RecordLink>
                  <span className="text-faint"> · run #{u.agentRunId}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Latest run"
          action={latestRun ? (
            <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium ${runTone}`}>
              {stale ? `Running · idle ${Math.floor(ageHours(latestRun.startedAt))}h` : latestRun.status}
            </span>
          ) : undefined} />
        {!latestRun ? (
          <p className="px-5 pb-5 text-sm text-faint">
            The agent has not run in {city?.name ?? "this city"} yet.
          </p>
        ) : (
          <div className="px-5 pb-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div><dt className="text-faint">Trigger</dt><dd className="font-medium">{latestRun.trigger ?? "—"}</dd></div>
              <div><dt className="text-faint">Started</dt><dd className="font-medium">{fmtDateTime(latestRun.startedAt)}</dd></div>
              <div><dt className="text-faint">Finished</dt><dd className="font-medium">{latestRun.completedAt ? fmtDateTime(latestRun.completedAt) : "—"}</dd></div>
              <div><dt className="text-faint">Run</dt><dd className="font-medium">#{latestRun.id}</dd></div>
            </dl>

            {latestRun.error && (
              <p className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{latestRun.error}</p>
            )}
            {stale && !latestRun.completedAt && (
              <p className="mt-3 text-xs text-soft">
                This run was never closed. It is shown as it was left rather than marked failed — the agent never
                reported a failure, and recording one would invent something nobody observed.
              </p>
            )}

            <div className="mt-4 overflow-x-auto">
              <div className="flex gap-2">
                {COUNT_ORDER.map((k) => (
                  <div key={k} className="min-w-[7rem] rounded-xl bg-well px-3 py-2 text-center">
                    <span className="block text-lg font-semibold leading-none">{counts[k] ?? 0}</span>
                    <span className="mt-1 block text-[0.62rem] font-medium uppercase tracking-wider text-faint">
                      {ACTION_LABEL[k]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-faint">
              Counted from the agent&rsquo;s activity log, not from stored totals.
            </p>
          </div>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader
          title={`Waiting for your review${pending.length ? ` · ${pending.length}` : ""}`}
          action={<span className="text-xs text-faint">Highest fit score first</span>} />
        {pending.length === 0 ? (
          <EmptyState icon="sparkle" title="Nothing waiting"
            hint="Businesses the agent creates appear here for approval before they reach your pipeline." />
        ) : (
          <ul className="divide-y divide-hairline">
            {pending.map((p) => (
              <li key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <RecordLink href={`/accounts/${p.id}`}>{p.name}</RecordLink>
                    <p className="mt-0.5 text-xs text-soft">
                      {p.vertical} · {p.area}
                      {p.confidence ? <> · confidence <span className="font-medium">{p.confidence}</span></> : null}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[0.72rem] font-semibold text-accent-deep">
                    {p.aiFitScore === null ? "No score" : `Fit ${p.aiFitScore}`}
                  </span>
                </div>

                {p.summary && <p className="mt-2 text-sm text-soft">{p.summary}</p>}

                {p.sources.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {p.sources.map((src, i) => (
                      // noopener/nofollow because these URLs came from an
                      // automated process, not from someone in the building.
                      <a key={i} href={src.url} target="_blank" rel="noopener noreferrer nofollow"
                        className="text-accent-deep underline underline-offset-2">
                        {src.label ?? src.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    ))}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={approveAIProspect}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="rounded-full bg-good-soft px-3.5 py-1.5 text-[0.8rem] font-medium text-good transition-colors hover:brightness-95">
                      Approve
                    </button>
                  </form>
                  {/* Reject carries a reason, so it is a small inline form
                      rather than a one-click button — the reason is the part
                      worth keeping. */}
                  <form action={rejectAIProspect} className="flex min-w-0 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="reason" required maxLength={400} placeholder="Reason for rejecting…"
                      className="w-56 min-w-0 rounded-full border border-line bg-canvas px-3.5 py-1.5 text-[0.8rem]" />
                    <button className="rounded-full bg-bad-soft px-3.5 py-1.5 text-[0.8rem] font-medium text-bad transition-colors hover:brightness-95">
                      Reject
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent agent activity" />
          {recent.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-faint">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {recent.map((a) => (
                <li key={a.id} className="px-5 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="text-xs text-faint">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  {a.accountId && (
                    <RecordLink href={`/accounts/${a.accountId}`} muted>
                      {a.accountName ?? `#${a.accountId}`}
                    </RecordLink>
                  )}
                  {a.detail && <p className="text-xs text-soft">{a.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Errors" />
          {errors.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-faint">No errors logged.</p>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {errors.map((e) => (
                <li key={e.id} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-bad">Error</span>
                    <span className="text-xs text-faint">{fmtDateTime(e.createdAt)} · run #{e.runId}</span>
                  </div>
                  {e.detail && <p className="text-xs text-soft">{e.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-4 text-xs text-faint">
        Approving a business lets it into your normal pipeline and reporting. Rejecting keeps it out but preserves
        it, and your reason, as a record. &ldquo;Rejected by agent&rdquo; above means research decided not to put a
        candidate forward at all — a different thing from you rejecting one it did create.
      </p>
    </div>
  );
}
