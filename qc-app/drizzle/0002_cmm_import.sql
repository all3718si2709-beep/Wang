CREATE TABLE `cmm_feature_maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spec_version_id` integer NOT NULL,
	`feature_key` text NOT NULL,
	`dimension_spec_id` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`spec_version_id`) REFERENCES `spec_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_spec_id`) REFERENCES `dimension_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cmm_map_unique` ON `cmm_feature_maps` (`spec_version_id`,`feature_key`);--> statement-breakpoint
CREATE TABLE `cmm_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`encoding` text,
	`piece_count` integer NOT NULL,
	`measurement_count` integer NOT NULL,
	`skipped` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action
);
