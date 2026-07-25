CREATE TABLE `cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `city_id` integer;--> statement-breakpoint
ALTER TABLE `locations` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `accounts` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `accounts` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `contacts` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `contacts` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `partners` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `partners` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `events` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `events` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `activities` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `activities` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `leads` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `leads` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `appointments` ADD `city_id` integer REFERENCES cities(id);--> statement-breakpoint
ALTER TABLE `appointments` ADD `user_id` integer REFERENCES users(id);--> statement-breakpoint
UPDATE `campaigns` SET `public_form` = 'patient' WHERE `public_form` = 'person';--> statement-breakpoint
UPDATE `campaigns` SET `public_form` = 'lunch' WHERE `public_form` = 'business';--> statement-breakpoint
INSERT INTO `cities` (`name`) SELECT 'Albuquerque' WHERE NOT EXISTS (SELECT 1 FROM `cities`);--> statement-breakpoint
UPDATE `locations` SET `city_id` = (SELECT MIN(`id`) FROM `cities`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `users` SET `city_id` = (SELECT MIN(`id`) FROM `cities`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `accounts` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `contacts` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `campaigns` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `partners` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `opportunities` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `events` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `projects` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `activities` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `tasks` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `leads` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;--> statement-breakpoint
UPDATE `appointments` SET `city_id` = (SELECT MIN(`id`) FROM `cities`), `user_id` = (SELECT MIN(`id`) FROM `users`) WHERE `city_id` IS NULL;
