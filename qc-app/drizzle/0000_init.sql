CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`actor` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`);--> statement-breakpoint
CREATE TABLE `dimension_specs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spec_version_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`name` text NOT NULL,
	`drawing_ref` text,
	`nominal` real NOT NULL,
	`tol_minus` real NOT NULL,
	`tol_plus` real NOT NULL,
	`unit` text DEFAULT 'mm' NOT NULL,
	`gauge` text NOT NULL,
	`frequency` text DEFAULT 'each' NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`decimals` integer DEFAULT 2 NOT NULL,
	FOREIGN KEY (`spec_version_id`) REFERENCES `spec_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dimspec_version` ON `dimension_specs` (`spec_version_id`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_no` text NOT NULL,
	`part_id` integer NOT NULL,
	`spec_version_id` integer NOT NULL,
	`inspection_type` text NOT NULL,
	`erp_work_order` text,
	`erp_po_no` text,
	`supplier_id` integer,
	`heat_no` text,
	`quantity` integer NOT NULL,
	`inspector` text,
	`status` text DEFAULT 'open' NOT NULL,
	`disposition` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`spec_version_id`) REFERENCES `spec_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_lot_no_unique` ON `lots` (`lot_no`);--> statement-breakpoint
CREATE INDEX `lots_part` ON `lots` (`part_id`);--> statement-breakpoint
CREATE INDEX `lots_created` ON `lots` (`created_at`);--> statement-breakpoint
CREATE TABLE `measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`piece_id` integer NOT NULL,
	`dimension_spec_id` integer NOT NULL,
	`value` real NOT NULL,
	`judgement` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`measured_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dimension_spec_id`) REFERENCES `dimension_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meas_piece_dim` ON `measurements` (`piece_id`,`dimension_spec_id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`part_no` text NOT NULL,
	`name` text NOT NULL,
	`drawing_no` text,
	`drawing_rev` text,
	`nominal_size_inch` real,
	`material` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parts_customer_partno` ON `parts` (`customer_id`,`part_no`);--> statement-breakpoint
CREATE TABLE `pieces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_id` integer NOT NULL,
	`seq_no` integer NOT NULL,
	`serial` text,
	`engine_verdict` text DEFAULT 'PENDING' NOT NULL,
	`final_verdict` text,
	`final_reason` text,
	`disposition` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pieces_lot_seq` ON `pieces` (`lot_id`,`seq_no`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spec_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_id` integer NOT NULL,
	`version` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`warn_ratio` real DEFAULT 0.8 NOT NULL,
	`notes` text,
	`activated_at` text,
	`retired_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_code_unique` ON `suppliers` (`code`);--> statement-breakpoint
CREATE TABLE `visual_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`piece_id` integer NOT NULL,
	`defect_code` text NOT NULL,
	`zone` text NOT NULL,
	`clock_position` integer,
	`size_mm` real,
	`count` integer DEFAULT 1 NOT NULL,
	`photo_path` text,
	`responsibility` text NOT NULL,
	`judgement` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finding_piece` ON `visual_findings` (`piece_id`);--> statement-breakpoint
CREATE TABLE `visual_specs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`spec_version_id` integer NOT NULL,
	`defect_code` text NOT NULL,
	`zone` text NOT NULL,
	`allowed` integer DEFAULT false NOT NULL,
	`max_size_mm` real,
	`max_count` integer,
	FOREIGN KEY (`spec_version_id`) REFERENCES `spec_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visualspec_unique` ON `visual_specs` (`spec_version_id`,`defect_code`,`zone`);