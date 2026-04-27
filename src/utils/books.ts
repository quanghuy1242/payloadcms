import type {
  Access,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  PayloadRequest,
} from 'payload'

import { purgeCloudflareCacheTags } from '@/lib/cloudflareCache'

import { ownerAccess } from './access-shared'
import { normalizeEntityId } from './identifiers'
import { requestJSONWithRetry } from './http'
import { toPositiveInteger } from './numbers'

/** All valid book origin values, representing how a book was created. */
export const BOOK_ORIGINS = ['manual', 'epub-imported', 'synced'] as const
/** All valid book source type values, representing the data source for a book's content. */
export const BOOK_SOURCE_TYPES = ['manual', 'epub-upload', 'meap-feed', 'external-sync'] as const
/** All valid import status values for a book's EPUB import lifecycle. */
export const BOOK_IMPORT_STATUSES = ['idle', 'importing', 'ready', 'failed', 'canceled'] as const
/** All valid sync status values describing whether a book's remote content is in sync. */
export const BOOK_SYNC_STATUSES = ['clean', 'pending', 'conflicted', 'diverged'] as const

/** A book origin — one of the values in {@link BOOK_ORIGINS}. */
export type BookOrigin = (typeof BOOK_ORIGINS)[number]
/** A book source type — one of the values in {@link BOOK_SOURCE_TYPES}. */
export type BookSourceType = (typeof BOOK_SOURCE_TYPES)[number]
/** An import status — one of the values in {@link BOOK_IMPORT_STATUSES}. */
export type BookImportStatus = (typeof BOOK_IMPORT_STATUSES)[number]
/** A sync status — one of the values in {@link BOOK_SYNC_STATUSES}. */
export type BookSyncStatus = (typeof BOOK_SYNC_STATUSES)[number]

/** Custom event name dispatched when a book's chapter list changes. */
export const BOOK_CHAPTERS_UPDATED_EVENT = 'payload:book-chapters-updated' as const

export const BOOKS_LIST_CACHE_TAG = 'books:list' as const

const BOOK_CACHE_TAG_PREFIX = 'book:'
const BOOK_SLUG_CACHE_TAG_PREFIX = 'book:slug:'
const CHAPTER_CACHE_TAG_PREFIX = 'chapter:'
const CHAPTER_SLUG_CACHE_TAG_PREFIX = 'chapter:slug:'
const CHAPTERS_BY_BOOK_CACHE_TAG_PREFIX = 'chapters:book:'
const CHAPTER_PAGE_CACHE_TAG_PREFIX = 'chapter-page:book:'

type BookRecord = {
  importErrorSummary?: string | null
  importFailedAt?: string | null
  importFinishedAt?: string | null
  importStartedAt?: string | null
  importStatus?: BookImportStatus | null
  lastImportedAt?: string | null
  [key: string]: unknown
}

const nowISO = () => {
  return new Date().toISOString()
}

const normalizeCacheTagValue = (value: unknown): string | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }

    const normalizedValue = String(Math.trunc(value)).trim()

    return normalizedValue.length > 0 ? normalizedValue : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

const buildScopedCacheTag = (prefix: string, value: unknown): string | null => {
  const normalizedValue = normalizeCacheTagValue(value)

  if (!normalizedValue) {
    return null
  }

  return `${prefix}${normalizedValue}`
}

const buildScopedRouteCacheTag = (
  prefix: string,
  firstValue: unknown,
  secondValue: unknown,
): string | null => {
  const normalizedFirstValue = normalizeCacheTagValue(firstValue)
  const normalizedSecondValue = normalizeCacheTagValue(secondValue)

  if (!normalizedFirstValue || !normalizedSecondValue) {
    return null
  }

  return `${prefix}${normalizedFirstValue}:${normalizedSecondValue}`
}

export const normalizeCacheTags = (tags: Array<string | null | undefined>): string[] => {
  return Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => tag.length > 0),
    ),
  )
}

export const buildBooksListCacheTags = (): string[] => {
  return [BOOKS_LIST_CACHE_TAG]
}

export const buildBookCacheTags = (bookId: unknown): string[] => {
  return normalizeCacheTags([buildScopedCacheTag(BOOK_CACHE_TAG_PREFIX, bookId)])
}

export const buildBookSlugCacheTags = (bookSlug: unknown): string[] => {
  return normalizeCacheTags([buildScopedCacheTag(BOOK_SLUG_CACHE_TAG_PREFIX, bookSlug)])
}

export const buildBookDetailCacheTags = (bookId: unknown): string[] => {
  return normalizeCacheTags([
    buildScopedCacheTag(BOOK_CACHE_TAG_PREFIX, bookId),
    buildScopedCacheTag(CHAPTERS_BY_BOOK_CACHE_TAG_PREFIX, bookId),
  ])
}

export const buildChaptersByBookCacheTags = (bookId: unknown): string[] => {
  return normalizeCacheTags([buildScopedCacheTag(CHAPTERS_BY_BOOK_CACHE_TAG_PREFIX, bookId)])
}

export const buildChapterPageCacheTags = (bookId: unknown, chapterId?: unknown): string[] => {
  return normalizeCacheTags([
    buildScopedCacheTag(BOOK_CACHE_TAG_PREFIX, bookId),
    buildScopedCacheTag(CHAPTER_CACHE_TAG_PREFIX, chapterId),
    buildScopedCacheTag(CHAPTERS_BY_BOOK_CACHE_TAG_PREFIX, bookId),
  ])
}

export const buildChapterPageLookupCacheTags = (
  bookId: unknown,
  chapterSlug: unknown,
): string[] => {
  return normalizeCacheTags([
    buildScopedRouteCacheTag(CHAPTER_PAGE_CACHE_TAG_PREFIX, bookId, chapterSlug),
    buildScopedCacheTag(BOOK_CACHE_TAG_PREFIX, bookId),
    buildScopedCacheTag(CHAPTER_SLUG_CACHE_TAG_PREFIX, chapterSlug),
    buildScopedCacheTag(CHAPTERS_BY_BOOK_CACHE_TAG_PREFIX, bookId),
  ])
}

export const buildChapterSlugCacheTags = (chapterSlug: unknown): string[] => {
  return normalizeCacheTags([buildScopedCacheTag(CHAPTER_SLUG_CACHE_TAG_PREFIX, chapterSlug)])
}

export const buildBookPurgeTags = (bookId: unknown): string[] => {
  return normalizeCacheTags([
    ...buildBooksListCacheTags(),
    ...buildBookDetailCacheTags(bookId),
  ])
}

export const buildChapterPurgeTags = ({
  bookId,
  chapterId,
  previousBookId,
}: {
  bookId: unknown
  chapterId?: unknown
  previousBookId?: unknown
}): string[] => {
  return normalizeCacheTags([
    ...buildBooksListCacheTags(),
    ...buildChapterPageCacheTags(bookId, chapterId),
    ...(previousBookId != null ? buildBookDetailCacheTags(previousBookId) : []),
  ])
}

/** Coerces an unknown value to a valid {@link BookImportStatus}, returning `null` if the value is not a recognised status. */
const normalizeImportStatus = (value: unknown): BookImportStatus | null => {
  if (typeof value !== 'string') {
    return null
  }

  return BOOK_IMPORT_STATUSES.includes(value as BookImportStatus) ? (value as BookImportStatus) : null
}

/**
 * Payload `beforeChange` hook that manages import lifecycle timestamps on a Book document.
 *
 * Automatically sets `importStartedAt`, `importFinishedAt`, `importFailedAt`, and
 * `lastImportedAt` based on the incoming `importStatus` transition.
 */
export const applyBookImportLifecycleHook: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  const workingData = data ? { ...data } : {}
  const workingRecord = workingData as BookRecord
  const previousRecord = (originalDoc as BookRecord | undefined) ?? {}

  const previousStatus = normalizeImportStatus(previousRecord.importStatus)
  const nextStatus =
    normalizeImportStatus(workingRecord.importStatus) ??
    previousStatus ??
    BOOK_IMPORT_STATUSES[0]

  workingRecord.importStatus = nextStatus

  const lifecycleNow = nowISO()

  if (operation === 'create') {
    if (nextStatus === 'importing' && !workingRecord.importStartedAt) {
      workingRecord.importStartedAt = lifecycleNow
    }

    if (nextStatus === 'ready') {
      workingRecord.importFinishedAt = workingRecord.importFinishedAt ?? lifecycleNow
      workingRecord.lastImportedAt = workingRecord.lastImportedAt ?? lifecycleNow
      workingRecord.importFailedAt = null
      workingRecord.importErrorSummary = null
    }

    if (nextStatus === 'failed' && !workingRecord.importFailedAt) {
      workingRecord.importFailedAt = lifecycleNow
    }

    return workingData
  }

  if (nextStatus !== previousStatus) {
    if (nextStatus === 'importing') {
      workingRecord.importStartedAt = lifecycleNow
      workingRecord.importFinishedAt = null
      workingRecord.importFailedAt = null
      workingRecord.importErrorSummary = null
    }

    if (nextStatus === 'ready') {
      workingRecord.importFinishedAt = lifecycleNow
      workingRecord.lastImportedAt = lifecycleNow
      workingRecord.importFailedAt = null
      workingRecord.importErrorSummary = null
    }

    if (nextStatus === 'failed') {
      workingRecord.importFailedAt = lifecycleNow
    }

    if (nextStatus === 'canceled') {
      // User-initiated cancellation — no failure timestamp, no error clearing.
      workingRecord.importFinishedAt = null
    }
  }

  return workingData
}

type ChapterRecord = {
  book?: unknown
  id?: unknown
  order?: unknown
  [key: string]: unknown
}

type ChapterPasswordRecord = {
  hasPassword?: boolean
  password?: unknown
  [key: string]: unknown
}

type ChapterCountResponse = {
  totalDocs?: number
}

/**
 * Builds a Payload `where` filter that matches chapters belonging to the given book.
 * Returns `null` when `bookId` cannot be normalised to a valid entity ID.
 */
const buildChapterFilter = (bookId: unknown): { book: { equals: string | number } } | null => {
  const normalizedBookId = normalizeEntityId(bookId)

  if (normalizedBookId == null) {
    return null
  }

  return {
    book: {
      equals: normalizedBookId,
    },
  }
}

/**
 * Returns the total number of chapters associated with a book via a server-side Payload query.
 * Returns `0` when `bookId` cannot be resolved.
 * @param req - The current Payload request (provides access to the Payload instance).
 * @param bookId - The book ID to count chapters for; accepts any normalizable value.
 */
export const countBookChapters = async (req: PayloadRequest, bookId: unknown): Promise<number> => {
  const where = buildChapterFilter(bookId)

  if (!where) {
    return 0
  }

  const response = await req.payload.find({
    collection: 'chapters',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    req,
    where: where as never,
  })

  return response.totalDocs ?? 0
}

/**
 * Fetches the chapter count for a book from the Payload REST API (browser-safe).
 * Returns `0` when `bookId` cannot be resolved.
 * @param bookId - The book ID to query; accepts any normalizable value.
 * @param signal - Optional `AbortSignal` to cancel the in-flight request.
 */
export const fetchBookChapterCount = async (
  bookId: unknown,
  signal?: AbortSignal,
): Promise<number> => {
  const where = buildChapterFilter(bookId)

  if (!where) {
    return 0
  }

  const response = await requestJSONWithRetry<ChapterCountResponse>(
    `/api/chapters?limit=0&where[book][equals]=${encodeURIComponent(String(where.book.equals))}`,
    {},
    signal ? { signal } : {},
  )

  return typeof response.totalDocs === 'number' ? response.totalDocs : 0
}

/**
 * Payload `Access` function for the Books collection delete operation.
 *
 * Allows deletion only when the requester owns the book AND the book has no chapters.
 * Returns `false` (deny) if the chapter count cannot be determined.
 */
export const bookDeleteAccess: Access = async (args) => {
  const ownerDeleteAccess = ownerAccess('createdBy')(args)
  const docValue = 'doc' in args ? (args as { doc?: { id?: unknown } }).doc : undefined
  const idValue = 'id' in args ? (args as { id?: unknown }).id : undefined
  const bookId = normalizeEntityId(docValue?.id ?? idValue)

  if (bookId == null) {
    return ownerDeleteAccess
  }

  const chapterCount = await countBookChapters(args.req, bookId).catch(() => null)

  if (chapterCount == null) {
    return false
  }

  if (chapterCount > 0) {
    return false
  }

  return ownerDeleteAccess
}

/**
 * Payload `beforeDelete` hook that prevents a book from being deleted while it still has chapters.
 * Throws if any chapters reference this book.
 */
export const enforceBookHasNoChaptersBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  const chapterCount = await countBookChapters(req, id)

  if (chapterCount > 0) {
    throw new Error(
      `Cannot delete book: it has ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}. Remove all chapters first.`,
    )
  }
}

/**
 * Payload `beforeChange` hook that verifies a non-admin user owns the book they are
 * assigning a chapter to.
 *
 * Skipped for admin users and for updates that do not re-assign the book field.
 * Throws if ownership cannot be verified.
 */
export const enforceChapterBookOwnershipHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const workingData = data ? { ...data } : {}
  const workingRecord = workingData as ChapterRecord
  const previousRecord = (originalDoc as ChapterRecord | undefined) ?? {}

  const user = req.user as { id?: unknown; role?: string } | undefined

  // No authenticated user – access control layer already blocks the request.
  if (!user) return workingData

  // Admins bypass ownership checks.
  if (user.role === 'admin') return workingData

  // On update, only enforce when the book field is being re-assigned.
  if (operation === 'update') {
    const newBookId = normalizeEntityId(workingRecord.book)
    const oldBookId = normalizeEntityId(previousRecord.book)

    if (newBookId == null || (oldBookId != null && String(newBookId) === String(oldBookId))) {
      return workingData
    }
  }

  const bookId = normalizeEntityId(workingRecord.book ?? previousRecord.book)

  if (bookId == null) return workingData

  const book = await req.payload.findByID({
    collection: 'books',
    id: bookId as string,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const bookOwnerId = normalizeEntityId((book as { createdBy?: unknown } | null)?.createdBy)
  const userId = normalizeEntityId(user.id)

  if (bookOwnerId == null || userId == null || String(bookOwnerId) !== String(userId)) {
    throw new Error('You can only create chapters for books you own.')
  }

  return workingData
}

/**
 * Payload `beforeChange` hook that rejects a chapter save when another chapter in the same
 * book already holds the same `order` value.
 *
 * Also coerces `order` to a positive integer before writing.
 * Throws if a conflicting chapter is found.
 */
export const enforceUniqueChapterOrderHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const workingData = data ? { ...data } : {}
  const workingRecord = workingData as ChapterRecord
  const previousRecord = (originalDoc as ChapterRecord | undefined) ?? {}

  const bookId = normalizeEntityId(workingRecord.book ?? previousRecord.book)
  const order = toPositiveInteger(workingRecord.order ?? previousRecord.order)

  if (order != null) {
    workingRecord.order = order
  }

  if (bookId == null || order == null) {
    return workingData
  }

  const previousBookId = normalizeEntityId(previousRecord.book)
  const previousOrder = toPositiveInteger(previousRecord.order)

  if (
    operation === 'update' &&
    previousBookId != null &&
    previousOrder != null &&
    String(previousBookId) === String(bookId) &&
    previousOrder === order
  ) {
    return workingData
  }

  const existing = await req.payload.find({
    collection: 'chapters',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          book: {
            equals: bookId,
          },
        },
        {
          order: {
            equals: order,
          },
        },
      ],
    } as never,
  })

  if (existing.docs.length === 0) {
    return workingData
  }

  const currentDocId = normalizeEntityId(previousRecord.id)

  const hasConflict = existing.docs.some((doc) => {
    const existingId = normalizeEntityId((doc as { id?: unknown }).id)

    if (existingId == null) {
      return true
    }

    if (currentDocId == null) {
      return true
    }

    return String(existingId) !== String(currentDocId)
  })

  if (hasConflict) {
    throw new Error('Each chapter order value must be unique within the same book.')
  }

  return workingData
}

type CachePurgeRecord = {
  id?: unknown
  slug?: unknown
}

type ChapterCachePurgeRecord = CachePurgeRecord & {
  book?: unknown
}

const getBookIdFromRecord = (record: CachePurgeRecord | null | undefined): string | number | null => {
  return normalizeEntityId(record?.id)
}

const getChapterBookIdFromRecord = (
  record: ChapterCachePurgeRecord | null | undefined,
): string | number | null => {
  return normalizeEntityId(record?.book)
}

export const booksCachePurgeAfterChangeHook: CollectionAfterChangeHook = async ({ doc }) => {
  const record = doc as CachePurgeRecord | null | undefined
  const bookId = getBookIdFromRecord(record)
  const bookSlug = normalizeCacheTagValue(record?.slug)

  if (bookId == null && bookSlug == null) {
    return doc
  }

  void purgeCloudflareCacheTags(
    normalizeCacheTags([
      ...buildBookPurgeTags(bookId),
      ...buildBookSlugCacheTags(bookSlug),
    ]),
    'books',
  )

  return doc
}

export const booksCachePurgeAfterDeleteHook: CollectionAfterDeleteHook = async ({ doc, id }) => {
  const record = (doc as CachePurgeRecord | null | undefined) ?? { id }
  const bookId = getBookIdFromRecord(record) ?? normalizeEntityId(id)
  const bookSlug = normalizeCacheTagValue(record?.slug)

  if (bookId == null && bookSlug == null) {
    return doc
  }

  void purgeCloudflareCacheTags(
    normalizeCacheTags([
      ...buildBookPurgeTags(bookId),
      ...buildBookSlugCacheTags(bookSlug),
    ]),
    'books',
  )

  return doc
}

export const chaptersCachePurgeAfterChangeHook: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
}) => {
  const nextRecord = doc as ChapterCachePurgeRecord | null | undefined
  const previousRecord = previousDoc as ChapterCachePurgeRecord | null | undefined
  const chapterId = normalizeEntityId(nextRecord?.id ?? previousRecord?.id)
  const bookId = getChapterBookIdFromRecord(nextRecord) ?? getChapterBookIdFromRecord(previousRecord)
  const previousBookId = getChapterBookIdFromRecord(previousRecord)
  const chapterSlug = normalizeCacheTagValue(nextRecord?.slug)
  const previousChapterSlug = normalizeCacheTagValue(previousRecord?.slug)

  if (
    chapterId == null &&
    bookId == null &&
    previousBookId == null &&
    chapterSlug == null &&
    previousChapterSlug == null
  ) {
    return doc
  }

  void purgeCloudflareCacheTags(
    normalizeCacheTags([
      ...buildChapterPurgeTags({
        bookId,
        chapterId,
        previousBookId,
      }),
      ...buildChapterPageLookupCacheTags(bookId, chapterSlug),
      ...buildChapterPageLookupCacheTags(previousBookId, previousChapterSlug),
      ...buildChapterSlugCacheTags(chapterSlug),
      ...buildChapterSlugCacheTags(previousChapterSlug),
    ]),
    'chapters',
  )

  return doc
}

export const chaptersCachePurgeAfterDeleteHook: CollectionAfterDeleteHook = async ({ doc, id }) => {
  const record = doc as ChapterCachePurgeRecord | null | undefined
  const chapterId = normalizeEntityId(record?.id ?? id)
  const bookId = getChapterBookIdFromRecord(record)
  const chapterSlug = normalizeCacheTagValue(record?.slug)

  if (chapterId == null && bookId == null && chapterSlug == null) {
    return doc
  }

  void purgeCloudflareCacheTags(
    normalizeCacheTags([
      ...buildChapterPurgeTags({
        bookId,
        chapterId,
      }),
      ...buildChapterPageLookupCacheTags(bookId, chapterSlug),
      ...buildChapterSlugCacheTags(chapterSlug),
    ]),
    'chapters',
  )

  return doc
}

/**
 * Payload `beforeChange` hook that hashes chapter passwords and keeps the derived flags in sync.
 *
 * Preserves the existing hash when the field is omitted, hashes new input, clears the stored hash
 * when the field is explicitly emptied, and bumps the password version so old proofs expire.
 */
