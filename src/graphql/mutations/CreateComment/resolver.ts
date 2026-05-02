import type { Payload } from 'payload'

import {
  assertCommentCreateRole,
  assertCommentTargetReadable,
  assertExclusiveCommentTarget,
  assertParentCommentIsValid,
  mapCommentDocToPublicComment,
  normalizeCommentContent,
} from '@/utils/comments'

interface CreateCommentArgs {
  chapterId?: string | number
  postId?: string | number
  content: string
  parentCommentId?: string | number
}

interface CreateCommentResult {
  comment: unknown
}

export const createCommentResolver = async (
  _: unknown,
  args: CreateCommentArgs,
  context: any,
): Promise<CreateCommentResult> => {
  const payload: Payload = context.req.payload
  const req = context.req
  const user = context.req.user

  // 1. Require authenticated user
  if (!user) {
    throw new Error('You must be signed in to comment.')
  }

  // 2. Enforce commenter role (user only)
  assertCommentCreateRole(user)

  // 3. Validate exactly one target
  assertExclusiveCommentTarget({
    chapter: args.chapterId,
    post: args.postId,
  })

  // 4. Validate target readability (password-proof, book access, published)
  const target = await assertCommentTargetReadable({
    chapterId: args.chapterId,
    postId: args.postId,
    payload,
    req,
    user,
    headers: req.headers,
  })

  // 5. Normalize and validate content
  const content = normalizeCommentContent(args.content)

  // 6. Validate parent comment if provided
  const parent = await assertParentCommentIsValid({
    parentCommentId: args.parentCommentId,
    target,
    payload,
    req,
  })

  // 7. Create pending comment
  const created = await payload.create({
    collection: 'comments',
    data: {
      chapter: target.type === 'chapter' ? target.id : null,
      post: target.type === 'post' ? target.id : null,
      author: user.id,
      content,
      status: 'pending',
      parentComment: parent ? (parent as { id: number }).id : null,
      moderatedAt: null,
      moderatedBy: null,
    },
    depth: 1,
    overrideAccess: true,
  })

  return {
    comment: mapCommentDocToPublicComment(created, user),
  }
}
