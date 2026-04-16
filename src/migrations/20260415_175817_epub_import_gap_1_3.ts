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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`books_subjects\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` text PRIMARY KEY NOT NULL,
	\`subject\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`books_subjects_order_idx\` ON \`books_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`books_subjects_parent_id_idx\` ON \`books_subjects\` (\`_parent_id\`);`)

  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `description` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `language` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `publisher` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `publication_date` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `isbn` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `chapter_count` numeric;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `total_word_count` numeric;')
  await addColumnIfMissing(db, 'ALTER TABLE `books` ADD `epub_version` text;')
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`books_isbn_idx\` ON \`books\` (\`isbn\`);`)

  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_description` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_language` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_publisher` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_publication_date` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_isbn` text;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_chapter_count` numeric;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_total_word_count` numeric;')
  await addColumnIfMissing(db, 'ALTER TABLE `_books_v` ADD `version_epub_version` text;')
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_books_v_version_version_isbn_idx\` ON \`_books_v\` (\`version_isbn\`);`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`_books_v_version_subjects\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`subject\` text,
	\`_uuid\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_books_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_books_v_version_subjects_order_idx\` ON \`_books_v_version_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`_books_v_version_subjects_parent_id_idx\` ON \`_books_v_version_subjects\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`_books_v_version_version_isbn_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`books_isbn_idx\`;`)

  await db.run(sql`DROP TABLE IF EXISTS \`_books_v_version_subjects\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`books_subjects\`;`)

  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_epub_version`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_total_word_count`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_chapter_count`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_isbn`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_publication_date`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_publisher`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_language`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_books_v` DROP COLUMN `version_description`;')

  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `epub_version`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `total_word_count`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `chapter_count`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `isbn`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `publication_date`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `publisher`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `language`;')
  await dropColumnIfExists(db, 'ALTER TABLE `books` DROP COLUMN `description`;')
}