ALTER TABLE `campaigns` ADD `public_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_public_token_unique` ON `campaigns` (`public_token`);