import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  Payload,
  PayloadRequest,
} from 'payload'

import { canReadChapterContentForRequest } from './chapterPasswords'
import { normalizeEntityId } from './identifiers'

export const COMMENT_STATUSES = ['pending', 'approved', 'rejected'] as const
export const MODERATABLE_COMMENT_STATUSES = ['approved', 'rejected'] as const

export type CommentStatus = (typeof COMMENT_STATUSES)[number]
export type ModeratableCommentStatus = (typeof MODERATABLE_COMMENT_STATUSES)[number]

export const COMMENT_MAX_LENGTH = 550
export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 60 * 1000
export const COMMENT_RATE_LIMIT_PER_TARGET = 5
export const COMMENT_RATE_LIMIT_PER_TARGET_WINDOW_MS = 10 * 60 * 1000
export const COMMENT_RATE_LIMIT_GLOBAL = 20
export const COMMENT_RATE_LIMIT_GLOBAL_WINDOW_MS = 60 * 60 * 1000
export const PUBLIC_COMMENT_DEPTH = 2

const hasOwn = (value: object, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key)
}

const normalizeCommentStatus = (value: unknown): CommentStatus | null => {
  return typeof value === 'string' && COMMENT_STATUSES.includes(value as CommentStatus)
    ? (value as CommentStatus)
    : null
}

const isNotFoundLikeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode
  if (status === 404) {
    return true
  }

  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.toLowerCase().includes('not found')
}

// ----------------------- Normalization -----------------------

export const normalizeCommentContent = (input: unknown): string => {
  if (typeof input !== 'string') {
    throw new Error('Comment content must be a string.')
  }

  const trimmed = input.trim()

  if (trimmed.length === 0) {
    throw new Error('Comment content cannot be empty.')
  }

  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new Error(`Comment content must not exceed ${COMMENT_MAX_LENGTH} characters.`)
  }

  return trimmed
}

// ----------------------- Target Validation -----------------------

type CommentTargetArgs = {
  chapter?: unknown
  post?: unknown
}

export const assertExclusiveCommentTarget = ({ chapter, post }: CommentTargetArgs): void => {
  const hasChapter = normalizeEntityId(chapter) != null
  const hasPost = normalizeEntityId(post) != null

  if (hasChapter && hasPost) {
    throw new Error('A comment must target either a chapter or a post, not both.')
  }

  if (!hasChapter && !hasPost) {
    throw new Error('A comment must target either a chapter or a post.')
  }
}

export type CommentTarget =
  | { type: 'chapter'; id: number; doc: Record<string, unknown> }
  | { type: 'post'; id: number; doc: Record<string, unknown> }

type LoadTargetArgs = {
  chapterId?: unknown
  postId?: unknown
  payload: Payload
  req: PayloadRequest
}

type ChapterDoc = {
  id?: unknown
  book?: unknown
}

type PostDoc = {
  id?: unknown
  _status?: unknown
}

export const loadCommentTarget = async ({
  chapterId,
  postId,
  payload,
  req,
}: LoadTargetArgs): Promise<CommentTarget | null> => {
  if (chapterId != null) {
    const id = normalizeEntityId(chapterId)

    if (typeof id !== 'number') {
      return null
    }

    const doc = await payload
      .findByID({
        collection: 'chapters',
        id,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch((error: unknown) => {
        if (isNotFoundLikeError(error)) {
          return null
        }

        throw error
      })

    if (!doc) {
      return null
    }

    return { type: 'chapter', id, doc: doc as unknown as Record<string, unknown> }
  }

  if (postId != null) {
    const id = normalizeEntityId(postId)

    if (typeof id !== 'number') {
      return null
    }

    const doc = await payload
      .findByID({
        collection: 'posts',
        id,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch((error: unknown) => {
        if (isNotFoundLikeError(error)) {
          return null
        }

        throw error
      })

    if (!doc) {
      return null
    }

    return { type: 'post', id, doc: doc as unknown as Record<string, unknown> }
  }

  return null
}

// ----------------------- Readability Checkss -----------------------

type AssertTargetReadableArgs = {
  chapterId?: unknown
  postId?: unknown
  payload: Payload
  req: PayloadRequest
  user?: { id?: unknown; role?: unknown } | null
  headers?: Record<string, string | string[] | undefined>
}

export const assertCommentTargetReadable = async ({
  chapterId,
  postId,
  payload,
  req,
  user,
  headers,
}: AssertTargetReadableArgs): Promise<CommentTarget> => {
  const target = await loadCommentTarget({
    chapterId,
    postId,
    payload,
    req,
  })

  if (!target) {
    throw new Error('Comment target not found.')
  }

  if (target.type === 'chapter') {
    // Verify the requester can actually access the book this chapter belongs to.
    // We do this by attempting to read the chapter normally (through collection access).
    const chapter = await payload
      .findByID({
        collection: 'chapters',
        id: target.id,
        depth: 0,
        req,
      })
      .catch((error: unknown) => {
        if (isNotFoundLikeError(error)) {
          return null
        }

        throw error
      })

    if (!chapter) {
      throw new Error('Comment target not found.')
    }

    // Enforce chapter password proof
    const canRead = await canReadChapterContentForRequest({
      chapter: target.doc as ChapterDoc,
      chapterId: target.id,
      headers,
      req: req as never,
      user: user as { id?: string | number | null; role?: string | null } | null | undefined,
    })

    if (!canRead) {
      throw new Error('You do not have permission to view comments on this content.')
    }

    return target
  }

  // Post target: must be published
  const post = target.doc as PostDoc
  const postStatus = typeof post._status === 'string' ? post._status : null

  if (postStatus !== 'published') {
    throw new Error('Post is not published.')
  }

  return target
}

// ----------------------- Parent Comment Validation -----------------------

type AssertParentValidArgs = {
  parentCommentId?: unknown
  target: CommentTarget
  payload: Payload
  req: PayloadRequest
}

type ParentCommentDoc = {
  id?: unknown
  chapter?: unknown
  post?: unknown
  parentComment?: unknown
  status?: unknown
}

export const assertParentCommentIsValid = async ({
  parentCommentId,
  target,
  payload,
  req,
}: AssertParentValidArgs): Promise<ParentCommentDoc | null> => {
  const parentId = normalizeEntityId(parentCommentId)

  if (parentId == null) {
    return null
  }

  if (typeof parentId !== 'number') {
    throw new Error('Invalid parent comment ID.')
  }

  const parent = await payload
    .findByID({
      collection: 'comments',
      id: parentId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    .catch(() => null)

  if (!parent) {
    throw new Error('Parent comment not found.')
  }

  const parentDoc = parent as ParentCommentDoc

  // Reply-to-reply check: parent must itself be top-level
  if (normalizeEntityId(parentDoc.parentComment) != null) {
    throw new Error('Replies to replies are not supported.')
  }

  // Parent must belong to the same target
  if (target.type === 'chapter') {
    const parentChapterId = normalizeEntityId(parentDoc.chapter)

    if (parentChapterId == null || String(parentChapterId) !== String(target.id)) {
      throw new Error('Parent comment must belong to the same chapter.')
    }
  } else {
    const parentPostId = normalizeEntityId(parentDoc.post)

    if (parentPostId == null || String(parentPostId) !== String(target.id)) {
      throw new Error('Parent comment must belong to the same post.')
    }
  }

  // Parent must be approved
  if (
    typeof parentDoc.status !== 'string' ||
    !COMMENT_STATUSES.includes(parentDoc.status as CommentStatus)
  ) {
    throw new Error('Invalid parent comment status.')
  }

  if (parentDoc.status !== 'approved') {
    throw new Error('Cannot reply to a comment that has not been approved.')
  }

  return parentDoc
}

// ----------------------- Role Validation -----------------------

export const assertCommentCreateRole = (user?: { role?: unknown } | null): void => {
  if (!user) {
    throw new Error('You must be signed in to comment.')
  }

  if (user.role !== 'user') {
    throw new Error('You do not have permission to comment from this interface.')
  }
}

export const viewerCanComment = (user?: { role?: unknown } | null): boolean => {
  return user?.role === 'user'
}

export const assertAuthenticatedCommentUser = (user?: { id?: unknown } | null): void => {
  if (!user || normalizeEntityId(user.id) == null) {
    throw new Error('You must be signed in to comment.')
  }
}

export const viewerCanCommentAnyAuth = (user?: { id?: unknown } | null): boolean => {
  return user != null && normalizeEntityId(user.id) != null
}

// ----------------------- Edit Window -----------------------

export const getCommentEditWindowEndsAt = (createdAt: string | undefined): string | undefined => {
  if (!createdAt) return undefined
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return undefined
  return new Date(createdMs + COMMENT_EDIT_WINDOW_MS).toISOString()
}

export const isCommentWithinEditWindow = (createdAt: string | undefined): boolean => {
  if (!createdAt) return false
  const createdMs = new Date(createdAt).getTime()
  if (Number.isNaN(createdMs)) return false
  return Date.now() - createdMs < COMMENT_EDIT_WINDOW_MS
}

// ----------------------- Ownership / Deletion Checks -----------------------

type CommentAuthorDoc = {
  id?: unknown
  author?: unknown
  deletedAt?: unknown
  status?: unknown
  createdAt?: unknown
}

export const assertCommentAuthor = ({
  comment,
  user,
  action = 'edit',
}: {
  comment: CommentAuthorDoc
  user: { id?: unknown }
  action?: 'delete' | 'edit' | 'modify'
}): void => {
  const authorId = normalizeEntityId(comment.author)
  const userId = normalizeEntityId(user.id)

  if (authorId == null || userId == null || String(authorId) !== String(userId)) {
    const actionLabel = action === 'modify' ? 'modify' : action
    throw new Error(`You do not have permission to ${actionLabel} this comment.`)
  }
}

export const assertCommentNotDeleted = (comment: CommentAuthorDoc): void => {
  if (comment.deletedAt != null) {
    throw new Error('This comment has been deleted.')
  }
}

export const assertCommentEditableNow = (comment: CommentAuthorDoc): void => {
  const status = normalizeCommentStatus(comment.status)

  if (status !== 'approved' && status !== 'pending') {
    throw new Error('This comment cannot be edited.')
  }

  if (!isCommentWithinEditWindow(comment.createdAt as string | undefined)) {
    throw new Error('The edit window for this comment has expired.')
  }
}

export const commentIsDeleted = (comment: CommentAuthorDoc): boolean => {
  return comment.deletedAt != null
}

// ----------------------- Rate Limiting -----------------------

type RateLimitArgs = {
  payload: Payload
  userId: number
  target: { type: 'chapter' | 'post'; id: number }
}

export const assertCommentCreateRateLimit = async ({
  payload,
  userId,
  target,
}: RateLimitArgs): Promise<void> => {
  const tenMinutesAgo = new Date(Date.now() - COMMENT_RATE_LIMIT_PER_TARGET_WINDOW_MS).toISOString()
  const oneHourAgo = new Date(Date.now() - COMMENT_RATE_LIMIT_GLOBAL_WINDOW_MS).toISOString()

  const perTargetWhere: any = {
    and: [
      target.type === 'chapter'
        ? { chapter: { equals: target.id } }
        : { post: { equals: target.id } },
      { author: { equals: userId } },
      { createdAt: { greater_than: tenMinutesAgo } },
    ],
  }

  const globalWhere: any = {
    and: [{ author: { equals: userId } }, { createdAt: { greater_than: oneHourAgo } }],
  }

  const [perTargetCount, globalCount] = await Promise.all([
    payload.count({
      collection: 'comments',
      where: perTargetWhere,
      overrideAccess: true,
    }),
    payload.count({
      collection: 'comments',
      where: globalWhere,
      overrideAccess: true,
    }),
  ])

  if (perTargetCount.totalDocs >= COMMENT_RATE_LIMIT_PER_TARGET) {
    throw new Error('Too many comments on this item. Please wait a few minutes.')
  }

  if (globalCount.totalDocs >= COMMENT_RATE_LIMIT_GLOBAL) {
    throw new Error('Too many comments overall. Please wait before commenting again.')
  }
}

// ----------------------- Hooks -----------------------

export const commentsBeforeValidateHook: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }

  const workingData = typeof data === 'object' ? { ...(data as Record<string, unknown>) } : data

  if (operation === 'create') {
    // Validate exclusive target
    assertExclusiveCommentTarget({
      chapter: workingData.chapter,
      post: workingData.post,
    })

    // Normalize content
    const rawContent = workingData.content
    if (rawContent != null) {
      ;(workingData as Record<string, unknown>).content = normalizeCommentContent(rawContent)
    }

    return workingData
  }

  if (operation === 'update') {
    const original = originalDoc as Record<string, unknown> | undefined

    if (hasOwn(workingData, 'content')) {
      ;(workingData as Record<string, unknown>).content = normalizeCommentContent(
        workingData.content,
      )
    }

    if (hasOwn(workingData, 'status')) {
      const nextStatus = normalizeCommentStatus(workingData.status)
      const originalStatus = normalizeCommentStatus(original?.status)

      if (!nextStatus) {
        throw new Error('Invalid comment status.')
      }

      // Allow approved -> pending only when the original author is performing
      // the update. This prevents admin collection edits from silently
      // re-pending someone else's comment.
      if (originalStatus && nextStatus !== originalStatus && nextStatus === 'pending') {
        if (originalStatus !== 'approved') {
          throw new Error('Comment status cannot be reset to pending.')
        }

        const originalAuthorId = normalizeEntityId(original?.author)
        const requestUserId = normalizeEntityId(req.user?.id)

        if (
          originalAuthorId == null ||
          requestUserId == null ||
          String(originalAuthorId) !== String(requestUserId)
        ) {
          throw new Error('Comment status cannot be reset to pending.')
        }
      }
    }

    // Enforce immutability of author, chapter, post, parentComment
    const authorId = normalizeEntityId(workingData.author)
    const originalAuthorId = normalizeEntityId(original?.author)

    if (authorId != null && String(authorId) !== String(originalAuthorId)) {
      throw new Error('Author cannot be changed after creation.')
    }

    const chapterId = normalizeEntityId(workingData.chapter)
    const originalChapterId = normalizeEntityId(original?.chapter)

    if (chapterId != null && String(chapterId) !== String(originalChapterId)) {
      throw new Error('Chapter target cannot be changed after creation.')
    }

    const postId = normalizeEntityId(workingData.post)
    const originalPostId = normalizeEntityId(original?.post)

    if (postId != null && String(postId) !== String(originalPostId)) {
      throw new Error('Post target cannot be changed after creation.')
    }

    const parentId = normalizeEntityId(workingData.parentComment)
    const originalParentId = normalizeEntityId(original?.parentComment)

    if (parentId != null && String(parentId) !== String(originalParentId)) {
      throw new Error('Parent comment cannot be changed after creation.')
    }

    return workingData
  }

  return data
}

export const commentsBeforeChangeHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }

  const workingData = typeof data === 'object' ? { ...(data as Record<string, unknown>) } : data

  if (operation !== 'update') {
    return workingData
  }

  const original = (originalDoc as Record<string, unknown> | undefined) ?? {}

  // Ensure immutability: strip any attempts to modify these fields
  if (original.author != null) {
    ;(workingData as Record<string, unknown>).author = original.author
  }

  if (original.chapter != null) {
    ;(workingData as Record<string, unknown>).chapter = original.chapter
  }

  if (original.post != null) {
    ;(workingData as Record<string, unknown>).post = original.post
  }

  if (original.parentComment != null) {
    ;(workingData as Record<string, unknown>).parentComment = original.parentComment
  } else if (workingData.parentComment != null) {
    delete (workingData as Record<string, unknown>).parentComment
  }

  const originalStatus = normalizeCommentStatus(original.status)
  const nextStatus = normalizeCommentStatus(workingData.status ?? original.status)

  if (!nextStatus) {
    throw new Error('Invalid comment status.')
  }

  if (nextStatus !== originalStatus) {
    if (nextStatus === 'pending') {
      ;(workingData as Record<string, unknown>).moderatedAt = null
      ;(workingData as Record<string, unknown>).moderatedBy = null
    } else {
      ;(workingData as Record<string, unknown>).moderatedAt = new Date().toISOString()

      const moderatorId = normalizeEntityId(req.user?.id)

      if (moderatorId != null) {
        ;(workingData as Record<string, unknown>).moderatedBy = moderatorId
      } else if (original.moderatedBy != null) {
        ;(workingData as Record<string, unknown>).moderatedBy = original.moderatedBy
      }
    }
  } else {
    ;(workingData as Record<string, unknown>).moderatedAt = original.moderatedAt ?? null
    ;(workingData as Record<string, unknown>).moderatedBy = original.moderatedBy ?? null
  }

  return workingData
}

// ----------------------- Public Payload Mapping -----------------------

type CommentDocAuthor = {
  id?: unknown
  fullName?: unknown
  avatar?: unknown
}

type CommentDoc = {
  id?: unknown
  content?: unknown
  status?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  parentComment?: unknown
  chapter?: unknown
  post?: unknown
  author?: unknown
  deletedAt?: unknown
}

type PublicCommentAuthor = {
  id: string | number
  fullName: string
  avatar?: unknown
}

type PublicComment = {
  id: string | number
  content: string
  status: string
  createdAt?: string
  updatedAt?: string
  parentCommentId?: string | number | null
  chapterId?: string | number | null
  postId?: string | number | null
  isOwnPending: boolean
  isDeleted: boolean
  viewerCanEdit: boolean
  viewerCanDelete: boolean
  editWindowEndsAt?: string
  author: PublicCommentAuthor
}

const normalizeCommentAuthorAvatar = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return normalizeEntityId((value as { id?: unknown }).id) != null
    ? (value as Record<string, unknown>)
    : null
}

export const mapCommentDocToPublicComment = (
  doc: unknown,
  viewer?: { id?: unknown } | null,
): PublicComment => {
  const d = doc as CommentDoc
  const a = (d.author as CommentDocAuthor | undefined) ?? {}

  // author might be a primitive ID when relationship is unpopulated
  const authorId = normalizeEntityId(a.id) ?? normalizeEntityId(d.author) ?? ''
  const authorFullName =
    typeof a.fullName === 'string' && a.fullName.trim().length > 0 ? a.fullName.trim() : 'Unknown'

  const commentId = normalizeEntityId(d.id) ?? ''
  const isDeleted = d.deletedAt != null
  const commentContent = isDeleted ? '' : typeof d.content === 'string' ? d.content : ''
  const commentStatus = typeof d.status === 'string' ? d.status : 'pending'

  const viewerId = normalizeEntityId(viewer?.id)
  const isOwner = viewerId != null && authorId !== '' && String(viewerId) === String(authorId)
  const createdAtStr = typeof d.createdAt === 'string' ? d.createdAt : undefined
  const editableStatuses = ['pending', 'approved']

  return {
    id: commentId,
    content: commentContent,
    status: commentStatus,
    createdAt: createdAtStr,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
    parentCommentId: normalizeEntityId(d.parentComment) ?? null,
    chapterId: normalizeEntityId(d.chapter) ?? null,
    postId: normalizeEntityId(d.post) ?? null,
    isOwnPending: commentStatus === 'pending' && isOwner,
    isDeleted,
    viewerCanEdit:
      isOwner &&
      !isDeleted &&
      editableStatuses.includes(commentStatus) &&
      isCommentWithinEditWindow(createdAtStr),
    viewerCanDelete: isOwner && !isDeleted,
    editWindowEndsAt: getCommentEditWindowEndsAt(createdAtStr),
    author: {
      id: authorId,
      fullName: authorFullName,
      avatar: normalizeCommentAuthorAvatar(a.avatar),
    },
  }
}
