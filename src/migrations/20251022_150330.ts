import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`homepage\` ADD \`image_banner_id\` integer REFERENCES media(id);`)
  await db.run(sql`ALTER TABLE \`homepage\` ADD \`meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`homepage\` ADD \`meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`homepage\` ADD \`meta_image_id\` integer REFERENCES media(id);`)
  await db.run(sql`CREATE INDEX \`homepage_image_banner_idx\` ON \`homepage\` (\`image_banner_id\`);`)
  await db.run(sql`CREATE INDEX \`homepage_meta_meta_image_idx\` ON \`homepage\` (\`meta_image_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_homepage\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`header\` text NOT NULL,
  	\`sub_header\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`INSERT INTO \`__new_homepage\`("id", "header", "sub_header", "updated_at", "created_at") SELECT "id", "header", "sub_header", "updated_at", "created_at" FROM \`homepage\`;`)
  await db.run(sql`DROP TABLE \`homepage\`;`)
  await db.run(sql`ALTER TABLE \`__new_homepage\` RENAME TO \`homepage\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}
