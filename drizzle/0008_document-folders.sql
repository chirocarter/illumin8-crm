CREATE TABLE `document_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `folder_id` integer REFERENCES document_folders(id);
