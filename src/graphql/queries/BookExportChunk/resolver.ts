import type { Payload } from 'payload'
import type { SerializedEditorState } from 'lexical'

import { getUserId, normalizeEntityId } from '@/utils/access'
import { PAGE_SIZE } from '@/utils/epubExportHelpers'
import { collectUploadIdsFromLexicalState } from '@/utils/lexicalToHtml'
import { clampNumber, toPositiveInteger } from '@/utils/numbers'

interface BookExportChunkArgs {
  bookId: string | number
  page: number
  limit: number
}

export const bookExportChunkResolver = async (
  _: unknown,
  args: BookExportChunkArgs,
  context: any,
): Promise<{
  page: number
  totalPages: number
  chapters: Array<Record<string, unknown>>
  media: Array<Record<string, unknown>>
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
    depth: 0,
  })

  if (!book) {
    throw new Error('Book not found')
  }

  const bookCreatedBy = normalizeEntityId((book as unknown as Record<string, unknown>).createdBy)
  const userRole = (context.req.user as Record<string, unknown> | null | undefined)?.role
  if (userRole !== 'admin' && String(bookCreatedBy) !== String(userId)) {
    throw new Error('Only the book owner can export this book')
  }

  const page = toPositiveInteger(args.page) ?? 1
  const requestedLimit = toPositiveInteger(args.limit) ?? PAGE_SIZE
  const limit = clampNumber(requestedLimit, 1, PAGE_SIZE)

  const chaptersResult = await payload.find({
    collection: 'chapters',
    where: {
      book: { equals: bookId },
    },
    sort: 'order',
    limit,
    page,
    depth: 0,
    overrideAccess: true,
    req: context.req,
  })

  const chapters = chaptersResult.docs
  const totalPages = chaptersResult.totalPages

  const uploadIds = new Set<string>()
  for (const ch of chapters) {
    const content = ((ch as unknown) as Record<string, unknown>).content as
      | SerializedEditorState
      | undefined
    if (content) {
      try {
        const ids = collectUploadIdsFromLexicalState(content)
        for (const id of ids) {
          uploadIds.add(id)
        }
      } catch {
        // Malformed content — skip uploads for this chapter.
      }
    }
  }

  let mediaDocs: Array<Record<string, unknown>> = []
  if (uploadIds.size > 0) {
    const mediaResult = await payload.find({
      collection: 'media',
      where: {
        id: { in: Array.from(uploadIds) },
      },
      limit: uploadIds.size,
      depth: 0,
      overrideAccess: true,
      req: context.req,
    })
    mediaDocs = mediaResult.docs.map((m) => (m as unknown) as Record<string, unknown>)
  }

  const whitelistedMedia = mediaDocs.map((m) => {
    const media = m
    return {
      id: String(media.id),
      filename: media.filename,
      mimeType: media.mimeType,
      url: media.url,
      optimizedUrl: media.optimizedUrl ?? null,
      alt: media.alt ?? '',
    }
  })

  const chapterResponse = chapters.map((ch) => {
    const chapter = (ch as unknown) as Record<string, unknown>
    return {
      id: String(chapter.id),
      order: chapter.order,
      title: chapter.title,
      content: chapter.content,
    }
  })

  return {
    page,
    totalPages,
    chapters: chapterResponse,
    media: whitelistedMedia,
  }
}
