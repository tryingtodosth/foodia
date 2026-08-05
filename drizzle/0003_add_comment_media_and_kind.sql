ALTER TABLE `comments` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `kind` text DEFAULT 'note' NOT NULL;
