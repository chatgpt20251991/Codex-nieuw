CREATE TABLE `intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`email` text NOT NULL,
	`application` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`ip_hash` text NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `intakes_created_at_idx` ON `intakes` (`created_at`);--> statement-breakpoint
CREATE INDEX `intakes_ip_time_idx` ON `intakes` (`ip_hash`,`created_at`);