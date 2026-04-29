CREATE TABLE `routines` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`enabled` text NOT NULL,
	`kind` text NOT NULL,
	`config_json` text NOT NULL,
	`send_config_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_routines_enabled_next_run_at` ON `routines` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_routines_updated_at` ON `routines` (`updated_at`);