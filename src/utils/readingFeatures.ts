import type {
  CollectionBeforeChangeHook,
  CollectionSlug,
  Payload,
  PayloadRequest,
} from 'payload'

import { normalizeEntityId } from './identifiers'

export const READER_CONTENT_TYPES = ['book', 'chapter'] as const

export type ReaderContentType = (typeof READER_CONTENT_TYPES)[number]

type ReaderScopedDoc = {
  id?: number
}

type BookmarkLookupArgs = {
  contentId: number
  contentType: ReaderContentType
  userId: number
}

type ReadingProgressLookupArgs = {
  chapterId: number
  userId: number
}

type ChapterRecord = {
  book?: unknown
  id?: unknown
}

export const isReaderContentType = (value: unknown): value is ReaderContentType => {
  return typeof value === 'string' && READER_CONTENT_TYPES.includes(value as ReaderContentType)
}

const buildBookmarkConditions = ({
  contentId,
  contentType,
  userId,
}: BookmarkLookupArgs): Array<Record<string, { equals: unknown }>> => {
  const conditions: Array<Record<string, { equals: unknown }>> = [{ user: { equals: userId } }]

  if (contentType === 'chapter') {
    conditions.push({ chapter: { equals: contentId } })
  } else {
    conditions.push({ book: { equals: contentId } })
  }

  return conditions
}

export const findExistingBookmark = async (
  payload: Payload,
  { contentId, contentType, userId }: BookmarkLookupArgs,
): Promise<ReaderScopedDoc | null> => {
  const existing = await payload.find({
    collection: 'bookmarks',
    where: { and: buildBookmarkConditions({ contentId, contentType, userId }) },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return (existing.docs[0] as ReaderScopedDoc | undefined) ?? null
}

export const findExistingReadingProgress = async (
  payload: Payload,
  { chapterId, userId }: ReadingProgressLookupArgs,
): Promise<ReaderScopedDoc | null> => {
  const existing = await payload.find({
    collection: 'reading-progress',
    where: {
      and: [
        { user: { equals: userId } },
        { chapter: { equals: chapterId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return (existing.docs[0] as ReaderScopedDoc | undefined) ?? null
}

const loadDocumentByID = async <T>({
  collection,
  id,
  overrideAccess,
  payload,
  req,
}: {
  collection: CollectionSlug
  id: number
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<T | null> => {
  return (await payload
    .findByID({
      collection,
      id,
      depth: 0,
      overrideAccess,
      req,
    })
    .catch(() => null)) as T | null
}

export const loadReadableBook = async ({
  bookId,
  payload,
  req,
}: {
  bookId: number
  payload: Payload
  req: PayloadRequest
}) => {
  return loadDocumentByID<Record<string, unknown>>({
    collection: 'books',
    id: bookId,
    payload,
    req,
  })
}

export const loadReadableChapter = async ({
  chapterId,
  payload,
  req,
}: {
  chapterId: number
  payload: Payload
  req: PayloadRequest
}) => {
  return loadDocumentByID<ChapterRecord>({
    collection: 'chapters',
    id: chapterId,
    payload,
    req,
  })
}

const loadChapterForIntegrityCheck = async ({
  chapterId,
  payload,
  req,
}: {
  chapterId: number
  payload: Payload
  req: PayloadRequest
}) => {
  return loadDocumentByID<ChapterRecord>({
    collection: 'chapters',
    id: chapterId,
    overrideAccess: true,
    payload,
    req,
  })
}

export const bookmarksBeforeChangeHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const workingData = data ? { ...data } : {}
  const contentType = workingData.contentType ?? originalDoc?.contentType

  if (contentType == null) {
    return workingData
  }

  if (!isReaderContentType(contentType)) {
    throw new Error('Invalid contentType')
  }

  const chapterId = normalizeEntityId(workingData.chapter ?? originalDoc?.chapter)
  const bookId = normalizeEntityId(workingData.book ?? originalDoc?.book)

  if (contentType === 'chapter') {
    if (chapterId == null || bookId != null) {
      throw new Error('Chapter bookmarks require chapterId only')
    }

    workingData.book = null
  } else {
    if (bookId == null || chapterId != null) {
      throw new Error('Book bookmarks require bookId only')
    }

    workingData.chapter = null
  }

  if (operation !== 'create') {
    return workingData
  }

  const userId = normalizeEntityId(workingData.user ?? originalDoc?.user)
  const contentId = contentType === 'chapter' ? chapterId : bookId

  if (typeof userId !== 'number' || typeof contentId !== 'number') {
    return workingData
  }

  const existing = await findExistingBookmark(req.payload, {
    userId,
    contentId,
    contentType,
  })

  if (existing?.id != null) {
    workingData.id = existing.id
  }

  return workingData
}

export const readingProgressBeforeChangeHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const workingData = data ? { ...data } : {}
  const userId = normalizeEntityId(workingData.user ?? originalDoc?.user)
  const chapterId = normalizeEntityId(workingData.chapter ?? originalDoc?.chapter)
  const bookId = normalizeEntityId(workingData.book ?? originalDoc?.book)

  if (typeof chapterId === 'number' && typeof bookId === 'number') {
    const chapter = await loadChapterForIntegrityCheck({
      chapterId,
      payload: req.payload,
      req,
    })

    if (!chapter) {
      throw new Error('Chapter not found')
    }

    const chapterBookId = normalizeEntityId(chapter.book)

    if (chapterBookId == null || String(chapterBookId) !== String(bookId)) {
      throw new Error('Chapter does not belong to the selected book')
    }
  }

  if (operation !== 'create' || typeof userId !== 'number' || typeof chapterId !== 'number') {
    return workingData
  }

  const existing = await findExistingReadingProgress(req.payload, {
    userId,
    chapterId,
  })

  if (existing?.id != null) {
    workingData.id = existing.id
  }

  return workingData
}
