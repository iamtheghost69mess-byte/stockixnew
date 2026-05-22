CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`adults` integer DEFAULT 1 NOT NULL,
	`children` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`booking_status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT 1747270516054 NOT NULL,
	`updated_at` integer DEFAULT 1747270516054 NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`address` text,
	`city` text,
	`state` text,
	`country` text,
	`zip_code` text,
	`id_type` text,
	`id_number` text,
	`notes` text,
	`created_at` integer DEFAULT 1747270516054 NOT NULL,
	`updated_at` integer DEFAULT 1747270516054 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`transaction_id` text,
	`notes` text,
	`created_at` integer DEFAULT 1747270516054 NOT NULL,
	`updated_at` integer DEFAULT 1747270516054 NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`state` text,
	`country` text NOT NULL,
	`zip_code` text,
	`phone` text,
	`email` text,
	`website` text,
	`description` text,
	`created_at` integer DEFAULT 1747270516054 NOT NULL,
	`updated_at` integer DEFAULT 1747270516054 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`capacity` integer NOT NULL,
	`rate` integer NOT NULL,
	`description` text,
	`amenities` text,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` integer DEFAULT 1747270516054 NOT NULL,
	`updated_at` integer DEFAULT 1747270516054 NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`created_at` integer DEFAULT 1747270516053 NOT NULL,
	`updated_at` integer DEFAULT 1747270516053 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);