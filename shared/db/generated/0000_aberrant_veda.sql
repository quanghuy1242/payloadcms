-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `users_sessions` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`_parent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `users_sessions_parent_id_idx` ON `users_sessions` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `users_sessions_order_idx` ON `users_sessions` (`_order`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`email` text NOT NULL,
	`reset_password_token` text,
	`reset_password_expiration` text,
	`salt` text,
	`hash` text,
	`login_attempts` numeric DEFAULT 0,
	`lock_until` text,
	`full_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`avatar_id` integer,
	`enable_a_p_i_key` integer,
	`api_key` text,
	`api_key_index` text,
	`bio` text,
	`better_auth_user_id` text,
	FOREIGN KEY (`avatar_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_better_auth_user_id_idx` ON `users` (`better_auth_user_id`);--> statement-breakpoint
CREATE INDEX `users_avatar_idx` ON `users` (`avatar_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `users_updated_at_idx` ON `users` (`updated_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY NOT NULL,
	`alt` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`url` text,
	`thumbnail_u_r_l` text,
	`filename` text,
	`mime_type` text,
	`filesize` numeric,
	`width` numeric,
	`height` numeric,
	`focal_x` numeric,
	`focal_y` numeric,
	`owner_id` integer,
	`low_res_url` text,
	`optimized_url` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_owner_idx` ON `media` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_filename_idx` ON `media` (`filename`);--> statement-breakpoint
CREATE INDEX `media_created_at_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_updated_at_idx` ON `media` (`updated_at`);--> statement-breakpoint
CREATE TABLE `payload_locked_documents` (
	`id` integer PRIMARY KEY NOT NULL,
	`global_slug` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payload_locked_documents_created_at_idx` ON `payload_locked_documents` (`created_at`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_updated_at_idx` ON `payload_locked_documents` (`updated_at`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_global_slug_idx` ON `payload_locked_documents` (`global_slug`);--> statement-breakpoint
CREATE TABLE `payload_locked_documents_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` integer NOT NULL,
	`path` text NOT NULL,
	`users_id` integer,
	`media_id` integer,
	`posts_id` integer,
	`categories_id` integer,
	`books_id` integer,
	`chapters_id` integer,
	`grant_mirror_id` integer,
	`deferred_grants_id` integer,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `payload_locked_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deferred_grants_id`) REFERENCES `deferred_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_mirror_id`) REFERENCES `grant_mirror`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chapters_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`books_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`categories_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`posts_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_deferred_grants_id_idx` ON `payload_locked_documents_rels` (`deferred_grants_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_grant_mirror_id_idx` ON `payload_locked_documents_rels` (`grant_mirror_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_chapters_id_idx` ON `payload_locked_documents_rels` (`chapters_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_books_id_idx` ON `payload_locked_documents_rels` (`books_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_categories_id_idx` ON `payload_locked_documents_rels` (`categories_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_posts_id_idx` ON `payload_locked_documents_rels` (`posts_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_media_id_idx` ON `payload_locked_documents_rels` (`media_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_users_id_idx` ON `payload_locked_documents_rels` (`users_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_path_idx` ON `payload_locked_documents_rels` (`path`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_parent_idx` ON `payload_locked_documents_rels` (`parent_id`);--> statement-breakpoint
CREATE INDEX `payload_locked_documents_rels_order_idx` ON `payload_locked_documents_rels` (`order`);--> statement-breakpoint
CREATE TABLE `payload_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`key` text,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payload_preferences_created_at_idx` ON `payload_preferences` (`created_at`);--> statement-breakpoint
CREATE INDEX `payload_preferences_updated_at_idx` ON `payload_preferences` (`updated_at`);--> statement-breakpoint
CREATE INDEX `payload_preferences_key_idx` ON `payload_preferences` (`key`);--> statement-breakpoint
CREATE TABLE `payload_preferences_rels` (
	`id` integer PRIMARY KEY NOT NULL,
	`order` integer,
	`parent_id` integer NOT NULL,
	`path` text NOT NULL,
	`users_id` integer,
	FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `payload_preferences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payload_preferences_rels_users_id_idx` ON `payload_preferences_rels` (`users_id`);--> statement-breakpoint
CREATE INDEX `payload_preferences_rels_path_idx` ON `payload_preferences_rels` (`path`);--> statement-breakpoint
CREATE INDEX `payload_preferences_rels_parent_idx` ON `payload_preferences_rels` (`parent_id`);--> statement-breakpoint
CREATE INDEX `payload_preferences_rels_order_idx` ON `payload_preferences_rels` (`order`);--> statement-breakpoint
CREATE TABLE `payload_migrations` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`batch` numeric,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payload_migrations_created_at_idx` ON `payload_migrations` (`created_at`);--> statement-breakpoint
CREATE INDEX `payload_migrations_updated_at_idx` ON `payload_migrations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `posts_tags` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`tag` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posts_tags_parent_id_idx` ON `posts_tags` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `posts_tags_order_idx` ON `posts_tags` (`_order`);--> statement-breakpoint
CREATE TABLE `homepage` (
	`id` integer PRIMARY KEY NOT NULL,
	`header` text NOT NULL,
	`sub_header` text,
	`updated_at` text,
	`created_at` text,
	`image_banner_id` integer,
	`meta_title` text,
	`meta_description` text,
	`meta_image_id` integer,
	FOREIGN KEY (`meta_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_banner_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `homepage_meta_meta_image_idx` ON `homepage` (`meta_image_id`);--> statement-breakpoint
CREATE INDEX `homepage_image_banner_idx` ON `homepage` (`image_banner_id`);--> statement-breakpoint
CREATE TABLE `_posts_v_version_tags` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`tag` text,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_posts_v`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `_posts_v_version_tags_parent_id_idx` ON `_posts_v_version_tags` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_tags_order_idx` ON `_posts_v_version_tags` (`_order`);--> statement-breakpoint
CREATE TABLE `_posts_v` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`version_title` text,
	`version_slug` text,
	`version_excerpt` text,
	`version_content` text,
	`version_cover_image_id` integer,
	`version_author_id` integer,
	`version_category_id` integer,
	`version_updated_at` text,
	`version_created_at` text,
	`version__status` text DEFAULT 'draft',
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`latest` integer,
	`autosave` integer,
	`version_meta_title` text,
	`version_meta_description` text,
	`version_meta_image_id` integer,
	FOREIGN KEY (`version_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_cover_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_meta_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `_posts_v_version_meta_version_meta_image_idx` ON `_posts_v` (`version_meta_image_id`);--> statement-breakpoint
CREATE INDEX `_posts_v_autosave_idx` ON `_posts_v` (`autosave`);--> statement-breakpoint
CREATE INDEX `_posts_v_latest_idx` ON `_posts_v` (`latest`);--> statement-breakpoint
CREATE INDEX `_posts_v_updated_at_idx` ON `_posts_v` (`updated_at`);--> statement-breakpoint
CREATE INDEX `_posts_v_created_at_idx` ON `_posts_v` (`created_at`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version__status_idx` ON `_posts_v` (`version__status`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_created_at_idx` ON `_posts_v` (`version_created_at`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_updated_at_idx` ON `_posts_v` (`version_updated_at`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_category_idx` ON `_posts_v` (`version_category_id`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_author_idx` ON `_posts_v` (`version_author_id`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_cover_image_idx` ON `_posts_v` (`version_cover_image_id`);--> statement-breakpoint
CREATE INDEX `_posts_v_version_version_slug_idx` ON `_posts_v` (`version_slug`);--> statement-breakpoint
CREATE INDEX `_posts_v_parent_idx` ON `_posts_v` (`parent_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text,
	`slug` text,
	`excerpt` text,
	`content` text,
	`cover_image_id` integer,
	`author_id` integer,
	`category_id` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`_status` text DEFAULT 'draft',
	`meta_title` text,
	`meta_description` text,
	`meta_image_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`meta_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posts_meta_meta_image_idx` ON `posts` (`meta_image_id`);--> statement-breakpoint
CREATE INDEX `posts__status_idx` ON `posts` (`_status`);--> statement-breakpoint
CREATE INDEX `posts_created_at_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_updated_at_idx` ON `posts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `posts_category_idx` ON `posts` (`category_id`);--> statement-breakpoint
CREATE INDEX `posts_author_idx` ON `posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `posts_cover_image_idx` ON `posts` (`cover_image_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_idx` ON `posts` (`slug`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`description` text NOT NULL,
	`image_id` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by_id` integer,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_created_by_idx` ON `categories` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `categories_created_at_idx` ON `categories` (`created_at`);--> statement-breakpoint
CREATE INDEX `categories_updated_at_idx` ON `categories` (`updated_at`);--> statement-breakpoint
CREATE INDEX `categories_image_idx` ON `categories` (`image_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`slug` text NOT NULL,
	`cover_id` integer,
	`origin` text DEFAULT 'manual' NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`source_hash` text,
	`source_version` text,
	`sync_status` text DEFAULT 'clean' NOT NULL,
	`import_batch_id` text,
	`import_status` text DEFAULT 'idle' NOT NULL,
	`import_total_chapters` numeric,
	`import_completed_chapters` numeric,
	`import_started_at` text,
	`import_finished_at` text,
	`import_failed_at` text,
	`last_imported_at` text,
	`import_error_summary` text,
	`created_by_id` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`_status` text DEFAULT 'draft',
	`description` text,
	`language` text,
	`publisher` text,
	`publication_date` text,
	`isbn` text,
	`chapter_count` numeric,
	`total_word_count` numeric,
	`epub_version` text,
	`visibility` text DEFAULT 'public',
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `books_isbn_idx` ON `books` (`isbn`);--> statement-breakpoint
CREATE INDEX `books__status_idx` ON `books` (`_status`);--> statement-breakpoint
CREATE INDEX `books_created_at_idx` ON `books` (`created_at`);--> statement-breakpoint
CREATE INDEX `books_updated_at_idx` ON `books` (`updated_at`);--> statement-breakpoint
CREATE INDEX `books_import_batch_id_idx` ON `books` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `books_source_hash_idx` ON `books` (`source_hash`);--> statement-breakpoint
CREATE INDEX `books_source_id_idx` ON `books` (`source_id`);--> statement-breakpoint
CREATE INDEX `books_created_by_idx` ON `books` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `books_cover_idx` ON `books` (`cover_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `books_slug_idx` ON `books` (`slug`);--> statement-breakpoint
CREATE TABLE `_books_v` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`version_title` text,
	`version_author` text,
	`version_slug` text,
	`version_cover_id` integer,
	`version_origin` text,
	`version_source_type` text,
	`version_source_id` text,
	`version_source_hash` text,
	`version_source_version` text,
	`version_sync_status` text,
	`version_import_batch_id` text,
	`version_import_status` text,
	`version_import_total_chapters` numeric,
	`version_import_completed_chapters` numeric,
	`version_import_started_at` text,
	`version_import_finished_at` text,
	`version_import_failed_at` text,
	`version_last_imported_at` text,
	`version_import_error_summary` text,
	`version_created_by_id` integer,
	`version_updated_at` text,
	`version_created_at` text,
	`version__status` text DEFAULT 'draft',
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`latest` integer,
	`autosave` integer,
	`version_description` text,
	`version_language` text,
	`version_publisher` text,
	`version_publication_date` text,
	`version_isbn` text,
	`version_chapter_count` numeric,
	`version_total_word_count` numeric,
	`version_epub_version` text,
	`version_visibility` text DEFAULT 'public',
	FOREIGN KEY (`version_created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `_books_v_version_version_isbn_idx` ON `_books_v` (`version_isbn`);--> statement-breakpoint
CREATE INDEX `_books_v_autosave_idx` ON `_books_v` (`autosave`);--> statement-breakpoint
CREATE INDEX `_books_v_latest_idx` ON `_books_v` (`latest`);--> statement-breakpoint
CREATE INDEX `_books_v_updated_at_idx` ON `_books_v` (`updated_at`);--> statement-breakpoint
CREATE INDEX `_books_v_created_at_idx` ON `_books_v` (`created_at`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version__status_idx` ON `_books_v` (`version__status`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_created_at_idx` ON `_books_v` (`version_created_at`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_updated_at_idx` ON `_books_v` (`version_updated_at`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_import_batch_id_idx` ON `_books_v` (`version_import_batch_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_source_id_idx` ON `_books_v` (`version_source_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_created_by_idx` ON `_books_v` (`version_created_by_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_cover_idx` ON `_books_v` (`version_cover_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_version_slug_idx` ON `_books_v` (`version_slug`);--> statement-breakpoint
CREATE INDEX `_books_v_parent_idx` ON `_books_v` (`parent_id`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`book_id` integer NOT NULL,
	`order` numeric NOT NULL,
	`slug` text NOT NULL,
	`chapter_source_key` text,
	`chapter_source_hash` text,
	`import_batch_id` text,
	`manual_edited_at` text,
	`content` text,
	`created_by_id` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`_status` text DEFAULT 'draft',
	`chapter_word_count` numeric,
	`password` text,
	`has_password` integer DEFAULT false,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_book_order_unique_idx` ON `chapters` (`book_id`,`order`);--> statement-breakpoint
CREATE INDEX `chapters__status_idx` ON `chapters` (`_status`);--> statement-breakpoint
CREATE INDEX `chapters_created_at_idx` ON `chapters` (`created_at`);--> statement-breakpoint
CREATE INDEX `chapters_updated_at_idx` ON `chapters` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chapters_created_by_idx` ON `chapters` (`created_by_id`);--> statement-breakpoint
CREATE INDEX `chapters_manual_edited_at_idx` ON `chapters` (`manual_edited_at`);--> statement-breakpoint
CREATE INDEX `chapters_import_batch_id_idx` ON `chapters` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `chapters_chapter_source_hash_idx` ON `chapters` (`chapter_source_hash`);--> statement-breakpoint
CREATE INDEX `chapters_chapter_source_key_idx` ON `chapters` (`chapter_source_key`);--> statement-breakpoint
CREATE INDEX `chapters_slug_idx` ON `chapters` (`slug`);--> statement-breakpoint
CREATE INDEX `chapters_order_idx` ON `chapters` (`order`);--> statement-breakpoint
CREATE INDEX `chapters_book_idx` ON `chapters` (`book_id`);--> statement-breakpoint
CREATE TABLE `_chapters_v` (
	`id` integer PRIMARY KEY NOT NULL,
	`parent_id` integer,
	`version_title` text,
	`version_book_id` integer,
	`version_order` numeric,
	`version_slug` text,
	`version_chapter_source_key` text,
	`version_chapter_source_hash` text,
	`version_import_batch_id` text,
	`version_manual_edited_at` text,
	`version_content` text,
	`version_created_by_id` integer,
	`version_updated_at` text,
	`version_created_at` text,
	`version__status` text DEFAULT 'draft',
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`latest` integer,
	`autosave` integer,
	`version_chapter_word_count` numeric,
	`version_password` text,
	`version_has_password` integer DEFAULT false,
	FOREIGN KEY (`version_created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `_chapters_v_autosave_idx` ON `_chapters_v` (`autosave`);--> statement-breakpoint
CREATE INDEX `_chapters_v_latest_idx` ON `_chapters_v` (`latest`);--> statement-breakpoint
CREATE INDEX `_chapters_v_updated_at_idx` ON `_chapters_v` (`updated_at`);--> statement-breakpoint
CREATE INDEX `_chapters_v_created_at_idx` ON `_chapters_v` (`created_at`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version__status_idx` ON `_chapters_v` (`version__status`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_created_at_idx` ON `_chapters_v` (`version_created_at`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_updated_at_idx` ON `_chapters_v` (`version_updated_at`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_created_by_idx` ON `_chapters_v` (`version_created_by_id`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_manual_edited_at_idx` ON `_chapters_v` (`version_manual_edited_at`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_import_batch_id_idx` ON `_chapters_v` (`version_import_batch_id`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_chapter_source_hash_idx` ON `_chapters_v` (`version_chapter_source_hash`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_chapter_source_key_idx` ON `_chapters_v` (`version_chapter_source_key`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_slug_idx` ON `_chapters_v` (`version_slug`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_order_idx` ON `_chapters_v` (`version_order`);--> statement-breakpoint
CREATE INDEX `_chapters_v_version_version_book_idx` ON `_chapters_v` (`version_book_id`);--> statement-breakpoint
CREATE INDEX `_chapters_v_parent_idx` ON `_chapters_v` (`parent_id`);--> statement-breakpoint
CREATE TABLE `books_subjects` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`subject` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `books_subjects_parent_id_idx` ON `books_subjects` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `books_subjects_order_idx` ON `books_subjects` (`_order`);--> statement-breakpoint
CREATE TABLE `_books_v_version_subjects` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`subject` text,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_books_v`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `_books_v_version_subjects_parent_id_idx` ON `_books_v_version_subjects` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_subjects_order_idx` ON `_books_v_version_subjects` (`_order`);--> statement-breakpoint
CREATE TABLE `books_import_failure_log` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`chapter_index` numeric,
	`chapter_title` text,
	`error` text,
	`timestamp` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `books_import_failure_log_parent_id_idx` ON `books_import_failure_log` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `books_import_failure_log_order_idx` ON `books_import_failure_log` (`_order`);--> statement-breakpoint
CREATE TABLE `_books_v_version_import_failure_log` (
	`_order` integer NOT NULL,
	`_parent_id` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`chapter_index` numeric,
	`chapter_title` text,
	`error` text,
	`timestamp` text,
	`_uuid` text,
	FOREIGN KEY (`_parent_id`) REFERENCES `_books_v`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `_books_v_version_import_failure_log_parent_id_idx` ON `_books_v_version_import_failure_log` (`_parent_id`);--> statement-breakpoint
CREATE INDEX `_books_v_version_import_failure_log_order_idx` ON `_books_v_version_import_failure_log` (`_order`);--> statement-breakpoint
CREATE TABLE `grant_mirror` (
	`id` integer PRIMARY KEY NOT NULL,
	`auther_tuple_id` text NOT NULL,
	`payload_user_id_id` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`relation` text NOT NULL,
	`source_subject_type` text NOT NULL,
	`requires_live_check` integer DEFAULT false,
	`sync_status` text DEFAULT 'active' NOT NULL,
	`synced_at` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`payload_user_id_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `syncStatus_syncedAt_idx` ON `grant_mirror` (`sync_status`,`synced_at`);--> statement-breakpoint
CREATE INDEX `sourceSubjectType_payloadUserId_idx` ON `grant_mirror` (`source_subject_type`,`payload_user_id_id`);--> statement-breakpoint
CREATE INDEX `payloadUserId_entityType_syncStatus_idx` ON `grant_mirror` (`payload_user_id_id`,`entity_type`,`sync_status`);--> statement-breakpoint
CREATE INDEX `grant_mirror_created_at_idx` ON `grant_mirror` (`created_at`);--> statement-breakpoint
CREATE INDEX `grant_mirror_updated_at_idx` ON `grant_mirror` (`updated_at`);--> statement-breakpoint
CREATE INDEX `grant_mirror_payload_user_id_idx` ON `grant_mirror` (`payload_user_id_id`);--> statement-breakpoint
CREATE INDEX `grant_mirror_auther_tuple_id_idx` ON `grant_mirror` (`auther_tuple_id`);--> statement-breakpoint
CREATE TABLE `deferred_grants` (
	`id` integer PRIMARY KEY NOT NULL,
	`better_auth_user_id` text NOT NULL,
	`tuple_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`relation` text NOT NULL,
	`source_subject_type` text NOT NULL,
	`has_condition` integer DEFAULT false,
	`status` text DEFAULT 'pending' NOT NULL,
	`processed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`type` text DEFAULT 'grant'
);
--> statement-breakpoint
CREATE INDEX `deferred_grants_type_idx` ON `deferred_grants` (`type`);--> statement-breakpoint
CREATE INDEX `deferred_grants_created_at_idx` ON `deferred_grants` (`created_at`);--> statement-breakpoint
CREATE INDEX `deferred_grants_updated_at_idx` ON `deferred_grants` (`updated_at`);--> statement-breakpoint
CREATE INDEX `deferred_grants_status_idx` ON `deferred_grants` (`status`);--> statement-breakpoint
CREATE INDEX `deferred_grants_tuple_id_idx` ON `deferred_grants` (`tuple_id`);--> statement-breakpoint
CREATE INDEX `deferred_grants_better_auth_user_id_idx` ON `deferred_grants` (`better_auth_user_id`);
*/