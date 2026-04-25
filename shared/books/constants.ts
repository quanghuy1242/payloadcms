export const BOOK_ORIGINS = ['manual', 'epub-imported', 'synced'] as const
export const BOOK_SOURCE_TYPES = ['manual', 'epub-upload', 'meap-feed', 'external-sync'] as const
export const BOOK_IMPORT_STATUSES = ['idle', 'importing', 'ready', 'failed', 'canceled'] as const
export const BOOK_SYNC_STATUSES = ['clean', 'pending', 'conflicted', 'diverged'] as const
export const BOOK_VISIBILITIES = ['public', 'private'] as const
export const BOOK_STATUSES = ['draft', 'published'] as const

export type BookOrigin = (typeof BOOK_ORIGINS)[number]
export type BookSourceType = (typeof BOOK_SOURCE_TYPES)[number]
export type BookImportStatus = (typeof BOOK_IMPORT_STATUSES)[number]
export type BookSyncStatus = (typeof BOOK_SYNC_STATUSES)[number]
export type BookVisibility = (typeof BOOK_VISIBILITIES)[number]
export type BookStatus = (typeof BOOK_STATUSES)[number]
