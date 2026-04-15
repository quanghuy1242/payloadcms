import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`books_subjects\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`subject\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`books_subjects_order_idx\` ON \`books_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`books_subjects_parent_id_idx\` ON \`books_subjects\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`books\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`author\` text,
  	\`description\` text,
  	\`language\` text,
  	\`publisher\` text,
  	\`publication_date\` text,
  	\`isbn\` text,
  	\`chapter_count\` numeric,
  	\`total_word_count\` numeric,
  	\`epub_version\` text,
  	\`slug\` text,
  	\`cover_id\` integer,
  	\`origin\` text DEFAULT 'manual',
  	\`source_type\` text DEFAULT 'manual',
  	\`source_id\` text,
  	\`source_hash\` text,
  	\`source_version\` text,
  	\`sync_status\` text DEFAULT 'clean',
  	\`import_batch_id\` text,
  	\`import_status\` text DEFAULT 'idle',
  	\`import_total_chapters\` numeric,
  	\`import_completed_chapters\` numeric,
  	\`import_started_at\` text,
  	\`import_finished_at\` text,
  	\`import_failed_at\` text,
  	\`last_imported_at\` text,
  	\`import_error_summary\` text,
  	\`created_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`books_isbn_idx\` ON \`books\` (\`isbn\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`books_slug_idx\` ON \`books\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`books_cover_idx\` ON \`books\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`books_source_id_idx\` ON \`books\` (\`source_id\`);`)
  await db.run(sql`CREATE INDEX \`books_source_hash_idx\` ON \`books\` (\`source_hash\`);`)
  await db.run(sql`CREATE INDEX \`books_import_batch_id_idx\` ON \`books\` (\`import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`books_created_by_idx\` ON \`books\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`books_updated_at_idx\` ON \`books\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`books_created_at_idx\` ON \`books\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`books__status_idx\` ON \`books\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`_books_v_version_subjects\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`subject\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_books_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_books_v_version_subjects_order_idx\` ON \`_books_v_version_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_subjects_parent_id_idx\` ON \`_books_v_version_subjects\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_books_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_author\` text,
  	\`version_description\` text,
  	\`version_language\` text,
  	\`version_publisher\` text,
  	\`version_publication_date\` text,
  	\`version_isbn\` text,
  	\`version_chapter_count\` numeric,
  	\`version_total_word_count\` numeric,
  	\`version_epub_version\` text,
  	\`version_slug\` text,
  	\`version_cover_id\` integer,
  	\`version_origin\` text DEFAULT 'manual',
  	\`version_source_type\` text DEFAULT 'manual',
  	\`version_source_id\` text,
  	\`version_source_hash\` text,
  	\`version_source_version\` text,
  	\`version_sync_status\` text DEFAULT 'clean',
  	\`version_import_batch_id\` text,
  	\`version_import_status\` text DEFAULT 'idle',
  	\`version_import_total_chapters\` numeric,
  	\`version_import_completed_chapters\` numeric,
  	\`version_import_started_at\` text,
  	\`version_import_finished_at\` text,
  	\`version_import_failed_at\` text,
  	\`version_last_imported_at\` text,
  	\`version_import_error_summary\` text,
  	\`version_created_by_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	\`autosave\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_books_v_parent_idx\` ON \`_books_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_isbn_idx\` ON \`_books_v\` (\`version_isbn\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_slug_idx\` ON \`_books_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_cover_idx\` ON \`_books_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_source_id_idx\` ON \`_books_v\` (\`version_source_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_source_hash_idx\` ON \`_books_v\` (\`version_source_hash\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_import_batch_id_idx\` ON \`_books_v\` (\`version_import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_created_by_idx\` ON \`_books_v\` (\`version_created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_updated_at_idx\` ON \`_books_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_created_at_idx\` ON \`_books_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version__status_idx\` ON \`_books_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_created_at_idx\` ON \`_books_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_updated_at_idx\` ON \`_books_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_latest_idx\` ON \`_books_v\` (\`latest\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_autosave_idx\` ON \`_books_v\` (\`autosave\`);`)
  await db.run(sql`CREATE TABLE \`chapters\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`book_id\` integer,
  	\`order\` numeric,
  	\`slug\` text,
  	\`chapter_source_key\` text,
  	\`chapter_source_hash\` text,
  	\`import_batch_id\` text,
  	\`manual_edited_at\` text,
  	\`content\` text,
  	\`created_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`chapters_book_idx\` ON \`chapters\` (\`book_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_order_idx\` ON \`chapters\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`chapters_slug_idx\` ON \`chapters\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`chapters_chapter_source_key_idx\` ON \`chapters\` (\`chapter_source_key\`);`)
  await db.run(sql`CREATE INDEX \`chapters_chapter_source_hash_idx\` ON \`chapters\` (\`chapter_source_hash\`);`)
  await db.run(sql`CREATE INDEX \`chapters_import_batch_id_idx\` ON \`chapters\` (\`import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_created_by_idx\` ON \`chapters\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_updated_at_idx\` ON \`chapters\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`chapters_created_at_idx\` ON \`chapters\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`chapters__status_idx\` ON \`chapters\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`_chapters_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_book_id\` integer,
  	\`version_order\` numeric,
  	\`version_slug\` text,
  	\`version_chapter_source_key\` text,
  	\`version_chapter_source_hash\` text,
  	\`version_import_batch_id\` text,
  	\`version_manual_edited_at\` text,
  	\`version_content\` text,
  	\`version_created_by_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	\`autosave\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_chapters_v_parent_idx\` ON \`_chapters_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_book_idx\` ON \`_chapters_v\` (\`version_book_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_order_idx\` ON \`_chapters_v\` (\`version_order\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_slug_idx\` ON \`_chapters_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_chapter_source_key_idx\` ON \`_chapters_v\` (\`version_chapter_source_key\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_chapter_source_hash_idx\` ON \`_chapters_v\` (\`version_chapter_source_hash\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_import_batch_id_idx\` ON \`_chapters_v\` (\`version_import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_created_by_idx\` ON \`_chapters_v\` (\`version_created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_updated_at_idx\` ON \`_chapters_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_created_at_idx\` ON \`_chapters_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version__status_idx\` ON \`_chapters_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_created_at_idx\` ON \`_chapters_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_updated_at_idx\` ON \`_chapters_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_latest_idx\` ON \`_chapters_v\` (\`latest\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_autosave_idx\` ON \`_chapters_v\` (\`autosave\`);`)
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`better_auth_user_id\` text;`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_better_auth_user_id_idx\` ON \`users\` (\`better_auth_user_id\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_token\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_expiration\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`salt\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`hash\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`login_attempts\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`lock_until\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`books_id\` integer REFERENCES books(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`chapters_id\` integer REFERENCES chapters(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_books_id_idx\` ON \`payload_locked_documents_rels\` (\`books_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_chapters_id_idx\` ON \`payload_locked_documents_rels\` (\`chapters_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`DROP TABLE \`books_subjects\`;`)
  await db.run(sql`DROP TABLE \`books\`;`)
  await db.run(sql`DROP TABLE \`_books_v_version_subjects\`;`)
  await db.run(sql`DROP TABLE \`_books_v\`;`)
  await db.run(sql`DROP TABLE \`chapters\`;`)
  await db.run(sql`DROP TABLE \`_chapters_v\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`posts_id\` integer,
  	\`categories_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "posts_id", "categories_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "posts_id", "categories_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`DROP INDEX \`users_better_auth_user_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`reset_password_token\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`reset_password_expiration\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`salt\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`hash\` text;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`login_attempts\` numeric DEFAULT 0;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`lock_until\` text;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`better_auth_user_id\`;`)
}
