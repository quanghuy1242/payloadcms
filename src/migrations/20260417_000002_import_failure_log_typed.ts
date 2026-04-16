import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

const isDuplicateColumnError = (error: unknown): boolean => {
  return error instanceof Error && /duplicate column name/i.test(error.message)
}

const isMissingColumnError = (error: unknown): boolean => {
  return error instanceof Error && /no such column/i.test(error.message)
}

const addColumnIfMissing = async (db: MigrateUpArgs['db'], statement: string): Promise<void> => {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error
    }
  }
}

const dropColumnIfExists = async (
  db: MigrateDownArgs['db'],
  statement: string,
): Promise<void> => {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error
    }
  }
}

const booksImportFailureLogTableSql = [
  'CREATE TABLE IF NOT EXISTS `books_import_failure_log` (',
  '  `_order` integer NOT NULL,',
  '  `_parent_id` integer NOT NULL,',
  '  `id` text PRIMARY KEY NOT NULL,',
  '  `chapter_index` numeric,',
  '  `chapter_title` text,',
  '  `error` text,',
  '  `timestamp` text,',
  '  FOREIGN KEY (`_parent_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade',
  ');',
].join('\n')

const booksImportFailureLogVersionTableSql = [
  'CREATE TABLE IF NOT EXISTS `_books_v_version_import_failure_log` (',
  '  `_order` integer NOT NULL,',
  '  `_parent_id` integer NOT NULL,',
  '  `id` integer PRIMARY KEY NOT NULL,',
  '  `chapter_index` numeric,',
  '  `chapter_title` text,',
  '  `error` text,',
  '  `timestamp` text,',
  '  `_uuid` text,',
  '  FOREIGN KEY (`_parent_id`) REFERENCES `_books_v`(`id`) ON UPDATE no action ON DELETE cascade',
  ');',
].join('\n')

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(booksImportFailureLogTableSql))
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`books_import_failure_log_order_idx\` ON \`books_import_failure_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`books_import_failure_log_parent_id_idx\` ON \`books_import_failure_log\` (\`_parent_id\`);`)

  await db.run(sql.raw(booksImportFailureLogVersionTableSql))
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_books_v_version_import_failure_log_order_idx\` ON \`_books_v_version_import_failure_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_books_v_version_import_failure_log_parent_id_idx\` ON \`_books_v_version_import_failure_log\` (\`_parent_id\`);`)

  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `import_failure_log`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_import_failure_log`;')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`_books_v_version_import_failure_log\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`books_import_failure_log\`;`)

  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `import_failure_log` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_import_failure_log` text;')
}
