import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`books\` ADD \`visibility\` text DEFAULT 'public';`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_visibility\` text DEFAULT 'public';`)
  await db.run(sql`ALTER TABLE \`chapters\` ADD \`password\` text;`)
  await db.run(sql`ALTER TABLE \`chapters\` ADD \`has_password\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` ADD \`version_password\` text;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` ADD \`version_has_password\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`visibility\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_visibility\`;`)
  await db.run(sql`ALTER TABLE \`chapters\` DROP COLUMN \`password\`;`)
  await db.run(sql`ALTER TABLE \`chapters\` DROP COLUMN \`has_password\`;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` DROP COLUMN \`version_password\`;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` DROP COLUMN \`version_has_password\`;`)
}
