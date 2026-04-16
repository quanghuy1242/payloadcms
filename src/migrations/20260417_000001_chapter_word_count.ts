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
  await addColumnIfMissing(db, 'ALTER TABLE `chapters` ADD `chapter_word_count` numeric;')
  await addColumnIfMissing(db, 'ALTER TABLE `_chapters_v` ADD `version_chapter_word_count` numeric;')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await dropColumnIfExists(db, 'ALTER TABLE `chapters` DROP COLUMN `chapter_word_count`;')
  await dropColumnIfExists(db, 'ALTER TABLE `_chapters_v` DROP COLUMN `version_chapter_word_count`;')
}
