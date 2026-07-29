CREATE TABLE `comment_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`recipe_name` text NOT NULL,
	`target_label` text NOT NULL,
	`comment_content` text NOT NULL,
	`comment_author_id` text NOT NULL,
	`reason` text NOT NULL,
	`reported_by_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`content` text NOT NULL,
	`visibility` text NOT NULL,
	`author_id` text NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`substitutable` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`label` text NOT NULL,
	`parent_recipe_id` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`hero_image` text NOT NULL,
	`author_id` text NOT NULL,
	`tags` text NOT NULL,
	`diet_flags` text NOT NULL,
	`required_equipment` text NOT NULL,
	`time_minutes` integer NOT NULL,
	`cost_amount` real,
	`cost_currency` text,
	`kcal` integer NOT NULL,
	`protein_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`source_locale` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recognized_substitutions` (
	`substitution_id` text PRIMARY KEY NOT NULL,
	`recognized_at` text NOT NULL,
	FOREIGN KEY (`substitution_id`) REFERENCES `substitutions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `step_alternatives` (
	`id` text PRIMARY KEY NOT NULL,
	`for_step_id` text NOT NULL,
	`text` text NOT NULL,
	`requires_equipment` text,
	`duration_minutes` integer,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`proposed_by_id` text,
	FOREIGN KEY (`for_step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `steps` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`text` text NOT NULL,
	`duration_minutes` integer,
	`requires_equipment` text,
	`ingredient_ids` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `substitutions` (
	`id` text PRIMARY KEY NOT NULL,
	`for_ingredient_id` text NOT NULL,
	`name` text NOT NULL,
	`ratio` real NOT NULL,
	`delta_macros` text,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`proposed_by_id` text,
	FOREIGN KEY (`for_ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`locale` text NOT NULL,
	`fields` text NOT NULL,
	`translated_by_id` text NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`translated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`is_moderator` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);