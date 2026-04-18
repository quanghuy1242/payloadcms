import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`deferred_grants\` ADD \`type\` text DEFAULT 'grant';`)
  await db.run(sql`CREATE INDEX \`deferred_grants_type_idx\` ON \`deferred_grants\` (\`type\`);`)
  await db.run(sql`CREATE INDEX \`payloadUserId_entityType_syncStatus_idx\` ON \`grant_mirror\` (\`payload_user_id_id\`,\`entity_type\`,\`sync_status\`);`)
  await db.run(sql`CREATE INDEX \`sourceSubjectType_payloadUserId_idx\` ON \`grant_mirror\` (\`source_subject_type\`,\`payload_user_id_id\`);`)
  await db.run(sql`CREATE INDEX \`syncStatus_syncedAt_idx\` ON \`grant_mirror\` (\`sync_status\`,\`synced_at\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`payloadUserId_entityType_syncStatus_idx\`;`)
  await db.run(sql`DROP INDEX \`sourceSubjectType_payloadUserId_idx\`;`)
  await db.run(sql`DROP INDEX \`syncStatus_syncedAt_idx\`;`)
  await db.run(sql`DROP INDEX \`deferred_grants_type_idx\`;`)
  await db.run(sql`ALTER TABLE \`deferred_grants\` DROP COLUMN \`type\`;`)
}
