# AI business approval follow-ups

Approving an AI business now creates a linked **Open** task, due on the next
weekday (Monday–Friday; holidays are not specially excluded). The task is
assigned to the business's human owner, or to its human reviewer when the
business was created by an agent identity. Its city always matches the business.
No outreach activity, booking, message, or performance credit is fabricated.
Use the task's **Log activity** button to perform and record outreach; the
existing activity workflow completes that exact task.

The verdict and task write are one transaction, using a synchronous SQLite
transaction locally and a libSQL write batch on hosted Turso. A task insertion
failure rolls back approval. A conditional verdict update prevents a concurrent
review from overwriting another decision. No database migration is needed.

## Existing approvals

After deployment, an admin opens **AI Agent**, selects a city (or **All cities**),
and clicks **Add missing follow-up tasks**. This inserts tasks only for already
approved businesses in the selected scope. Backfilled tasks are due the next
weekday after the button is clicked, not after the historical approval date.
The page reports the number added. Repeating the operation is safe.

Both future approval and backfill skip businesses marked do-not-contact, those
without a city, and those without an eligible human owner/reviewer. An existing
Open or Completed task linked to the same business and city covers the follow-up
and prevents another task; this avoids reopening work already handled. Canceled
automatic approval tasks are also respected. Other canceled tasks do not block
a new follow-up. Automatically created tasks have the stable notes prefix
`[AI approval follow-up]` so cancellation can be recognized without a schema
change. Keep that prefix when editing such a task.

The backfill action is admin-only on the server, not just hidden in the UI.
Ordinary approval retains the existing record-level city authorization. Forms
cannot choose task ownership or alter a business's city. Event approvals and the
research/Make workflows are unchanged.

## Verification

Run `npm run test:approval-followups`, `npx tsc --noEmit`, and `npm run build`.
Tests run against isolated in-memory SQLite and libSQL databases, never the live
CRM. They cover owner fallback, cross-city preservation, duplicate/repeated and
concurrent writes, do-not-contact exclusions, rejected and pending records,
existing tasks, scoped/repeated backfill, cancellation, rollback, and weekday
date boundaries. Deployment and a live backfill still need to be verified
separately; local tests do not create live customer tasks.
