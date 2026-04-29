DROP TABLE IF EXISTS `session_messages`;--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`text_for_search` text DEFAULT '' NOT NULL,
	`raw_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_session_messages_session_id_sessions_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_session_messages_session_created` ON `session_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_session_messages_session_kind` ON `session_messages` (`session_id`,`kind`);
