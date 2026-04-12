import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \
\t\`books\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`title\` text NOT NULL,
\t\`author\` text,
\t\`slug\` text NOT NULL,
\t\`cover_id\` integer,
\t\`origin\` text DEFAULT 'manual' NOT NULL,
\t\`source_type\` text DEFAULT 'manual' NOT NULL,
\t\`source_id\` text,
\t\`source_hash\` text,
\t\`source_version\` text,
\t\`sync_status\` text DEFAULT 'clean' NOT NULL,
\t\`import_batch_id\` text,
\t\`import_status\` text DEFAULT 'idle' NOT NULL,
\t\`import_total_chapters\` numeric,
\t\`import_completed_chapters\` numeric,
\t\`import_started_at\` text,
\t\`import_finished_at\` text,
\t\`import_failed_at\` text,
\t\`last_imported_at\` text,
\t\`import_error_summary\` text,
\t\`created_by_id\` integer NOT NULL,
\t\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`_status\` text DEFAULT 'draft',
\tFOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
);
`)
  await db.run(sql`CREATE UNIQUE INDEX \`books_slug_idx\` ON \`books\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`books_cover_idx\` ON \`books\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`books_created_by_idx\` ON \`books\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`books_source_id_idx\` ON \`books\` (\`source_id\`);`)
  await db.run(sql`CREATE INDEX \`books_source_hash_idx\` ON \`books\` (\`source_hash\`);`)
  await db.run(sql`CREATE INDEX \`books_import_batch_id_idx\` ON \`books\` (\`import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`books_updated_at_idx\` ON \`books\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`books_created_at_idx\` ON \`books\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`books__status_idx\` ON \`books\` (\`_status\`);`)

  await db.run(sql`CREATE TABLE \
\t\`_books_v\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`parent_id\` integer,
\t\`version_title\` text,
\t\`version_author\` text,
\t\`version_slug\` text,
\t\`version_cover_id\` integer,
\t\`version_origin\` text,
\t\`version_source_type\` text,
\t\`version_source_id\` text,
\t\`version_source_hash\` text,
\t\`version_source_version\` text,
\t\`version_sync_status\` text,
\t\`version_import_batch_id\` text,
\t\`version_import_status\` text,
\t\`version_import_total_chapters\` numeric,
\t\`version_import_completed_chapters\` numeric,
\t\`version_import_started_at\` text,
\t\`version_import_finished_at\` text,
\t\`version_import_failed_at\` text,
\t\`version_last_imported_at\` text,
\t\`version_import_error_summary\` text,
\t\`version_created_by_id\` integer,
\t\`version_updated_at\` text,
\t\`version_created_at\` text,
\t\`version__status\` text DEFAULT 'draft',
\t\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`latest\` integer,
\t\`autosave\` integer,
\tFOREIGN KEY (\`parent_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`version_created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
);
`)
  await db.run(sql`CREATE INDEX \`_books_v_parent_idx\` ON \`_books_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_slug_idx\` ON \`_books_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_cover_idx\` ON \`_books_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_created_by_idx\` ON \`_books_v\` (\`version_created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_source_id_idx\` ON \`_books_v\` (\`version_source_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_import_batch_id_idx\` ON \`_books_v\` (\`version_import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_updated_at_idx\` ON \`_books_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_created_at_idx\` ON \`_books_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version__status_idx\` ON \`_books_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_created_at_idx\` ON \`_books_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_updated_at_idx\` ON \`_books_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_latest_idx\` ON \`_books_v\` (\`latest\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_autosave_idx\` ON \`_books_v\` (\`autosave\`);`)

  await db.run(sql`CREATE TABLE \
\t\`chapters\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`title\` text NOT NULL,
\t\`book_id\` integer NOT NULL,
\t\`order\` numeric NOT NULL,
\t\`slug\` text NOT NULL,
\t\`chapter_source_key\` text,
\t\`chapter_source_hash\` text,
\t\`import_batch_id\` text,
\t\`manual_edited_at\` text,
\t\`content\` text,
\t\`created_by_id\` integer NOT NULL,
\t\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`_status\` text DEFAULT 'draft',
\tFOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
);
`)
  await db.run(sql`CREATE INDEX \`chapters_book_idx\` ON \`chapters\` (\`book_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_order_idx\` ON \`chapters\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`chapters_slug_idx\` ON \`chapters\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`chapters_chapter_source_key_idx\` ON \`chapters\` (\`chapter_source_key\`);`)
  await db.run(sql`CREATE INDEX \`chapters_chapter_source_hash_idx\` ON \`chapters\` (\`chapter_source_hash\`);`)
  await db.run(sql`CREATE INDEX \`chapters_import_batch_id_idx\` ON \`chapters\` (\`import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_manual_edited_at_idx\` ON \`chapters\` (\`manual_edited_at\`);`)
  await db.run(sql`CREATE INDEX \`chapters_created_by_idx\` ON \`chapters\` (\`created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`chapters_updated_at_idx\` ON \`chapters\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`chapters_created_at_idx\` ON \`chapters\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`chapters__status_idx\` ON \`chapters\` (\`_status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`chapters_book_order_unique_idx\` ON \`chapters\` (\`book_id\`, \`order\`);`)

  await db.run(sql`CREATE TABLE \
\t\`_chapters_v\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`parent_id\` integer,
\t\`version_title\` text,
\t\`version_book_id\` integer,
\t\`version_order\` numeric,
\t\`version_slug\` text,
\t\`version_chapter_source_key\` text,
\t\`version_chapter_source_hash\` text,
\t\`version_import_batch_id\` text,
\t\`version_manual_edited_at\` text,
\t\`version_content\` text,
\t\`version_created_by_id\` integer,
\t\`version_updated_at\` text,
\t\`version_created_at\` text,
\t\`version__status\` text DEFAULT 'draft',
\t\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
\t\`latest\` integer,
\t\`autosave\` integer,
\tFOREIGN KEY (\`parent_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`version_book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
\tFOREIGN KEY (\`version_created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
);
`)
  await db.run(sql`CREATE INDEX \`_chapters_v_parent_idx\` ON \`_chapters_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_book_idx\` ON \`_chapters_v\` (\`version_book_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_order_idx\` ON \`_chapters_v\` (\`version_order\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_slug_idx\` ON \`_chapters_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_chapter_source_key_idx\` ON \`_chapters_v\` (\`version_chapter_source_key\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_chapter_source_hash_idx\` ON \`_chapters_v\` (\`version_chapter_source_hash\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_import_batch_id_idx\` ON \`_chapters_v\` (\`version_import_batch_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_manual_edited_at_idx\` ON \`_chapters_v\` (\`version_manual_edited_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_created_by_idx\` ON \`_chapters_v\` (\`version_created_by_id\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_updated_at_idx\` ON \`_chapters_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version_created_at_idx\` ON \`_chapters_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_version_version__status_idx\` ON \`_chapters_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_created_at_idx\` ON \`_chapters_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_updated_at_idx\` ON \`_chapters_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_latest_idx\` ON \`_chapters_v\` (\`latest\`);`)
  await db.run(sql`CREATE INDEX \`_chapters_v_autosave_idx\` ON \`_chapters_v\` (\`autosave\`);`)

  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`books_id\` integer REFERENCES books(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`chapters_id\` integer REFERENCES chapters(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_books_id_idx\` ON \`payload_locked_documents_rels\` (\`books_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_chapters_id_idx\` ON \`payload_locked_documents_rels\` (\`chapters_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_books_id_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_chapters_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`books_id\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`chapters_id\`;`)

  await db.run(sql`DROP TABLE \`_chapters_v\`;`)
  await db.run(sql`DROP TABLE \`chapters\`;`)
  await db.run(sql`DROP TABLE \`_books_v\`;`)
  await db.run(sql`DROP TABLE \`books\`;`)
}
