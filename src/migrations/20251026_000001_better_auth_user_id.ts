import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'
import { sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`better_auth_user_id\` text;`)
  await db.run(
    sql`CREATE UNIQUE INDEX \`users_better_auth_user_id_idx\` ON \`users\` (\`better_auth_user_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`users_better_auth_user_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`better_auth_user_id\`;`)
}
