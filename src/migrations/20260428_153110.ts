import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`reading_progress\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`book_id\` integer NOT NULL,
  	\`chapter_id\` integer NOT NULL,
  	\`progress\` numeric DEFAULT 0,
  	\`completed_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`reading_progress_user_idx\` ON \`reading_progress\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`reading_progress_book_idx\` ON \`reading_progress\` (\`book_id\`);`)
  await db.run(sql`CREATE INDEX \`reading_progress_chapter_idx\` ON \`reading_progress\` (\`chapter_id\`);`)
  await db.run(sql`CREATE INDEX \`reading_progress_updated_at_idx\` ON \`reading_progress\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`reading_progress_created_at_idx\` ON \`reading_progress\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`bookmarks\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`content_type\` text NOT NULL,
  	\`chapter_id\` integer,
  	\`book_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`book_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`bookmarks_user_idx\` ON \`bookmarks\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`bookmarks_chapter_idx\` ON \`bookmarks\` (\`chapter_id\`);`)
  await db.run(sql`CREATE INDEX \`bookmarks_book_idx\` ON \`bookmarks\` (\`book_id\`);`)
  await db.run(sql`CREATE INDEX \`bookmarks_updated_at_idx\` ON \`bookmarks\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`bookmarks_created_at_idx\` ON \`bookmarks\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`reading_progress_id\` integer REFERENCES reading_progress(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`bookmarks_id\` integer REFERENCES bookmarks(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_reading_progress_id_idx\` ON \`payload_locked_documents_rels\` (\`reading_progress_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_bookmarks_id_idx\` ON \`payload_locked_documents_rels\` (\`bookmarks_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`reading_progress\`;`)
  await db.run(sql`DROP TABLE \`bookmarks\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`books_id\` integer,
  	\`chapters_id\` integer,
  	\`posts_id\` integer,
  	\`categories_id\` integer,
  	\`grant_mirror_id\` integer,
  	\`deferred_grants_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`books_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`chapters_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`grant_mirror_id\`) REFERENCES \`grant_mirror\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`deferred_grants_id\`) REFERENCES \`deferred_grants\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id", "grant_mirror_id", "deferred_grants_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id", "grant_mirror_id", "deferred_grants_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_books_id_idx\` ON \`payload_locked_documents_rels\` (\`books_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_chapters_id_idx\` ON \`payload_locked_documents_rels\` (\`chapters_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_grant_mirror_id_idx\` ON \`payload_locked_documents_rels\` (\`grant_mirror_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_deferred_grants_id_idx\` ON \`payload_locked_documents_rels\` (\`deferred_grants_id\`);`)
}
