import type { Payload } from 'payload'

import { getUserId } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'

interface ReadingProgressArgs {
  bookId: string | number
}

interface ReadingProgressRecord {
  chapterId: number | undefined
  progress: number | undefined
  completedAt: string | undefined
  updatedAt: string | undefined
}

interface ReadingProgressResult {
  records: ReadingProgressRecord[]
}

export const readingProgressResolver = async (
  _: unknown,
  args: ReadingProgressArgs,
  context: any,
): Promise<ReadingProgressResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (typeof userId !== 'number') {
    throw new Error('Unauthorized')
  }

  const bookId = normalizeEntityId(args.bookId)
  if (typeof bookId !== 'number') {
    throw new Error('Invalid bookId')
  }

  const result = await payload.find({
    collection: 'reading-progress',
    where: {
      and: [
        { user: { equals: userId } },
        { book: { equals: bookId } },
      ],
    },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  return {
    records: result.docs.map((d) => {
      const chapterId = normalizeEntityId((d as { chapter?: unknown }).chapter)

      return {
        chapterId: typeof chapterId === 'number' ? chapterId : undefined,
        progress: (d as { progress?: number }).progress ?? undefined,
        completedAt: (d as { completedAt?: string }).completedAt ?? undefined,
        updatedAt: (d as { updatedAt?: string }).updatedAt ?? undefined,
      }
    }),
  }
}
