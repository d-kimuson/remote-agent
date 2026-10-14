CREATE TABLE `prompt_idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_prompt_idempotency_keys_session_id` ON `prompt_idempotency_keys` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_prompt_idempotency_keys_created_at` ON `prompt_idempotency_keys` (`created_at`);
