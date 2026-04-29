import type { Payload } from 'payload'

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

export const bookmarksResolver = async (
  _: unknown,
  args: BookmarksArgs,
  context: any,
): Promise<BookmarksResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (userId == null) {
    throw new Error('Unauthorized')
  }

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
    depth: 1,
    limit: hasContentFilter ? 1 : limit,
    page: hasContentFilter ? 1 : page,
    overrideAccess: true,
  })

  return {
    docs: result.docs,
    totalDocs: result.totalDocs,
  }
}
