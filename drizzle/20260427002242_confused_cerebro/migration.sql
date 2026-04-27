CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`working_directory` text NOT NULL UNIQUE,
	`created_at` text NOT NULL
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
CREATE INDEX `idx_projects_created_at` ON `projects` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_created_at` ON `sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_project_id` ON `sessions` (`project_id`);