import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`comments\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`chapter_id\` integer,
  	\`post_id\` integer,
  	\`author_id\` integer NOT NULL,
  	\`content\` text NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`parent_comment_id\` integer,
  	\`moderated_at\` text,
  	\`moderated_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`post_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`parent_comment_id\`) REFERENCES \`comments\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`moderated_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`comments_chapter_idx\` ON \`comments\` (\`chapter_id\`);`)
  await db.run(sql`CREATE INDEX \`comments_post_idx\` ON \`comments\` (\`post_id\`);`)
  await db.run(sql`CREATE INDEX \`comments_author_idx\` ON \`comments\` (\`author_id\`);`)
  await db.run(sql`CREATE INDEX \`comments_status_idx\` ON \`comments\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`comments_parent_comment_idx\` ON \`comments\` (\`parent_comment_id\`);`)
  await db.run(sql`CREATE INDEX \`comments_moderated_by_idx\` ON \`comments\` (\`moderated_by_id\`);`)
  await db.run(sql`CREATE INDEX \`comments_updated_at_idx\` ON \`comments\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`comments_created_at_idx\` ON \`comments\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`chapter_status_createdAt_idx\` ON \`comments\` (\`chapter_id\`,\`status\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`post_status_createdAt_idx\` ON \`comments\` (\`post_id\`,\`status\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`chapter_author_status_createdAt_idx\` ON \`comments\` (\`chapter_id\`,\`author_id\`,\`status\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`post_author_status_createdAt_idx\` ON \`comments\` (\`post_id\`,\`author_id\`,\`status\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`status_createdAt_idx\` ON \`comments\` (\`status\`,\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`comments_id\` integer REFERENCES comments(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_comments_id_idx\` ON \`payload_locked_documents_rels\` (\`comments_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`DROP TABLE \`comments\`;`)
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
  	\`reading_progress_id\` integer,
  	\`bookmarks_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`books_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`chapters_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`grant_mirror_id\`) REFERENCES \`grant_mirror\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`deferred_grants_id\`) REFERENCES \`deferred_grants\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`reading_progress_id\`) REFERENCES \`reading_progress\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`bookmarks_id\`) REFERENCES \`bookmarks\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id", "grant_mirror_id", "deferred_grants_id", "reading_progress_id", "bookmarks_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id", "grant_mirror_id", "deferred_grants_id", "reading_progress_id", "bookmarks_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_reading_progress_id_idx\` ON \`payload_locked_documents_rels\` (\`reading_progress_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_bookmarks_id_idx\` ON \`payload_locked_documents_rels\` (\`bookmarks_id\`);`)
}
