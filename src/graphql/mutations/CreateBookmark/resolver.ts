import type { Payload } from 'payload'

import { getUserId } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import {
  findExistingBookmark,
  isReaderContentType,
  loadReadableBook,
  loadReadableChapter,
} from '@/utils/readingFeatures'

interface CreateBookmarkArgs {
  contentType: string
  chapterId?: string | number
  bookId?: string | number
}

interface CreateBookmarkResult {
  bookmark: unknown
  created: boolean
}

export const createBookmarkResolver = async (
  _: unknown,
  args: CreateBookmarkArgs,
  context: any,
): Promise<CreateBookmarkResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (typeof userId !== 'number') {
    throw new Error('Unauthorized')
  }

  const contentType = args.contentType
  if (!isReaderContentType(contentType)) {
    throw new Error('Invalid contentType')
  }

  const chapterId = normalizeEntityId(args.chapterId)
  const bookId = normalizeEntityId(args.bookId)

  if (contentType === 'chapter') {
    if (typeof chapterId !== 'number' || bookId != null) {
      throw new Error('Chapter bookmarks require chapterId only')
    }

    const chapter = await loadReadableChapter({
      chapterId,
      payload,
      req: context.req,
    })

    if (!chapter) {
      throw new Error('Chapter not found')
    }

    const existing = await findExistingBookmark(payload, {
      userId,
      contentId: chapterId,
      contentType,
    })

    if (existing) {
      return { bookmark: existing, created: false }
    }

    const created = await payload.create({
      collection: 'bookmarks',
      data: {
        user: userId,
        contentType: 'chapter',
        chapter: chapterId,
      },
      overrideAccess: true,
    })

    return { bookmark: created, created: true }
  } else {
    if (typeof bookId !== 'number' || chapterId != null) {
      throw new Error('Book bookmarks require bookId only')
    }

    const book = await loadReadableBook({
      bookId,
      payload,
      req: context.req,
    })

    if (!book) {
      throw new Error('Book not found')
    }

    const existing = await findExistingBookmark(payload, {
      userId,
      contentId: bookId,
      contentType,
    })

    if (existing) {
      return { bookmark: existing, created: false }
    }

    const created = await payload.create({
      collection: 'bookmarks',
      data: {
        user: userId,
        contentType: 'book',
        book: bookId,
      },
      overrideAccess: true,
    })

    return { bookmark: created, created: true }
  }
}
