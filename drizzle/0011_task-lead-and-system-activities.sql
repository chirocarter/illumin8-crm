ALTER TABLE `tasks` ADD `lead_id` integer REFERENCES leads(id);--> statement-breakpoint
ALTER TABLE `activities` ADD `system_generated` integer DEFAULT false NOT NULL;
