CREATE TABLE `intake_worker` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `intakes` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `intakes` ADD `next_attempt_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `intakes` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `intakes` ADD `lease_until` integer;--> statement-breakpoint
ALTER TABLE `intakes` ADD `accepted_at` integer;--> statement-breakpoint
ALTER TABLE `intakes` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `intakes_delivery_idx` ON `intakes` (`delivery_status`,`next_attempt_at`);