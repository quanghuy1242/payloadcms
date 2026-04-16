import type { Access, CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { ownerAccess, normalizeEntityId } from './access'
import { requestJSONWithRetry } from './http'
import { toPositiveInteger } from './numbers'

export const BOOK_ORIGINS = ['manual', 'epub-imported', 'synced'] as const
export const BOOK_SOURCE_TYPES = ['manual', 'epub-upload', 'meap-feed', 'external-sync'] as const
export const BOOK_IMPORT_STATUSES = ['idle', 'importing', 'ready', 'failed', 'canceled'] as const
export const BOOK_SYNC_STATUSES = ['clean', 'pending', 'conflicted', 'diverged'] as const

export type BookOrigin = (typeof BOOK_ORIGINS)[number]
export type BookSourceType = (typeof BOOK_SOURCE_TYPES)[number]
export type BookImportStatus = (typeof BOOK_IMPORT_STATUSES)[number]
export type BookSyncStatus = (typeof BOOK_SYNC_STATUSES)[number]

export const BOOK_CHAPTERS_UPDATED_EVENT = 'payload:book-chapters-updated' as const

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

const normalizeImportStatus = (value: unknown): BookImportStatus | null => {
  if (typeof value !== 'string') {
    return null
  }

  return BOOK_IMPORT_STATUSES.includes(value as BookImportStatus) ? (value as BookImportStatus) : null
}

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

type ChapterCountResponse = {
  totalDocs?: number
}

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
