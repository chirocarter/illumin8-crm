ALTER TABLE `accounts` ADD `partner_since` text;--> statement-breakpoint
-- Businesses that are already partners get a date so they aren't invisible to
-- the new metric. Their most recent activity is the closest honest estimate of
-- when the partnership was confirmed; failing that, when the record was made.
UPDATE `accounts` SET `partner_since` = coalesce(
  (SELECT max(a.occurred_at) FROM activities a WHERE a.account_id = accounts.id),
  `created_at`
) WHERE `status` = 'Active Partner' AND `partner_since` IS NULL;
