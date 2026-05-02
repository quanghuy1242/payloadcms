import type { Payload } from 'payload'

import { normalizeEntityId } from '@/utils/identifiers'
import {
  assertAuthenticatedCommentUser,
  assertCommentAuthor,
  assertCommentEditableNow,
  assertCommentNotDeleted,
  assertCommentTargetReadable,
  mapCommentDocToPublicComment,
  normalizeCommentContent,
} from '@/utils/comments'

interface UpdateCommentArgs {
  commentId: string | number
  content: string
}

interface UpdateCommentResult {
  comment: unknown
}

export const updateCommentResolver = async (
  _: unknown,
  args: UpdateCommentArgs,
  context: any,
): Promise<UpdateCommentResult> => {
  const payload: Payload = context.req.payload
  const req = context.req
  const user = context.req.user

  // 1. Require authenticated user
  assertAuthenticatedCommentUser(user)

  // 2. Load the comment
  const existingId = normalizeEntityId(args.commentId)
  if (typeof existingId !== 'number') {
    throw new Error('Invalid comment ID.')
  }

  const existing = await payload
    .findByID({
      collection: 'comments',
      id: existingId,
      depth: 1,
      overrideAccess: true,
      req,
    })
    .catch(() => null)

  if (!existing) {
    throw new Error('Comment not found.')
  }

  // 3. Verify author ownership
  assertCommentAuthor({ comment: existing, user, action: 'edit' })

  // 4. Verify not deleted
  assertCommentNotDeleted(existing)

  // 5. Verify 5-hour edit window
  assertCommentEditableNow(existing)

  // 6. Verify target is still readable
  const existingDoc = existing as { chapter?: unknown; post?: unknown }
  await assertCommentTargetReadable({
    chapterId: existingDoc.chapter,
    postId: existingDoc.post,
    payload,
    req,
    user,
    headers: req.headers,
  })

  // 7. Normalize new content
  const nextContent = normalizeCommentContent(args.content)

  // 8. Determine status transition
  const originalStatus = typeof existing.status === 'string' ? existing.status : 'pending'
  const shouldRePend = originalStatus === 'approved'

  // 9. Update the comment
  const updated = await payload.update({
    collection: 'comments',
    id: existingId,
    data: {
      content: nextContent,
      status: shouldRePend ? 'pending' : originalStatus,
      moderatedAt: shouldRePend ? null : existing.moderatedAt,
      moderatedBy: shouldRePend ? null : existing.moderatedBy,
    },
    depth: 1,
    overrideAccess: true,
    req,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
