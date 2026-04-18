import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`grant_mirror\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`auther_tuple_id\` text NOT NULL,
  	\`payload_user_id_id\` integer NOT NULL,
  	\`entity_type\` text NOT NULL,
  	\`entity_id\` text NOT NULL,
  	\`relation\` text NOT NULL,
  	\`source_subject_type\` text NOT NULL,
  	\`requires_live_check\` integer DEFAULT false,
  	\`sync_status\` text DEFAULT 'active' NOT NULL,
  	\`synced_at\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`payload_user_id_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`grant_mirror_auther_tuple_id_idx\` ON \`grant_mirror\` (\`auther_tuple_id\`);`)
  await db.run(sql`CREATE INDEX \`grant_mirror_payload_user_id_idx\` ON \`grant_mirror\` (\`payload_user_id_id\`);`)
  await db.run(sql`CREATE INDEX \`grant_mirror_updated_at_idx\` ON \`grant_mirror\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`grant_mirror_created_at_idx\` ON \`grant_mirror\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`deferred_grants\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`better_auth_user_id\` text NOT NULL,
  	\`tuple_id\` text NOT NULL,
  	\`entity_type\` text NOT NULL,
  	\`entity_id\` text NOT NULL,
  	\`relation\` text NOT NULL,
  	\`source_subject_type\` text NOT NULL,
  	\`has_condition\` integer DEFAULT false,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`processed_at\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`deferred_grants_better_auth_user_id_idx\` ON \`deferred_grants\` (\`better_auth_user_id\`);`)
  await db.run(sql`CREATE INDEX \`deferred_grants_tuple_id_idx\` ON \`deferred_grants\` (\`tuple_id\`);`)
  await db.run(sql`CREATE INDEX \`deferred_grants_status_idx\` ON \`deferred_grants\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`deferred_grants_updated_at_idx\` ON \`deferred_grants\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`deferred_grants_created_at_idx\` ON \`deferred_grants\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`grant_mirror_id\` integer REFERENCES grant_mirror(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`deferred_grants_id\` integer REFERENCES deferred_grants(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_grant_mirror_id_idx\` ON \`payload_locked_documents_rels\` (\`grant_mirror_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_deferred_grants_id_idx\` ON \`payload_locked_documents_rels\` (\`deferred_grants_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`grant_mirror\`;`)
  await db.run(sql`DROP TABLE \`deferred_grants\`;`)
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`books_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`chapters_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`posts_id\`) REFERENCES \`posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "books_id", "chapters_id", "posts_id", "categories_id" FROM \`payload_locked_documents_rels\`;`)
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
}
