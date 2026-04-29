import type { Payload } from 'payload'

import { getUserId, normalizeEntityId } from '@/utils/access'
import { PAGE_SIZE } from '@/utils/epubExportHelpers'

interface BookExportManifestArgs {
  bookId: string | number
}

interface CoverMedia {
  id: string | number
  filename: string
  mimeType: string
  url: string
  optimizedUrl?: string | null
  alt?: string
}

export const bookExportManifestResolver = async (
  _: unknown,
  args: BookExportManifestArgs,
  context: any,
): Promise<{
  filename: string
  pageSize: number
  totalChapters: number
  totalPages: number
  book: Record<string, unknown>
  chapterIndex: Array<Record<string, unknown>>
}> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (userId == null) {
    throw new Error('Unauthorized')
  }

  const bookId = normalizeEntityId(args.bookId)
  if (bookId == null) {
    throw new Error('Invalid bookId')
  }

  const book = await payload.findByID({
    collection: 'books',
    id: bookId,
    overrideAccess: false,
    req: context.req,
    depth: 1,
  })

  if (!book) {
    throw new Error('Book not found')
  }

  const bookCreatedBy = normalizeEntityId((book as unknown as Record<string, unknown>).createdBy)
  const userRole = (context.req.user as Record<string, unknown> | null | undefined)?.role
  if (userRole !== 'admin' && String(bookCreatedBy) !== String(userId)) {
    throw new Error('Only the book owner can export this book')
  }

  const allChapters: Array<Record<string, unknown>> = []
  let chaptersPage = 1
  let hasMoreChapters = true

  while (hasMoreChapters) {
    const chaptersResult = await payload.find({
      collection: 'chapters',
      where: {
        book: { equals: bookId },
      },
      sort: 'order',
      limit: 500,
      page: chaptersPage,
      depth: 0,
      overrideAccess: true,
    })

    allChapters.push(...(chaptersResult.docs as unknown as Array<Record<string, unknown>>))
    hasMoreChapters = chaptersResult.hasNextPage
    chaptersPage += 1

    // Safety break to avoid infinite loops
    if (chaptersPage > 1000) {
      throw new Error('Too many chapters to export')
    }
  }

  const chapters = allChapters
  const totalChapters = chapters.length
  const totalPages = Math.ceil(totalChapters / PAGE_SIZE)

  const chapterIndex = chapters.map((ch: unknown) => {
    const chapter = ch as Record<string, unknown>
    return {
      id: String(chapter.id),
      order: chapter.order,
      title: chapter.title,
      slug: chapter.slug,
      chapterSourceKey: chapter.chapterSourceKey ?? null,
    }
  })

  const coverMedia = (book as unknown as Record<string, unknown>).cover as CoverMedia | undefined
  const cover = coverMedia
    ? {
        id: String(coverMedia.id),
        filename: coverMedia.filename,
        mimeType: coverMedia.mimeType,
        url: coverMedia.url,
        optimizedUrl: coverMedia.optimizedUrl ?? null,
        alt: coverMedia.alt ?? '',
      }
    : null

  const bookSlug = (book as unknown as Record<string, unknown>).slug as string

  return {
    filename: `${bookSlug}.epub`,
    pageSize: PAGE_SIZE,
    totalChapters,
    totalPages,
    book: {
      id: String(book.id),
      title: book.title,
      slug: bookSlug,
      author: (book as unknown as Record<string, unknown>).author ?? null,
      description: (book as unknown as Record<string, unknown>).description ?? null,
      language: (book as unknown as Record<string, unknown>).language ?? null,
      publisher: (book as unknown as Record<string, unknown>).publisher ?? null,
      publicationDate: (book as unknown as Record<string, unknown>).publicationDate ?? null,
      isbn: (book as unknown as Record<string, unknown>).isbn ?? null,
      epubVersion: (book as unknown as Record<string, unknown>).epubVersion ?? null,
      updatedAt: (book as unknown as Record<string, unknown>).updatedAt ?? null,
      cover,
    },
    chapterIndex,
  }
}
