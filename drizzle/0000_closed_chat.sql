CREATE TABLE `citations` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`snippet` text,
	`is_official` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`blob_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`type` text NOT NULL,
	`blob_path` text NOT NULL,
	`manifest_path` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `form_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`field_name` text NOT NULL,
	`field_type` text DEFAULT 'text' NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `form_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `form_fills` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`template_id` text NOT NULL,
	`field_name` text NOT NULL,
	`source_key` text NOT NULL,
	`value` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`method` text DEFAULT 'deterministic' NOT NULL,
	`review_flag` integer DEFAULT false NOT NULL,
	`approved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `form_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `form_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`document_id` text NOT NULL,
	`name` text NOT NULL,
	`source_mode` text DEFAULT 'fillable' NOT NULL,
	`field_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`required_action` text NOT NULL,
	`blocking` integer DEFAULT true NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`response` text NOT NULL,
	`status_code` integer DEFAULT 200 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`source_url` text NOT NULL,
	`source_type` text DEFAULT 'official' NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`fee` text,
	`due_date` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`form_fill_id` text,
	`decision_type` text NOT NULL,
	`approver` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_fill_id`) REFERENCES `form_fills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workflow_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`permit_type` text DEFAULT 'unknown' NOT NULL,
	`jurisdiction` text DEFAULT 'unknown' NOT NULL,
	`entity_type` text DEFAULT 'unknown' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`review_approved_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
