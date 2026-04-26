// @ts-nocheck
import {
  sqliteTable,
  AnySQLiteColumn,
  index,
  foreignKey,
  integer,
  text,
  uniqueIndex,
  numeric,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const usersSessions = sqliteTable(
  'users_sessions',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text().primaryKey().notNull(),
    createdAt: text('created_at'),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => [
    index('users_sessions_parent_id_idx').on(table.parentId),
    index('users_sessions_order_idx').on(table.order),
  ],
)

export const users = sqliteTable(
  'users',
  {
    id: integer().primaryKey().notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    email: text().notNull(),
    resetPasswordToken: text('reset_password_token'),
    resetPasswordExpiration: text('reset_password_expiration'),
    salt: text(),
    hash: text(),
    loginAttempts: numeric('login_attempts'),
    lockUntil: text('lock_until'),
    fullName: text('full_name').default('').notNull(),
    role: text().default('user').notNull(),
    avatarId: integer('avatar_id').references((): AnySQLiteColumn => media.id),
    enableAPIKey: integer('enable_a_p_i_key'),
    apiKey: text('api_key'),
    apiKeyIndex: text('api_key_index'),
    bio: text(),
    betterAuthUserId: text('better_auth_user_id'),
  },
  (table) => [
    uniqueIndex('users_better_auth_user_id_idx').on(table.betterAuthUserId),
    index('users_avatar_idx').on(table.avatarId),
    uniqueIndex('users_email_idx').on(table.email),
    index('users_created_at_idx').on(table.createdAt),
    index('users_updated_at_idx').on(table.updatedAt),
  ],
)

export const media = sqliteTable(
  'media',
  {
    id: integer().primaryKey().notNull(),
    alt: text().notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    url: text(),
    thumbnailURL: text('thumbnail_u_r_l'),
    filename: text(),
    mimeType: text('mime_type'),
    filesize: numeric(),
    width: numeric(),
    height: numeric(),
    focalX: numeric('focal_x'),
    focalY: numeric('focal_y'),
    ownerId: integer('owner_id').references((): AnySQLiteColumn => users.id),
    lowResUrl: text('low_res_url'),
    optimizedUrl: text('optimized_url'),
  },
  (table) => [
    index('media_owner_idx').on(table.ownerId),
    uniqueIndex('media_filename_idx').on(table.filename),
    index('media_created_at_idx').on(table.createdAt),
    index('media_updated_at_idx').on(table.updatedAt),
  ],
)

export const payloadLockedDocuments = sqliteTable(
  'payload_locked_documents',
  {
    id: integer().primaryKey().notNull(),
    globalSlug: text('global_slug'),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
  },
  (table) => [
    index('payload_locked_documents_created_at_idx').on(table.createdAt),
    index('payload_locked_documents_updated_at_idx').on(table.updatedAt),
    index('payload_locked_documents_global_slug_idx').on(table.globalSlug),
  ],
)

export const payloadLockedDocumentsRels = sqliteTable(
  'payload_locked_documents_rels',
  {
    id: integer().primaryKey().notNull(),
    order: integer(),
    parentId: integer('parent_id')
      .notNull()
      .references(() => payloadLockedDocuments.id, { onDelete: 'cascade' }),
    path: text().notNull(),
    usersId: integer('users_id').references(() => users.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').references(() => media.id, { onDelete: 'cascade' }),
    postsId: integer('posts_id').references(() => posts.id),
    categoriesId: integer('categories_id').references(() => categories.id),
    booksId: integer('books_id').references(() => books.id),
    chaptersId: integer('chapters_id').references(() => chapters.id),
    grantMirrorId: integer('grant_mirror_id').references(() => grantMirror.id),
    deferredGrantsId: integer('deferred_grants_id').references(() => deferredGrants.id),
  },
  (table) => [
    index('payload_locked_documents_rels_deferred_grants_id_idx').on(table.deferredGrantsId),
    index('payload_locked_documents_rels_grant_mirror_id_idx').on(table.grantMirrorId),
    index('payload_locked_documents_rels_chapters_id_idx').on(table.chaptersId),
    index('payload_locked_documents_rels_books_id_idx').on(table.booksId),
    index('payload_locked_documents_rels_categories_id_idx').on(table.categoriesId),
    index('payload_locked_documents_rels_posts_id_idx').on(table.postsId),
    index('payload_locked_documents_rels_media_id_idx').on(table.mediaId),
    index('payload_locked_documents_rels_users_id_idx').on(table.usersId),
    index('payload_locked_documents_rels_path_idx').on(table.path),
    index('payload_locked_documents_rels_parent_idx').on(table.parentId),
    index('payload_locked_documents_rels_order_idx').on(table.order),
  ],
)

export const payloadPreferences = sqliteTable(
  'payload_preferences',
  {
    id: integer().primaryKey().notNull(),
    key: text(),
    value: text(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
  },
  (table) => [
    index('payload_preferences_created_at_idx').on(table.createdAt),
    index('payload_preferences_updated_at_idx').on(table.updatedAt),
    index('payload_preferences_key_idx').on(table.key),
  ],
)

export const payloadPreferencesRels = sqliteTable(
  'payload_preferences_rels',
  {
    id: integer().primaryKey().notNull(),
    order: integer(),
    parentId: integer('parent_id')
      .notNull()
      .references(() => payloadPreferences.id, { onDelete: 'cascade' }),
    path: text().notNull(),
    usersId: integer('users_id').references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('payload_preferences_rels_users_id_idx').on(table.usersId),
    index('payload_preferences_rels_path_idx').on(table.path),
    index('payload_preferences_rels_parent_idx').on(table.parentId),
    index('payload_preferences_rels_order_idx').on(table.order),
  ],
)

export const payloadMigrations = sqliteTable(
  'payload_migrations',
  {
    id: integer().primaryKey().notNull(),
    name: text(),
    batch: numeric(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
  },
  (table) => [
    index('payload_migrations_created_at_idx').on(table.createdAt),
    index('payload_migrations_updated_at_idx').on(table.updatedAt),
  ],
)

export const postsTags = sqliteTable(
  'posts_tags',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    id: text().primaryKey().notNull(),
    tag: text(),
  },
  (table) => [
    index('posts_tags_parent_id_idx').on(table.parentId),
    index('posts_tags_order_idx').on(table.order),
  ],
)

export const homepage = sqliteTable(
  'homepage',
  {
    id: integer().primaryKey().notNull(),
    header: text().notNull(),
    subHeader: text('sub_header'),
    updatedAt: text('updated_at'),
    createdAt: text('created_at'),
    imageBannerId: integer('image_banner_id').references(() => media.id),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    metaImageId: integer('meta_image_id').references(() => media.id),
  },
  (table) => [
    index('homepage_meta_meta_image_idx').on(table.metaImageId),
    index('homepage_image_banner_idx').on(table.imageBannerId),
  ],
)

export const postsVVersionTags = sqliteTable(
  '_posts_v_version_tags',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => postsV.id, { onDelete: 'cascade' }),
    id: integer().primaryKey().notNull(),
    tag: text(),
    uuid: text('_uuid'),
  },
  (table) => [
    index('_posts_v_version_tags_parent_id_idx').on(table.parentId),
    index('_posts_v_version_tags_order_idx').on(table.order),
  ],
)

export const postsV = sqliteTable(
  '_posts_v',
  {
    id: integer().primaryKey().notNull(),
    parentId: integer('parent_id').references(() => posts.id, { onDelete: 'set null' }),
    versionTitle: text('version_title'),
    versionSlug: text('version_slug'),
    versionExcerpt: text('version_excerpt'),
    versionContent: text('version_content'),
    versionCoverImageId: integer('version_cover_image_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    versionAuthorId: integer('version_author_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    versionCategoryId: integer('version_category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    versionUpdatedAt: text('version_updated_at'),
    versionCreatedAt: text('version_created_at'),
    versionStatus: text('version__status').default('draft'),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    latest: integer(),
    autosave: integer(),
    versionMetaTitle: text('version_meta_title'),
    versionMetaDescription: text('version_meta_description'),
    versionMetaImageId: integer('version_meta_image_id').references(() => media.id),
  },
  (table) => [
    index('_posts_v_version_meta_version_meta_image_idx').on(table.versionMetaImageId),
    index('_posts_v_autosave_idx').on(table.autosave),
    index('_posts_v_latest_idx').on(table.latest),
    index('_posts_v_updated_at_idx').on(table.updatedAt),
    index('_posts_v_created_at_idx').on(table.createdAt),
    index('_posts_v_version_version__status_idx').on(table.versionStatus),
    index('_posts_v_version_version_created_at_idx').on(table.versionCreatedAt),
    index('_posts_v_version_version_updated_at_idx').on(table.versionUpdatedAt),
    index('_posts_v_version_version_category_idx').on(table.versionCategoryId),
    index('_posts_v_version_version_author_idx').on(table.versionAuthorId),
    index('_posts_v_version_version_cover_image_idx').on(table.versionCoverImageId),
    index('_posts_v_version_version_slug_idx').on(table.versionSlug),
    index('_posts_v_parent_idx').on(table.parentId),
  ],
)

export const posts = sqliteTable(
  'posts',
  {
    id: integer().primaryKey().notNull(),
    title: text(),
    slug: text(),
    excerpt: text(),
    content: text(),
    coverImageId: integer('cover_image_id').references(() => media.id, { onDelete: 'set null' }),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    status: text('_status').default('draft'),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    metaImageId: integer('meta_image_id').references(() => media.id),
  },
  (table) => [
    index('posts_meta_meta_image_idx').on(table.metaImageId),
    index('posts__status_idx').on(table.status),
    index('posts_created_at_idx').on(table.createdAt),
    index('posts_updated_at_idx').on(table.updatedAt),
    index('posts_category_idx').on(table.categoryId),
    index('posts_author_idx').on(table.authorId),
    index('posts_cover_image_idx').on(table.coverImageId),
    uniqueIndex('posts_slug_idx').on(table.slug),
  ],
)

export const categories = sqliteTable(
  'categories',
  {
    id: integer().primaryKey().notNull(),
    name: text().notNull(),
    slug: text(),
    description: text().notNull(),
    imageId: integer('image_id')
      .notNull()
      .references(() => media.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdById: integer('created_by_id').references(() => users.id),
  },
  (table) => [
    index('categories_created_by_idx').on(table.createdById),
    index('categories_created_at_idx').on(table.createdAt),
    index('categories_updated_at_idx').on(table.updatedAt),
    index('categories_image_idx').on(table.imageId),
    uniqueIndex('categories_slug_idx').on(table.slug),
  ],
)

export const books = sqliteTable(
  'books',
  {
    id: integer().primaryKey().notNull(),
    title: text().notNull(),
    author: text(),
    slug: text().notNull(),
    coverId: integer('cover_id').references(() => media.id, { onDelete: 'set null' }),
    origin: text().default('manual').notNull(),
    sourceType: text('source_type').default('manual').notNull(),
    sourceId: text('source_id'),
    sourceHash: text('source_hash'),
    sourceVersion: text('source_version'),
    syncStatus: text('sync_status').default('clean').notNull(),
    importBatchId: text('import_batch_id'),
    importStatus: text('import_status').default('idle').notNull(),
    importTotalChapters: numeric('import_total_chapters'),
    importCompletedChapters: numeric('import_completed_chapters'),
    importStartedAt: text('import_started_at'),
    importFinishedAt: text('import_finished_at'),
    importFailedAt: text('import_failed_at'),
    lastImportedAt: text('last_imported_at'),
    importErrorSummary: text('import_error_summary'),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    status: text('_status').default('draft'),
    description: text(),
    language: text(),
    publisher: text(),
    publicationDate: text('publication_date'),
    isbn: text(),
    chapterCount: numeric('chapter_count'),
    totalWordCount: numeric('total_word_count'),
    epubVersion: text('epub_version'),
    visibility: text().default('public'),
  },
  (table) => [
    index('books_isbn_idx').on(table.isbn),
    index('books__status_idx').on(table.status),
    index('books_created_at_idx').on(table.createdAt),
    index('books_updated_at_idx').on(table.updatedAt),
    index('books_import_batch_id_idx').on(table.importBatchId),
    index('books_source_hash_idx').on(table.sourceHash),
    index('books_source_id_idx').on(table.sourceId),
    index('books_created_by_idx').on(table.createdById),
    index('books_cover_idx').on(table.coverId),
    uniqueIndex('books_slug_idx').on(table.slug),
  ],
)

export const booksV = sqliteTable(
  '_books_v',
  {
    id: integer().primaryKey().notNull(),
    parentId: integer('parent_id').references(() => books.id, { onDelete: 'set null' }),
    versionTitle: text('version_title'),
    versionAuthor: text('version_author'),
    versionSlug: text('version_slug'),
    versionCoverId: integer('version_cover_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    versionOrigin: text('version_origin'),
    versionSourceType: text('version_source_type'),
    versionSourceId: text('version_source_id'),
    versionSourceHash: text('version_source_hash'),
    versionSourceVersion: text('version_source_version'),
    versionSyncStatus: text('version_sync_status'),
    versionImportBatchId: text('version_import_batch_id'),
    versionImportStatus: text('version_import_status'),
    versionImportTotalChapters: numeric('version_import_total_chapters'),
    versionImportCompletedChapters: numeric('version_import_completed_chapters'),
    versionImportStartedAt: text('version_import_started_at'),
    versionImportFinishedAt: text('version_import_finished_at'),
    versionImportFailedAt: text('version_import_failed_at'),
    versionLastImportedAt: text('version_last_imported_at'),
    versionImportErrorSummary: text('version_import_error_summary'),
    versionCreatedById: integer('version_created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    versionUpdatedAt: text('version_updated_at'),
    versionCreatedAt: text('version_created_at'),
    versionStatus: text('version__status').default('draft'),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    latest: integer(),
    autosave: integer(),
    versionDescription: text('version_description'),
    versionLanguage: text('version_language'),
    versionPublisher: text('version_publisher'),
    versionPublicationDate: text('version_publication_date'),
    versionIsbn: text('version_isbn'),
    versionChapterCount: numeric('version_chapter_count'),
    versionTotalWordCount: numeric('version_total_word_count'),
    versionEpubVersion: text('version_epub_version'),
    versionVisibility: text('version_visibility').default('public'),
  },
  (table) => [
    index('_books_v_version_version_isbn_idx').on(table.versionIsbn),
    index('_books_v_autosave_idx').on(table.autosave),
    index('_books_v_latest_idx').on(table.latest),
    index('_books_v_updated_at_idx').on(table.updatedAt),
    index('_books_v_created_at_idx').on(table.createdAt),
    index('_books_v_version_version__status_idx').on(table.versionStatus),
    index('_books_v_version_version_created_at_idx').on(table.versionCreatedAt),
    index('_books_v_version_version_updated_at_idx').on(table.versionUpdatedAt),
    index('_books_v_version_version_import_batch_id_idx').on(table.versionImportBatchId),
    index('_books_v_version_version_source_id_idx').on(table.versionSourceId),
    index('_books_v_version_version_created_by_idx').on(table.versionCreatedById),
    index('_books_v_version_version_cover_idx').on(table.versionCoverId),
    index('_books_v_version_version_slug_idx').on(table.versionSlug),
    index('_books_v_parent_idx').on(table.parentId),
  ],
)

export const chapters = sqliteTable(
  'chapters',
  {
    id: integer().primaryKey().notNull(),
    title: text().notNull(),
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'set null' }),
    order: numeric().notNull(),
    slug: text().notNull(),
    chapterSourceKey: text('chapter_source_key'),
    chapterSourceHash: text('chapter_source_hash'),
    importBatchId: text('import_batch_id'),
    manualEditedAt: text('manual_edited_at'),
    content: text(),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    status: text('_status').default('draft'),
    chapterWordCount: numeric('chapter_word_count'),
    password: text(),
    hasPassword: integer('has_password').default(false),
  },
  (table) => [
    uniqueIndex('chapters_book_order_unique_idx').on(table.bookId, table.order),
    index('chapters__status_idx').on(table.status),
    index('chapters_created_at_idx').on(table.createdAt),
    index('chapters_updated_at_idx').on(table.updatedAt),
    index('chapters_created_by_idx').on(table.createdById),
    index('chapters_manual_edited_at_idx').on(table.manualEditedAt),
    index('chapters_import_batch_id_idx').on(table.importBatchId),
    index('chapters_chapter_source_hash_idx').on(table.chapterSourceHash),
    index('chapters_chapter_source_key_idx').on(table.chapterSourceKey),
    index('chapters_slug_idx').on(table.slug),
    index('chapters_order_idx').on(table.order),
    index('chapters_book_idx').on(table.bookId),
  ],
)

export const chaptersV = sqliteTable(
  '_chapters_v',
  {
    id: integer().primaryKey().notNull(),
    parentId: integer('parent_id').references(() => chapters.id, { onDelete: 'set null' }),
    versionTitle: text('version_title'),
    versionBookId: integer('version_book_id').references(() => books.id, { onDelete: 'set null' }),
    versionOrder: numeric('version_order'),
    versionSlug: text('version_slug'),
    versionChapterSourceKey: text('version_chapter_source_key'),
    versionChapterSourceHash: text('version_chapter_source_hash'),
    versionImportBatchId: text('version_import_batch_id'),
    versionManualEditedAt: text('version_manual_edited_at'),
    versionContent: text('version_content'),
    versionCreatedById: integer('version_created_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    versionUpdatedAt: text('version_updated_at'),
    versionCreatedAt: text('version_created_at'),
    versionStatus: text('version__status').default('draft'),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    latest: integer(),
    autosave: integer(),
    versionChapterWordCount: numeric('version_chapter_word_count'),
    versionPassword: text('version_password'),
    versionHasPassword: integer('version_has_password').default(false),
  },
  (table) => [
    index('_chapters_v_autosave_idx').on(table.autosave),
    index('_chapters_v_latest_idx').on(table.latest),
    index('_chapters_v_updated_at_idx').on(table.updatedAt),
    index('_chapters_v_created_at_idx').on(table.createdAt),
    index('_chapters_v_version_version__status_idx').on(table.versionStatus),
    index('_chapters_v_version_version_created_at_idx').on(table.versionCreatedAt),
    index('_chapters_v_version_version_updated_at_idx').on(table.versionUpdatedAt),
    index('_chapters_v_version_version_created_by_idx').on(table.versionCreatedById),
    index('_chapters_v_version_version_manual_edited_at_idx').on(table.versionManualEditedAt),
    index('_chapters_v_version_version_import_batch_id_idx').on(table.versionImportBatchId),
    index('_chapters_v_version_version_chapter_source_hash_idx').on(table.versionChapterSourceHash),
    index('_chapters_v_version_version_chapter_source_key_idx').on(table.versionChapterSourceKey),
    index('_chapters_v_version_version_slug_idx').on(table.versionSlug),
    index('_chapters_v_version_version_order_idx').on(table.versionOrder),
    index('_chapters_v_version_version_book_idx').on(table.versionBookId),
    index('_chapters_v_parent_idx').on(table.parentId),
  ],
)

export const booksSubjects = sqliteTable(
  'books_subjects',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    id: text().primaryKey().notNull(),
    subject: text(),
  },
  (table) => [
    index('books_subjects_parent_id_idx').on(table.parentId),
    index('books_subjects_order_idx').on(table.order),
  ],
)

export const booksVVersionSubjects = sqliteTable(
  '_books_v_version_subjects',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => booksV.id, { onDelete: 'cascade' }),
    id: integer().primaryKey().notNull(),
    subject: text(),
    uuid: text('_uuid'),
  },
  (table) => [
    index('_books_v_version_subjects_parent_id_idx').on(table.parentId),
    index('_books_v_version_subjects_order_idx').on(table.order),
  ],
)

export const booksImportFailureLog = sqliteTable(
  'books_import_failure_log',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    id: text().primaryKey().notNull(),
    chapterIndex: numeric('chapter_index'),
    chapterTitle: text('chapter_title'),
    error: text(),
    timestamp: text(),
  },
  (table) => [
    index('books_import_failure_log_parent_id_idx').on(table.parentId),
    index('books_import_failure_log_order_idx').on(table.order),
  ],
)

export const booksVVersionImportFailureLog = sqliteTable(
  '_books_v_version_import_failure_log',
  {
    order: integer('_order').notNull(),
    parentId: integer('_parent_id')
      .notNull()
      .references(() => booksV.id, { onDelete: 'cascade' }),
    id: integer().primaryKey().notNull(),
    chapterIndex: numeric('chapter_index'),
    chapterTitle: text('chapter_title'),
    error: text(),
    timestamp: text(),
    uuid: text('_uuid'),
  },
  (table) => [
    index('_books_v_version_import_failure_log_parent_id_idx').on(table.parentId),
    index('_books_v_version_import_failure_log_order_idx').on(table.order),
  ],
)

export const grantMirror = sqliteTable(
  'grant_mirror',
  {
    id: integer().primaryKey().notNull(),
    autherTupleId: text('auther_tuple_id').notNull(),
    payloadUserIdId: integer('payload_user_id_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    relation: text().notNull(),
    sourceSubjectType: text('source_subject_type').notNull(),
    requiresLiveCheck: integer('requires_live_check').default(false),
    syncStatus: text('sync_status').default('active').notNull(),
    syncedAt: text('synced_at').notNull(),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
  },
  (table) => [
    index('syncStatus_syncedAt_idx').on(table.syncStatus, table.syncedAt),
    index('sourceSubjectType_payloadUserId_idx').on(table.sourceSubjectType, table.payloadUserIdId),
    index('payloadUserId_entityType_syncStatus_idx').on(
      table.payloadUserIdId,
      table.entityType,
      table.syncStatus,
    ),
    index('grant_mirror_created_at_idx').on(table.createdAt),
    index('grant_mirror_updated_at_idx').on(table.updatedAt),
    index('grant_mirror_payload_user_id_idx').on(table.payloadUserIdId),
    index('grant_mirror_auther_tuple_id_idx').on(table.autherTupleId),
  ],
)

export const deferredGrants = sqliteTable(
  'deferred_grants',
  {
    id: integer().primaryKey().notNull(),
    betterAuthUserId: text('better_auth_user_id').notNull(),
    tupleId: text('tuple_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    relation: text().notNull(),
    sourceSubjectType: text('source_subject_type').notNull(),
    hasCondition: integer('has_condition').default(false),
    status: text().default('pending').notNull(),
    processedAt: text('processed_at'),
    updatedAt: text('updated_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    createdAt: text('created_at').default("sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`").notNull(),
    type: text().default('grant'),
  },
  (table) => [
    index('deferred_grants_type_idx').on(table.type),
    index('deferred_grants_created_at_idx').on(table.createdAt),
    index('deferred_grants_updated_at_idx').on(table.updatedAt),
    index('deferred_grants_status_idx').on(table.status),
    index('deferred_grants_tuple_id_idx').on(table.tupleId),
    index('deferred_grants_better_auth_user_id_idx').on(table.betterAuthUserId),
  ],
)
