import type { Payload, PayloadRequest } from 'payload'

import { getUserId } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import { isReaderContentType } from '@/utils/readingFeatures'

interface BookmarksArgs {
  contentType?: string
  contentId?: string | number
  limit?: number
  page?: number
}

interface BookmarksResult {
  docs: unknown[]
  totalDocs: number
}

interface BookmarkDoc {
  book?: unknown
  chapter?: unknown
  contentType?: unknown
  id?: unknown
  [key: string]: unknown
}

type PayloadFinder = Pick<Payload, 'find'>

interface BookmarksResolverContext {
  req: {
    payload?: Partial<PayloadFinder>
    user?: unknown
  }
}

export const bookmarksResolver = async (
  _: unknown,
  args: BookmarksArgs,
  context: BookmarksResolverContext,
): Promise<BookmarksResult> => {
  const req = context.req as PayloadRequest
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (userId == null) {
    throw new Error('Unauthorized')
  }

  const payload = context.req.payload
  if (typeof payload?.find !== 'function') {
    throw new Error('Payload request is unavailable')
  }
  const payloadFinder: PayloadFinder = { find: payload.find }

  const limit = Math.max(1, Math.min(args.limit ?? 50, 100))
  const page = Math.max(1, args.page ?? 1)
  const hasContentFilter = args.contentType != null && args.contentId != null

  const conditions: Array<{ [key: string]: { equals?: unknown } }> = [
    { user: { equals: userId } },
  ]

  if (hasContentFilter) {
    if (!isReaderContentType(args.contentType)) {
      throw new Error('Invalid contentType')
    }

    const contentId = normalizeEntityId(args.contentId)

    if (contentId == null) {
      throw new Error('Invalid contentId')
    }

    if (args.contentType === 'chapter') {
      conditions.push({ chapter: { equals: contentId } })
    } else {
      conditions.push({ book: { equals: contentId } })
    }
  }

  const result = await payload.find({
    collection: 'bookmarks',
    where: { and: conditions },
    depth: 0,
    limit: hasContentFilter ? 1 : limit,
    page: hasContentFilter ? 1 : page,
    overrideAccess: false,
    req,
  })

  const docs = await hydrateBookmarkRelations({
    docs: result.docs as unknown as BookmarkDoc[],
    payload: payloadFinder,
    req,
  })

  return {
    docs,
    totalDocs: result.totalDocs,
  }
}

async function hydrateBookmarkRelations({
  docs,
  payload,
  req,
}: {
  docs: BookmarkDoc[]
  payload: PayloadFinder
  req: PayloadRequest
}): Promise<BookmarkDoc[]> {
  if (docs.length === 0) {
    return docs
  }

  const bookIds = collectRelationIds(docs, 'book')
  const chapterIds = collectRelationIds(docs, 'chapter')

  const [bookMap, chapterMap] = await Promise.all([
    loadRelationMap({
      collection: 'books',
      ids: bookIds,
      payload,
      req,
    }),
    loadRelationMap({
      collection: 'chapters',
      ids: chapterIds,
      payload,
      req,
    }),
  ])

  return docs.map((doc) => {
    if (doc.contentType === 'chapter') {
      const chapterId = normalizeEntityId(doc.chapter)

      return {
        ...doc,
        chapter: chapterId == null ? null : (chapterMap.get(String(chapterId)) ?? null),
        book: null,
      }
    }

    const bookId = normalizeEntityId(doc.book)

    return {
      ...doc,
      book: bookId == null ? null : (bookMap.get(String(bookId)) ?? null),
      chapter: null,
    }
  })
}

function collectRelationIds(docs: BookmarkDoc[], field: 'book' | 'chapter'): Array<string | number> {
  const ids = new Set<string>()

  for (const doc of docs) {
    const normalizedId = normalizeEntityId(doc[field])

    if (normalizedId != null) {
      ids.add(String(normalizedId))
    }
  }

  return Array.from(ids)
}

async function loadRelationMap({
  collection,
  ids,
  payload,
  req,
}: {
  collection: 'books' | 'chapters'
  ids: Array<string | number>
  payload: PayloadFinder
  req: PayloadRequest
}): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) {
    return new Map()
  }

  const result = await payload.find({
    collection,
    where: {
      id: {
        in: ids,
      },
    },
    depth: 1,
    limit: ids.length,
    overrideAccess: false,
    req,
  })

  const relationMap = new Map<string, Record<string, unknown>>()

  for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
    const normalizedId = normalizeEntityId(doc.id)

    if (normalizedId != null) {
      relationMap.set(String(normalizedId), doc)
    }
  }

  return relationMap
}
