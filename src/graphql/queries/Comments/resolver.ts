import type { Payload } from 'payload'

import { getUserId } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import {
  assertCommentTargetReadable,
  assertExclusiveCommentTarget,
  mapCommentDocToPublicComment,
  viewerCanCommentAnyAuth,
} from '@/utils/comments'

interface CommentsArgs {
  chapterId?: string | number
  postId?: string | number
}

interface PublicCommentResult {
  docs: unknown[]
  totalDocs: number
  viewerCanComment: boolean
}

const HARD_CAP = 200

const sortByCreatedAtAscending = (left: unknown, right: unknown): number => {
  const leftCreatedAt = (left as { createdAt?: string }).createdAt ?? ''
  const rightCreatedAt = (right as { createdAt?: string }).createdAt ?? ''

  return leftCreatedAt.localeCompare(rightCreatedAt)
}

const mergeUniqueComments = (...groups: unknown[][]): unknown[] => {
  const seenIds = new Set<string>()
  const merged: unknown[] = []

  for (const group of groups) {
    for (const doc of group) {
      const docId = String(normalizeEntityId((doc as { id?: unknown }).id) ?? '')

      if (seenIds.has(docId)) {
        continue
      }

      seenIds.add(docId)
      merged.push(doc)
    }
  }

  return merged
}

export const commentsResolver = async (
  _: unknown,
  args: CommentsArgs,
  context: any,
): Promise<PublicCommentResult> => {
  const payload: Payload = context.req.payload
  const req = context.req
  const user = context.req.user

  assertExclusiveCommentTarget({
    chapter: args.chapterId,
    post: args.postId,
  })

  const target = await assertCommentTargetReadable({
    chapterId: args.chapterId,
    postId: args.postId,
    payload,
    req,
    user,
    headers: req.headers,
  })

  const targetWhere: any =
    target.type === 'chapter'
      ? { chapter: { equals: target.id } }
      : { post: { equals: target.id } }

  const userId = normalizeEntityId(getUserId(user))
  const canCreateComments = viewerCanCommentAnyAuth(user)
  let ownPendingDocs: unknown[] = []
  let approvedLimit = HARD_CAP

  if (canCreateComments && userId != null) {
    const pendingResult = await payload.find({
      collection: 'comments',
      where: {
        and: [
          targetWhere,
          { status: { equals: 'pending' } },
          { author: { equals: userId } },
        ],
      },
      sort: 'createdAt',
      limit: HARD_CAP,
      depth: 1,
      overrideAccess: true,
    })

    ownPendingDocs = pendingResult.docs
    approvedLimit = Math.max(0, HARD_CAP - ownPendingDocs.length)
  }

  const approvedResult =
    approvedLimit > 0
      ? await payload.find({
          collection: 'comments',
          where: {
            and: [targetWhere, { status: { equals: 'approved' } }],
          },
          sort: 'createdAt',
          limit: approvedLimit,
          depth: 1,
          overrideAccess: true,
        })
      : { docs: [] as unknown[] }

  const merged = mergeUniqueComments(approvedResult.docs, ownPendingDocs)
    .sort(sortByCreatedAtAscending)
    .slice(0, HARD_CAP)

  return {
    docs: merged.map((doc) => mapCommentDocToPublicComment(doc, user)),
    totalDocs: merged.length,
    viewerCanComment: canCreateComments,
  }
}
