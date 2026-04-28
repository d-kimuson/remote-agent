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
CREATE TABLE `project_model_preferences` (
	`project_id` text NOT NULL,
	`preset_id` text NOT NULL,
	`model_id` text NOT NULL,
	`is_favorite` text DEFAULT 'false' NOT NULL,
	`last_used_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT `project_model_preferences_pk` PRIMARY KEY(`project_id`, `preset_id`, `model_id`),
	CONSTRAINT `fk_project_model_preferences_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`working_directory` text NOT NULL UNIQUE,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`raw_events_json` text NOT NULL,
	`created_at` text NOT NULL,
	`message_kind` text DEFAULT 'legacy_assistant_turn' NOT NULL,
	`stream_part_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_session_messages_session_id_sessions_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY,
	`origin` text NOT NULL,
	`project_id` text,
	`preset_id` text,
	`command` text NOT NULL,
	`args_json` text NOT NULL,
	`cwd` text NOT NULL,
	`created_at` text NOT NULL,
	`title` text,
	`updated_at` text,
	`current_mode_id` text,
	`current_model_id` text,
	`available_modes_json` text NOT NULL,
	`available_models_json` text NOT NULL,
	CONSTRAINT `fk_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_provider_catalogs_preset_id` ON `agent_provider_catalogs` (`preset_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_provider_catalogs_updated_at` ON `agent_provider_catalogs` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_enabled_agent_providers_updated_at` ON `enabled_agent_providers` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_project_model_preferences_project_preset` ON `project_model_preferences` (`project_id`,`preset_id`);--> statement-breakpoint
CREATE INDEX `idx_project_model_preferences_last_used` ON `project_model_preferences` (`last_used_at`);--> statement-breakpoint
CREATE INDEX `idx_projects_created_at` ON `projects` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_session_messages_session_id` ON `session_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_session_messages_created_at` ON `session_messages` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_messages_stream_part` ON `session_messages` (`session_id`,`stream_part_id`) WHERE "session_messages"."stream_part_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_sessions_created_at` ON `sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_project_id` ON `sessions` (`project_id`);