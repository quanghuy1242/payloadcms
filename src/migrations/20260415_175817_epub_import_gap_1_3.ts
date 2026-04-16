import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`books_subjects\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` text PRIMARY KEY NOT NULL,
	\`subject\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`books\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`books_subjects_order_idx\` ON \`books_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`books_subjects_parent_id_idx\` ON \`books_subjects\` (\`_parent_id\`);`)

  await db.run(sql`ALTER TABLE \`books\` ADD \`description\` text;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`language\` text;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`publisher\` text;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`publication_date\` text;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`isbn\` text;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`chapter_count\` numeric;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`total_word_count\` numeric;`)
  await db.run(sql`ALTER TABLE \`books\` ADD \`epub_version\` text;`)
  await db.run(sql`CREATE INDEX \`books_isbn_idx\` ON \`books\` (\`isbn\`);`)

  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_description\` text;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_language\` text;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_publisher\` text;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_publication_date\` text;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_isbn\` text;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_chapter_count\` numeric;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_total_word_count\` numeric;`)
  await db.run(sql`ALTER TABLE \`_books_v\` ADD \`version_epub_version\` text;`)
  await db.run(sql`CREATE INDEX \`_books_v_version_version_isbn_idx\` ON \`_books_v\` (\`version_isbn\`);`)

  await db.run(sql`CREATE TABLE \`_books_v_version_subjects\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`subject\` text,
	\`_uuid\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_books_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_books_v_version_subjects_order_idx\` ON \`_books_v_version_subjects\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_books_v_version_subjects_parent_id_idx\` ON \`_books_v_version_subjects\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`_books_v_version_version_isbn_idx\`;`)
  await db.run(sql`DROP INDEX \`books_isbn_idx\`;`)

  await db.run(sql`DROP TABLE \`_books_v_version_subjects\`;`)
  await db.run(sql`DROP TABLE \`books_subjects\`;`)

  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_epub_version\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_total_word_count\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_chapter_count\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_isbn\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_publication_date\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_publisher\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_language\`;`)
  await db.run(sql`ALTER TABLE \`_books_v\` DROP COLUMN \`version_description\`;`)

  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`epub_version\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`total_word_count\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`chapter_count\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`isbn\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`publication_date\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`publisher\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`language\`;`)
  await db.run(sql`ALTER TABLE \`books\` DROP COLUMN \`description\`;`)
}