-- AI event discovery: the agent may propose EVENTS, not just businesses.
--
-- Hand-written, like 0007-0014. `drizzle-kit generate` is not trusted in this
-- repo: the meta snapshots for 0007-0012 were never created, so it diffs
-- against 0006 and tries to replay six migrations - including dropping and
-- rebuilding `campaigns`. Always read generated SQL here before applying it.
--
-- Purely additive: nine ADD COLUMNs, no table rebuilt, no column altered or
-- dropped, no row rewritten. Every existing event keeps its status, its
-- booked_at stamp and every other field exactly as it was, so Events Booked,
-- Events Held, the calendar and the pipeline board are unaffected.

-- ---------------------------------------------------------------------------
-- events: the same AI columns accounts already carry, plus one date.
-- ---------------------------------------------------------------------------
-- Null on all 13 existing rows: they were entered by people, and null is
-- exactly what "never touched by the agent" means. The read gates that will
-- later hide unreviewed events all treat null as "human, count it normally",
-- so existing behaviour is the default rather than something to migrate into.

ALTER TABLE `events` ADD `ai_fit_score` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `ai_research` text;--> statement-breakpoint

-- No DB-level FK, mirroring `accounts.agent_run_id` so the two agent-created
-- record types stay structurally identical - the human review code will treat
-- them the same way, and a constraint on one but not the other would be a trap.
-- (Correcting the note in 0013: SQLite DOES accept a REFERENCES clause on ADD
-- COLUMN. The reason to leave it off here is consistency, not capability.)
ALTER TABLE `events` ADD `agent_run_id` integer;--> statement-breakpoint

-- Review state is deliberately NOT the `status` column. `status` is the event
-- lifecycle - Idea, Planning, Booked, Completed - and it feeds the calendar,
-- the pipeline board, the 6-events-a-week goal and booked_at. Overloading it
-- with "has a human looked at this" would corrupt all four. An AI-discovered
-- event is born status='Idea' + ai_review_status='Pending'; approval sets
-- ai_review_status='Approved' and leaves status at 'Idea', from which the
-- ordinary human lifecycle takes over.
ALTER TABLE `events` ADD `ai_review_status` text;--> statement-breakpoint
ALTER TABLE `events` ADD `ai_review_reason` text;--> statement-breakpoint
ALTER TABLE `events` ADD `ai_reviewed_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `ai_reviewed_by` integer;--> statement-breakpoint

-- The vendor/exhibitor application cut-off, as a real column rather than a key
-- inside ai_research, because it has to be sorted, filtered, compared against
-- today and eventually turned into a task. A date buried in JSON can do none of
-- those cheaply.
--
-- NOT `follow_up_due_at`, which already means "chase the host AFTER the event
-- happened" and drives Today's Focus and the post-event task sweep. Same shape,
-- opposite direction in time; reusing it would put booth deadlines into the
-- post-event follow-up queue.
--
-- Text ISO date (YYYY-MM-DD), the convention every other date in this schema
-- follows.
ALTER TABLE `events` ADD `application_deadline` text;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- agent_activities: the ledger has to be able to point at an event.
-- ---------------------------------------------------------------------------
-- Without this, an agent action on an event could be recorded but not attached
-- to what it acted on, and the ledger would stop being an audit trail.
--
-- WITH a real FK, unlike the events columns above: the nearest precedent is
-- `agent_activities.account_id` in this same table, which has one. Verified
-- accepted by SQLite on ALTER TABLE ADD COLUMN.
ALTER TABLE `agent_activities` ADD `event_id` integer REFERENCES events(id);
