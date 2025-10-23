import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`posts\` DROP COLUMN \`date\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_date\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`posts\` ADD \`date\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_date\` text;`)
}
