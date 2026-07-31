ALTER TABLE `comments` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `removed_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `can_upload` integer DEFAULT false NOT NULL;