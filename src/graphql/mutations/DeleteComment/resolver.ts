import type { Payload } from 'payload'

import { normalizeEntityId } from '@/utils/identifiers'
import {
  assertAuthenticatedCommentUser,
  assertCommentAuthor,
  assertCommentNotDeleted,
  mapCommentDocToPublicComment,
} from '@/utils/comments'

interface DeleteCommentArgs {
  commentId: string | number
}

interface DeleteCommentResult {
  comment: unknown
}

export const deleteCommentResolver = async (
  _: unknown,
  args: DeleteCommentArgs,
  context: any,
): Promise<DeleteCommentResult> => {
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
      depth: 0,
      overrideAccess: true,
      req,
    })
    .catch(() => null)

  if (!existing) {
    throw new Error('Comment not found.')
  }

  // 3. Verify author ownership
  assertCommentAuthor({ comment: existing, user, action: 'delete' })

  // 4. Reject already-deleted comments
  assertCommentNotDeleted(existing)

  // 5. Soft-delete: set deletedAt and deletedBy
  const deletedBy = normalizeEntityId(user.id)

  const updated = await payload.update({
    collection: 'comments',
    id: existingId,
    data: {
      deletedAt: new Date().toISOString(),
      ...(deletedBy != null ? { deletedBy: deletedBy as number } : {}),
    },
    depth: 1,
    overrideAccess: true,
    req,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
