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
CREATE INDEX `idx_project_model_preferences_project_preset` ON `project_model_preferences` (`project_id`,`preset_id`);--> statement-breakpoint
CREATE INDEX `idx_project_model_preferences_last_used` ON `project_model_preferences` (`last_used_at`);
