CREATE TABLE `account_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`vertical` text DEFAULT 'Other' NOT NULL,
	`area` text DEFAULT 'Other' NOT NULL,
	`address` text,
	`website` text,
	`phone` text,
	`email` text,
	`status` text DEFAULT 'New Prospect' NOT NULL,
	`source` text,
	`owner_name` text,
	`notes` text,
	`clinic_location_id` integer,
	`partnership_score` integer DEFAULT 3 NOT NULL,
	`event_score` integer DEFAULT 3 NOT NULL,
	`relationship_strength` text DEFAULT 'Cold' NOT NULL,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`last_contacted_at` text,
	`next_follow_up_at` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`clinic_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`outcome` text,
	`account_id` integer,
	`contact_id` integer,
	`opportunity_id` integer,
	`event_id` integer,
	`partner_id` integer,
	`campaign_id` integer,
	`occurred_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`next_follow_up_at` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lead_id` integer,
	`contact_id` integer,
	`person_name` text DEFAULT '' NOT NULL,
	`source` text,
	`event_id` integer,
	`campaign_id` integer,
	`partner_id` integer,
	`account_id` integer,
	`location_id` integer,
	`scheduled_at` text,
	`status` text DEFAULT 'Booked' NOT NULL,
	`offer` text,
	`revenue` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'Other' NOT NULL,
	`partner_id` integer,
	`account_id` integer,
	`start_date` text,
	`end_date` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`tracking_url` text,
	`offer` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contact_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`title` text,
	`account_id` integer,
	`phone` text,
	`email` text,
	`preferred_method` text,
	`contact_type` text DEFAULT 'Other' NOT NULL,
	`influence_level` text DEFAULT 'Medium' NOT NULL,
	`relationship_status` text DEFAULT 'New' NOT NULL,
	`notes` text,
	`source` text,
	`last_contacted_at` text,
	`next_follow_up_at` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'Other' NOT NULL,
	`account_id` integer,
	`contact_id` integer,
	`opportunity_id` integer,
	`campaign_id` integer,
	`partner_id` integer,
	`clinic_location_id` integer,
	`location_text` text,
	`starts_at` text,
	`status` text DEFAULT 'Idea' NOT NULL,
	`booked_at` text,
	`expected_attendees` integer DEFAULT 0 NOT NULL,
	`actual_attendees` integer DEFAULT 0 NOT NULL,
	`screenings_completed` integer DEFAULT 0 NOT NULL,
	`revenue` real DEFAULT 0 NOT NULL,
	`notes` text,
	`follow_up_required` integer DEFAULT false NOT NULL,
	`follow_up_due_at` text,
	`outcome_notes` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinic_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`phone` text,
	`email` text,
	`source` text,
	`campaign_id` integer,
	`event_id` integer,
	`partner_id` integer,
	`account_id` integer,
	`interest_level` text DEFAULT 'Unknown' NOT NULL,
	`appt_status` text DEFAULT 'Not Contacted' NOT NULL,
	`preferred_location_id` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preferred_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`account_id` integer,
	`contact_id` integer,
	`type` text DEFAULT 'Other' NOT NULL,
	`stage` text DEFAULT 'Prospect Identified' NOT NULL,
	`estimated_value` real DEFAULT 0 NOT NULL,
	`probability` integer DEFAULT 50 NOT NULL,
	`expected_event_date` text,
	`next_step` text,
	`next_follow_up_at` text,
	`campaign_id` integer,
	`clinic_location_id` integer,
	`notes` text,
	`loss_reason` text,
	`stage_changed_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinic_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`partner_type` text DEFAULT 'Business Partner' NOT NULL,
	`status` text DEFAULT 'Prospective' NOT NULL,
	`start_date` text,
	`main_contact_id` integer,
	`clinic_location_id` integer,
	`benefits` text,
	`notes` text,
	`drop_box_active` integer DEFAULT false NOT NULL,
	`drop_box_status` text,
	`last_pickup_at` text,
	`next_pickup_due_at` text,
	`lunch_offer` text,
	`catering_info` text,
	`cards_collected` integer DEFAULT 0 NOT NULL,
	`revenue_spent` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`main_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinic_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `report_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric` text NOT NULL,
	`label` text NOT NULL,
	`weekly_target` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_goals_metric_unique` ON `report_goals` (`metric`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'Open' NOT NULL,
	`account_id` integer,
	`contact_id` integer,
	`opportunity_id` integer,
	`event_id` integer,
	`activity_id` integer,
	`notes` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);