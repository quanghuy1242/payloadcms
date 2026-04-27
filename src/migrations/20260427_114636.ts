import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`chapters\` ADD \`password_version\` numeric DEFAULT 0;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` ADD \`version_password_version\` numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`chapters\` DROP COLUMN \`password_version\`;`)
  await db.run(sql`ALTER TABLE \`_chapters_v\` DROP COLUMN \`version_password_version\`;`)
}
