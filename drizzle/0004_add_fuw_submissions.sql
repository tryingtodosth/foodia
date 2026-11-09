CREATE TABLE `fuw_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`locale` text NOT NULL,
	`recipe` text NOT NULL,
	`author_name` text NOT NULL,
	`affiliation` text NOT NULL,
	`affiliation_detail` text,
	`email` text NOT NULL,
	`story` text,
	`consent_at` text NOT NULL,
	`ip_hash` text NOT NULL,
	`submitted_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by_id` text,
	`promoted_recipe_id` text,
	FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`promoted_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `fuw_uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`submission_id` text,
	`ip_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `fuw_submissions`(`id`) ON UPDATE no action ON DELETE set null
);
