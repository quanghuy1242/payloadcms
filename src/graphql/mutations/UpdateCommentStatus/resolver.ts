import type { Payload } from 'payload'

import { isAdminUser } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'
import {
  MODERATABLE_COMMENT_STATUSES,
  ModeratableCommentStatus,
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
    })
    .catch(() => null)

  if (!existing) {
    throw new Error('Comment not found.')
  }

  // 4. Update status and moderation metadata
  const updated = await payload.update({
    collection: 'comments',
    id: existingId,
    data: {
      status: nextStatus,
      moderatedAt: new Date().toISOString(),
    },
    depth: 1,
    overrideAccess: true,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
