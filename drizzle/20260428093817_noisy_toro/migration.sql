CREATE TABLE `agent_provider_catalogs` (
	`preset_id` text NOT NULL,
	`cwd` text NOT NULL,
	`available_modes_json` text NOT NULL,
	`available_models_json` text NOT NULL,
	`current_mode_id` text,
	`current_model_id` text,
	`last_error` text,
	`refreshed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `agent_provider_catalogs_pk` PRIMARY KEY(`preset_id`, `cwd`)
);
--> statement-breakpoint
CREATE TABLE `enabled_agent_providers` (
	`preset_id` text PRIMARY KEY,
	`enabled_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `session_messages` ADD `message_kind` text DEFAULT 'legacy_assistant_turn' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_messages` ADD `stream_part_id` text;--> statement-breakpoint
ALTER TABLE `session_messages` ADD `metadata_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_messages` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `session_messages` SET `message_kind` = 'user' WHERE `role` = 'user';--> statement-breakpoint
UPDATE `session_messages` SET `updated_at` = `created_at` WHERE `updated_at` = '';--> statement-breakpoint
CREATE INDEX `idx_agent_provider_catalogs_preset_id` ON `agent_provider_catalogs` (`preset_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_provider_catalogs_updated_at` ON `agent_provider_catalogs` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_enabled_agent_providers_updated_at` ON `enabled_agent_providers` (`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_messages_stream_part` ON `session_messages` (`session_id`,`stream_part_id`) WHERE `stream_part_id` IS NOT NULL;
