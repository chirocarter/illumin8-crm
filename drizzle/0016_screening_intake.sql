-- Screening intake forms: a campaign's QR form can sign people up for a spinal
-- health screening at an event, and the "pick a time" variant books them into
-- a 10-minute window.
--
-- Hand-written, like 0007-0015 (see the note at the top of 0015 on why
-- `drizzle-kit generate` is not used here).
--
-- Purely additive: four ADD COLUMNs on campaigns and one new table. No table is
-- rebuilt, no column altered or dropped, no row rewritten. Every existing
-- campaign keeps its form and behaves exactly as before: the new columns are
-- null (or 1 people-per-window) and are only read by the two new form types.

-- ---------------------------------------------------------------------------
-- campaigns: which event the screening is at, and the time-window settings.
-- ---------------------------------------------------------------------------
-- A distinct link from events.campaign_id ("events run under this campaign").
-- This one says which single event the sign-up form is FOR.
ALTER TABLE `campaigns` ADD `event_id` integer REFERENCES `events`(`id`);--> statement-breakpoint

-- One block of local wall-clock time, "YYYY-MM-DDTHH:mm:00", cut into
-- 10-minute windows by the app. Null for every non-screening campaign.
ALTER TABLE `campaigns` ADD `slots_start` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `slots_end` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `slot_capacity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- screening_bookings: one row per person per window.
-- ---------------------------------------------------------------------------
-- Not `appointments`: those are new-patient appointments with money, and
-- screening windows counted there would inflate Appointments Booked.
-- lead_id is UNIQUE — one window per lead — and deleting the lead (or the
-- campaign) removes the booking first, through the app's delete plans.
CREATE TABLE `screening_bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`slot_start` text NOT NULL,
	`city_id` integer,
	`user_id` integer,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `screening_bookings_lead_id_unique` ON `screening_bookings` (`lead_id`);--> statement-breakpoint
-- The capacity check and the time sheet both look up one campaign's windows.
CREATE INDEX `screening_bookings_campaign_slot_idx` ON `screening_bookings` (`campaign_id`,`slot_start`);
