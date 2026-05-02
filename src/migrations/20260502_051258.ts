import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`comments\` ADD \`deleted_at\` text;`)
  await db.run(sql`ALTER TABLE \`comments\` ADD \`deleted_by_id\` integer REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`comments_deleted_by_idx\` ON \`comments\` (\`deleted_by_id\`);`)
  await db.run(sql`CREATE INDEX \`author_createdAt_idx\` ON \`comments\` (\`author_id\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`chapter_author_createdAt_idx\` ON \`comments\` (\`chapter_id\`,\`author_id\`,\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`post_author_createdAt_idx\` ON \`comments\` (\`post_id\`,\`author_id\`,\`created_at\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_comments\` (
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
  await db.run(sql`INSERT INTO \`__new_comments\`("id", "chapter_id", "post_id", "author_id", "content", "status", "parent_comment_id", "moderated_at", "moderated_by_id", "updated_at", "created_at") SELECT "id", "chapter_id", "post_id", "author_id", "content", "status", "parent_comment_id", "moderated_at", "moderated_by_id", "updated_at", "created_at" FROM \`comments\`;`)
  await db.run(sql`DROP TABLE \`comments\`;`)
  await db.run(sql`ALTER TABLE \`__new_comments\` RENAME TO \`comments\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
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
}
