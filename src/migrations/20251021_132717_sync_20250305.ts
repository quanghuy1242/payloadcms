import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`full_name\` text NOT NULL;`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'user' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`owner_id\` integer NOT NULL REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`media_owner_idx\` ON \`media\` (\`owner_id\`);`)
  await db.run(sql`ALTER TABLE \`categories\` ADD \`created_by_id\` integer NOT NULL REFERENCES users(id);`)
  await db.run(sql`CREATE INDEX \`categories_created_by_idx\` ON \`categories\` (\`created_by_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`INSERT INTO \`__new_media\`("id", "alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y") SELECT "id", "alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y" FROM \`media\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`ALTER TABLE \`__new_media\` RENAME TO \`media\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`__new_categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text,
  	\`description\` text NOT NULL,
  	\`image_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_categories\`("id", "name", "slug", "description", "image_id", "updated_at", "created_at") SELECT "id", "name", "slug", "description", "image_id", "updated_at", "created_at" FROM \`categories\`;`)
  await db.run(sql`DROP TABLE \`categories\`;`)
  await db.run(sql`ALTER TABLE \`__new_categories\` RENAME TO \`categories\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`categories_image_idx\` ON \`categories\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`full_name\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`)
}
