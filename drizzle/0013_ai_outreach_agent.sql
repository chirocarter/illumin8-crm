-- AI outreach agent: one shared system, one agent identity per city.
--
-- Hand-written, like 0007-0012. `drizzle-kit generate` cannot be trusted in
-- this repo: the meta snapshots for 0007-0012 were never created, so it diffs
-- against 0006 and tries to replay six migrations - including dropping and
-- rebuilding `campaigns`. Always read generated SQL here before applying it.
--
-- Purely additive. No existing column, row or table is touched, so every
-- current CRM feature behaves exactly as before.

CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text,
	`error` text,
	`started_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`completed_at` text,
	`city_id` integer NOT NULL REFERENCES cities(id),
	`user_id` integer NOT NULL REFERENCES users(id),
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);--> statement-breakpoint

CREATE TABLE `agent_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_run_id` integer NOT NULL REFERENCES agent_runs(id),
	`account_id` integer REFERENCES accounts(id),
	`action` text NOT NULL,
	`detail` text,
	`city_id` integer NOT NULL REFERENCES cities(id),
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);--> statement-breakpoint

-- The dashboard reads these two ways: the newest run for a city, and every
-- action within one run.
CREATE INDEX `agent_runs_city_started_idx` ON `agent_runs` (`city_id`, `started_at`);--> statement-breakpoint
CREATE INDEX `agent_activities_run_idx` ON `agent_activities` (`agent_run_id`);--> statement-breakpoint

-- AI research on a business. Null on all 488 existing rows: they were entered
-- by people, and null is exactly what "never researched by the agent" means.
ALTER TABLE `accounts` ADD `ai_fit_score` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `ai_research` text;--> statement-breakpoint
-- No FK: SQLite cannot add one via ALTER TABLE without rebuilding the table,
-- and rebuilding `accounts` to gain a constraint would risk 488 live rows for
-- no functional gain. The relationship is enforced in the API layer instead.
ALTER TABLE `accounts` ADD `agent_run_id` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `ai_review_status` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `ai_review_reason` text;--> statement-breakpoint

-- Only agent identities get a key hash. UNIQUE is safe across the existing
-- users because SQLite treats NULLs as distinct.
ALTER TABLE `users` ADD `agent_key_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_agent_key_hash_unique` ON `users` (`agent_key_hash`);
