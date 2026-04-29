CREATE TABLE `custom_agent_providers` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`command` text NOT NULL,
	`args_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_agent_providers_name` ON `custom_agent_providers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_custom_agent_providers_updated_at` ON `custom_agent_providers` (`updated_at`);
