import type { Payload } from 'payload'

import { isAdminUser } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import {
  MODERATABLE_COMMENT_STATUSES,
  ModeratableCommentStatus,
  PUBLIC_COMMENT_DEPTH,
  mapCommentDocToPublicComment,
} from '@/utils/comments'

interface UpdateCommentStatusArgs {
  commentId: string | number
  status: string
}

interface UpdateCommentStatusResult {
  comment: unknown
}

export const updateCommentStatusResolver = async (
  _: unknown,
  args: UpdateCommentStatusArgs,
  context: any,
): Promise<UpdateCommentStatusResult> => {
  const payload: Payload = context.req.payload
  const req = context.req
  const user = context.req.user

  // 1. Require admin
  if (!isAdminUser(user)) {
    throw new Error('Only admins can moderate comments.')
  }

  // 2. Validate status input
  if (
    typeof args.status !== 'string' ||
    !MODERATABLE_COMMENT_STATUSES.includes(args.status as ModeratableCommentStatus)
  ) {
    throw new Error(
      `Invalid moderation status. Must be one of: ${MODERATABLE_COMMENT_STATUSES.join(', ')}.`,
    )
  }

  const nextStatus = args.status as ModeratableCommentStatus

  // 3. Load existing comment
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

  // 5. Reject moderation attempts on deleted comments
  if ((existing as { deletedAt?: unknown }).deletedAt != null) {
    throw new Error('Cannot moderate a deleted comment.')
  }

  // 6. Update status and moderation metadata
  const updated = await payload.update({
    collection: 'comments',
    id: existingId,
    data: {
      status: nextStatus,
      moderatedAt: new Date().toISOString(),
    },
    depth: PUBLIC_COMMENT_DEPTH,
    overrideAccess: true,
    req,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
