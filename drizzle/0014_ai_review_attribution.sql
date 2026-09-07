-- Human review attribution for AI-created prospects.
--
-- Hand-written, like 0007-0013. `drizzle-kit generate` is not trusted in this
-- repo: the meta snapshots for 0007-0012 were never created, and its output
-- once tried to drop and rebuild the campaigns table. Always read generated SQL
-- here before applying it.
--
-- Purely additive. Two nullable columns; no existing column, row or table is
-- touched, so every current CRM feature behaves exactly as before.

-- Null on all 488 existing rows: nobody has reviewed anything yet, and null is
-- exactly what "never reviewed" means.
ALTER TABLE `accounts` ADD `ai_reviewed_at` text;--> statement-breakpoint
-- No FK: SQLite cannot add one via ALTER TABLE without rebuilding the table,
-- and rebuilding `accounts` for a constraint would risk 488 live rows. The
-- reviewer comes from the authenticated session, so the value is server-chosen
-- rather than caller-supplied.
ALTER TABLE `accounts` ADD `ai_reviewed_by` integer;
