import type { Payload } from 'payload'

import { getUserId } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import {
  findExistingReadingProgress,
  loadReadableChapter,
} from '@/utils/readingFeatures'

interface SaveReadingProgressArgs {
  chapterId: string | number
  bookId: string | number
  progress: number
}

interface SaveReadingProgressResult {
  ok: boolean
  progress: unknown
}

export const saveReadingProgressResolver = async (
  _: unknown,
  args: SaveReadingProgressArgs,
  context: any,
): Promise<SaveReadingProgressResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (typeof userId !== 'number') {
    throw new Error('Unauthorized')
  }

  const chapterId = normalizeEntityId(args.chapterId)
  const bookId = normalizeEntityId(args.bookId)
  const progress = Math.min(100, Math.max(0, args.progress))

  if (typeof chapterId !== 'number' || typeof bookId !== 'number') {
    throw new Error('Invalid chapterId or bookId')
  }

  const chapter = await loadReadableChapter({
    chapterId,
    payload,
    req: context.req,
  })

  if (!chapter) {
    throw new Error('Chapter not found')
  }

  const chapterBookId = normalizeEntityId(chapter.book)

  if (chapterBookId == null || String(chapterBookId) !== String(bookId)) {
    throw new Error('Chapter does not belong to the selected book')
  }

  const existing = await findExistingReadingProgress(payload, {
    userId,
    chapterId,
  })
  const completedAt = progress >= 95 ? new Date().toISOString() : undefined

  if (existing) {
    const doc = existing as { id: number; progress?: number | null }

    if (progress > (doc.progress ?? 0)) {
      const updated = await payload.update({
        collection: 'reading-progress',
        id: doc.id,
        data: {
          progress,
          book: bookId,
          ...(completedAt ? { completedAt } : {}),
        },
        overrideAccess: true,
      })

      return { ok: true, progress: updated }
    }

    return { ok: true, progress: doc }
  }

  const created = await payload.create({
    collection: 'reading-progress',
    data: {
      user: userId,
      book: bookId,
      chapter: chapterId,
      progress,
      ...(completedAt ? { completedAt } : {}),
    },
    overrideAccess: true,
  })

  return { ok: true, progress: created }
}
