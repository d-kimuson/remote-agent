CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`raw_events_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_session_messages_session_id_sessions_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_session_messages_session_id` ON `session_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_session_messages_created_at` ON `session_messages` (`created_at`);