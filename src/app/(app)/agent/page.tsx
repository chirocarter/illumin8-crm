import { PageHeader, Card, CardHeader, RecordLink, EmptyState } from "@/components/ui";
import {
  approveAIProspect, rejectAIProspect, approveAIEvent, rejectAIEvent,
} from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { activeCity } from "@/lib/scope";
import { agentDashboard } from "@/lib/agent-dashboard";
import {
  pendingEventsForReview, newEventDevelopments, unreconciledEvents,
} from "@/lib/agent-event-review";
import { STALE_RUN_HOURS } from "@/lib/agent-runs";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";

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
  resurfaced: "New development",
  error: "Error",
};

const COUNT_ORDER = [
  "discovered", "duplicate_skipped", "researched", "qualified", "rejected", "created",
  "resurfaced", "error",
] as const;

/** Source links from an automated process — never followed as endorsements. */
function SourceLinks({ sources }: { sources: { url: string; label?: string }[] }) {
  if (!sources.length) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {sources.map((src, i) => (
        <a key={i} href={src.url} target="_blank" rel="noopener noreferrer nofollow"
          className="text-accent-deep underline underline-offset-2">
          {src.label ?? src.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
        </a>
      ))}
    </p>
  );
}

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
  const today = todayISO();
  const [{ latestRun, counts, pending, recent, errors, unreconciled },
         pendingEvents, developments, unreconciledEv] = await Promise.all([
    agentDashboard(city?.id ?? null),
    pendingEventsForReview(city?.id ?? null, today),
    newEventDevelopments(city?.id ?? null),
    unreconciledEvents(city?.id ?? null),
  ]);

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
            Businesses and events found by the outreach agent · {city?.name ?? "All cities"} — nothing here
            counts toward your numbers, appears on your calendar, or reads as booked until you approve it
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

      {/* The same check for events. Separate card, because the two anomalies
          have different causes and mixing them would obscure which is which. */}
      {unreconciledEv.length > 0 && (
        <Card className="mb-5 border-2 border-bad/40">
          <CardHeader title="Integrity warning · events" />
          <div className="px-5 pb-5 text-sm">
            <p className="text-soft">
              {unreconciledEv.length} AI-discovered {unreconciledEv.length === 1 ? "event has" : "events have"} no
              matching &ldquo;created&rdquo; entry in the agent&rsquo;s log. Creation writes the event and then the
              ledger entry; a gap here means something interrupted the pair. Nothing has been changed
              automatically — this is only a flag.
            </p>
            <ul className="mt-3 space-y-1">
              {unreconciledEv.map((u) => (
                <li key={u.id}>
                  <RecordLink href={`/events/${u.id}`}>{u.name}</RecordLink>
                  <span className="text-faint"> · run #{u.agentRunId}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* New developments sit ABOVE the queues: they are the thing most likely
          to have changed since Carter last looked. */}
      {developments.length > 0 && (
        <Card className="mb-5">
          <CardHeader
            title={`New event developments · ${developments.length}`}
            action={<span className="text-xs text-faint">Material changes only</span>} />
          <ul className="divide-y divide-hairline">
            {developments.map((d) => {
              const rejected = d.aiReviewStatus === "Rejected";
              return (
                <li key={d.activityId} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <RecordLink href={`/events/${d.eventId}`}>{d.name}</RecordLink>
                      <p className="mt-0.5 text-xs text-soft">
                        {d.startsAt ? fmtDate(d.startsAt) : "Date not published"}
                        {d.applicationDeadline ? <> · apply by <span className="font-medium">{fmtDate(d.applicationDeadline)}</span></> : null}
                        {d.aiFitScore !== null ? <> · fit {d.aiFitScore}</> : null}
                        {d.confidence ? <> · confidence {d.confidence}</> : null}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                      rejected ? "bg-bad-soft text-bad" : "bg-good-soft text-good"
                    }`}>
                      {rejected ? "You rejected this" : "Already approved"}
                    </span>
                  </div>

                  {d.detail && <p className="mt-2 text-sm">{d.detail}</p>}

                  {/* The two cases read differently on purpose: one is asking
                      Carter to reconsider a decision he made, the other is
                      telling him something changed on work he already owns. */}
                  <p className="mt-1.5 text-xs text-soft">
                    {rejected ? (
                      <>You turned this down{d.aiReviewReason ? <> — &ldquo;{d.aiReviewReason}&rdquo;</> : null}. Something has
                        changed since. Your rejection stands until you change it yourself.</>
                    ) : (
                      <>This is already in your workflow. The scanner found something new about it.</>
                    )}
                    <span className="text-faint"> · found {fmtDateTime(d.createdAt)} · run #{d.runId}</span>
                  </p>
                  {d.latestSource && <SourceLinks sources={[{ url: d.latestSource }]} />}
                </li>
              );
            })}
          </ul>
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

      <Card className="mb-5">
        <CardHeader
          title={`Events waiting for your review${pendingEvents.length ? ` · ${pendingEvents.length}` : ""}`}
          action={<span className="text-xs text-faint">Best fit first, then nearest deadline</span>} />
        {pendingEvents.length === 0 ? (
          <EmptyState icon="calendar" title="No events waiting"
            hint="Events the agent discovers appear here. Until you approve one it stays off your calendar, your lists and your numbers." />
        ) : (
          <ul className="divide-y divide-hairline">
            {pendingEvents.map((e) => (
              <li key={e.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <RecordLink href={`/events/${e.id}`}>{e.name}</RecordLink>
                    <p className="mt-0.5 text-xs text-soft">
                      {e.type}
                      {/* An undated event is a supported find, not a defect —
                          say so rather than showing an empty gap. */}
                      {" · "}{e.startsAt ? fmtDate(e.startsAt) : <span className="text-faint">date not published yet</span>}
                      {e.locationText ? <> · {e.locationText}</> : null}
                      {e.expectedAttendees > 0 ? <> · ~{e.expectedAttendees.toLocaleString()} expected</> : null}
                      {e.confidence ? <> · confidence <span className="font-medium">{e.confidence}</span></> : null}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[0.72rem] font-semibold text-accent-deep">
                    {e.aiFitScore === null ? "No score" : `Fit ${e.aiFitScore}`}
                  </span>
                </div>

                {e.applicationDeadline && (
                  <p className={`mt-2 text-xs font-medium ${e.deadlinePassed ? "text-bad" : "text-accent-deep"}`}>
                    {e.deadlinePassed
                      ? `Application deadline passed — ${fmtDate(e.applicationDeadline)}`
                      : `Apply by ${fmtDate(e.applicationDeadline)}`}
                  </p>
                )}

                {e.summary && <p className="mt-2 text-sm text-soft">{e.summary}</p>}

                {(e.organizer || e.vendorStatus || e.vendorCost || e.potential) && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                    {e.organizer && <div><dt className="text-faint">Organizer</dt><dd>{e.organizer}</dd></div>}
                    {e.vendorStatus && <div><dt className="text-faint">Vendor status</dt><dd>{e.vendorStatus}</dd></div>}
                    {e.vendorCost && <div><dt className="text-faint">Cost</dt><dd>{e.vendorCost}</dd></div>}
                    {e.potential && Object.entries(e.potential).map(([k, v]) => (
                      <div key={k}><dt className="text-faint capitalize">{k} potential</dt><dd>{String(v)}</dd></div>
                    ))}
                  </dl>
                )}

                {e.recommendedAction && (
                  <p className="mt-2 rounded-xl bg-well px-3 py-2 text-xs text-soft">
                    <span className="font-medium text-ink">Suggested: </span>{e.recommendedAction}
                  </p>
                )}

                <SourceLinks sources={e.sources} />

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={approveAIEvent}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="rounded-full bg-good-soft px-3.5 py-1.5 text-[0.8rem] font-medium text-good transition-colors hover:brightness-95">
                      Approve
                    </button>
                  </form>
                  <form action={rejectAIEvent} className="flex min-w-0 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={e.id} />
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
                  {a.eventId && (
                    <RecordLink href={`/events/${a.eventId}`} muted>
                      {a.eventName ?? `#${a.eventId}`}
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
        Approving a business lets it into your normal pipeline and reporting; approving an event lets it into your
        lists and calendar. Neither books anything — an approved event stays an idea until you move it through the
        normal lifecycle yourself, and only that stamps a booking date. Rejecting keeps a candidate out but
        preserves it, and your reason, as a record; if the agent later finds something materially new it says so
        under New event developments rather than reopening your decision. &ldquo;Rejected by agent&rdquo; above means
        research decided not to put a candidate forward at all — a different thing from you rejecting one it did
        create.
      </p>
    </div>
  );
}
