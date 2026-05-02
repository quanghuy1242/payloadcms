import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Comments } from '@/collections/Comments'
import { commentsResolver } from '@/graphql/queries/Comments/resolver'
import { createCommentResolver } from '@/graphql/mutations/CreateComment/resolver'
import { updateCommentResolver } from '@/graphql/mutations/UpdateComment/resolver'
import { deleteCommentResolver } from '@/graphql/mutations/DeleteComment/resolver'
import { updateCommentStatusResolver } from '@/graphql/mutations/UpdateCommentStatus/resolver'
import {
  assertAuthenticatedCommentUser,
  assertCommentAuthor,
  assertCommentCreateRole,
  assertCommentCreateRateLimit,
  assertCommentEditableNow,
  assertCommentNotDeleted,
  assertCommentTargetReadable,
  assertExclusiveCommentTarget,
  assertParentCommentIsValid,
  commentIsDeleted,
  commentsBeforeChangeHook,
  commentsBeforeValidateHook,
  COMMENT_EDIT_WINDOW_MS,
  COMMENT_MAX_LENGTH,
  COMMENT_RATE_LIMIT_GLOBAL,
  COMMENT_RATE_LIMIT_PER_TARGET,
  PUBLIC_COMMENT_DEPTH,
  getCommentEditWindowEndsAt,
  isCommentWithinEditWindow,
  mapCommentDocToPublicComment,
  normalizeCommentContent,
  viewerCanCommentAnyAuth,
} from '@/utils/comments'

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Collection config
// ---------------------------------------------------------------------------

describe('Comments collection', () => {
  it('has the required fields', () => {
    const fieldNames = Comments.fields.map((f) => ('name' in f ? f.name : ''))
    expect(fieldNames).toContain('chapter')
    expect(fieldNames).toContain('post')
    expect(fieldNames).toContain('author')
    expect(fieldNames).toContain('content')
    expect(fieldNames).toContain('status')
    expect(fieldNames).toContain('parentComment')
    expect(fieldNames).toContain('moderatedAt')
    expect(fieldNames).toContain('moderatedBy')
    expect(fieldNames).toContain('deletedAt')
    expect(fieldNames).toContain('deletedBy')
  })

  it('uses adminAccess for all operations', () => {
    expect(Comments.access?.create).toEqual(expect.any(Function))
    expect(Comments.access?.read).toEqual(expect.any(Function))
    expect(Comments.access?.update).toEqual(expect.any(Function))
    expect(Comments.access?.delete).toEqual(expect.any(Function))

    // Anonymous cannot access
    const anonResult = Comments.access?.read?.({ req: { user: null } } as never)
    expect(anonResult).toBe(false)

    // Regular user cannot access
    const userResult = Comments.access?.read?.({ req: { user: { id: 99, role: 'user' } } } as never)
    expect(userResult).toBe(false)

    // Admin can access
    const adminResult = Comments.access?.read?.({ req: { user: { id: 1, role: 'admin' } } } as never)
    expect(adminResult).toBe(true)
  })

  it('is visible in admin navigation', () => {
    expect(Comments.admin?.hidden).toBeUndefined()
  })

  it('has compound indexes defined', () => {
    expect(Comments.indexes).toBeDefined()
    expect(Comments.indexes!.length).toBeGreaterThanOrEqual(8)
  })

  it('has rate-limit indexes', () => {
    const indexFields = Comments.indexes!.map((idx) => idx.fields.join(','))
    expect(indexFields).toContain('author,createdAt')
    expect(indexFields).toContain('chapter,author,createdAt')
    expect(indexFields).toContain('post,author,createdAt')
  })

  it('has beforeValidate and beforeChange hooks', () => {
    expect(Comments.hooks?.beforeValidate).toBeDefined()
    expect(Comments.hooks?.beforeChange).toBeDefined()
    expect(Comments.hooks!.beforeValidate!.length).toBeGreaterThan(0)
    expect(Comments.hooks!.beforeChange!.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// normalizeCommentContent
// ---------------------------------------------------------------------------

describe('normalizeCommentContent', () => {
  it('trims and returns valid content', () => {
    expect(normalizeCommentContent('  Hello world  ')).toBe('Hello world')
  })

  it('throws on empty string after trim', () => {
    expect(() => normalizeCommentContent('   ')).toThrow('Comment content cannot be empty.')
  })

  it('throws on non-string input', () => {
    expect(() => normalizeCommentContent(123 as never)).toThrow('Comment content must be a string.')
    expect(() => normalizeCommentContent(null as never)).toThrow('Comment content must be a string.')
  })

  it('throws on content exceeding max length', () => {
    const longContent = 'a'.repeat(COMMENT_MAX_LENGTH + 1)
    expect(() => normalizeCommentContent(longContent)).toThrow(
      `Comment content must not exceed ${COMMENT_MAX_LENGTH} characters.`,
    )
  })

  it('allows content at exactly max length', () => {
    const maxContent = 'a'.repeat(COMMENT_MAX_LENGTH)
    expect(normalizeCommentContent(maxContent)).toBe(maxContent)
  })
})

// ---------------------------------------------------------------------------
// assertExclusiveCommentTarget
// ---------------------------------------------------------------------------

describe('assertExclusiveCommentTarget', () => {
  it('accepts chapter only', () => {
    expect(() => assertExclusiveCommentTarget({ chapter: 1 })).not.toThrow()
  })

  it('accepts post only', () => {
    expect(() => assertExclusiveCommentTarget({ post: 1 })).not.toThrow()
  })

  it('throws when both are set', () => {
    expect(() => assertExclusiveCommentTarget({ chapter: 1, post: 2 })).toThrow(
      'A comment must target either a chapter or a post, not both.',
    )
  })

  it('throws when neither is set', () => {
    expect(() => assertExclusiveCommentTarget({})).toThrow(
      'A comment must target either a chapter or a post.',
    )
  })

  it('throws when both are null/undefined', () => {
    expect(() => assertExclusiveCommentTarget({ chapter: null, post: null })).toThrow(
      'A comment must target either a chapter or a post.',
    )
  })
})

// ---------------------------------------------------------------------------
// assertCommentCreateRole
// ---------------------------------------------------------------------------

describe('assertCommentCreateRole', () => {
  it('accepts user role', () => {
    expect(() => assertCommentCreateRole({ role: 'user' })).not.toThrow()
  })

  it('throws when not authenticated', () => {
    expect(() => assertCommentCreateRole(null)).toThrow('You must be signed in to comment.')
  })

  it('throws when user is admin', () => {
    expect(() => assertCommentCreateRole({ role: 'admin' })).toThrow(
      'You do not have permission to comment from this interface.',
    )
  })
})

// ---------------------------------------------------------------------------
// assertAuthenticatedCommentUser
// ---------------------------------------------------------------------------

describe('assertAuthenticatedCommentUser', () => {
  it('accepts any authenticated user with id', () => {
    expect(() => assertAuthenticatedCommentUser({ id: 99 })).not.toThrow()
  })

  it('accepts admin user', () => {
    expect(() => assertAuthenticatedCommentUser({ id: 1 })).not.toThrow()
  })

  it('throws when not authenticated', () => {
    expect(() => assertAuthenticatedCommentUser(null)).toThrow('You must be signed in to comment.')
    expect(() => assertAuthenticatedCommentUser(undefined)).toThrow('You must be signed in to comment.')
  })

  it('throws when user has no id', () => {
    expect(() => assertAuthenticatedCommentUser({})).toThrow('You must be signed in to comment.')
  })
})

// ---------------------------------------------------------------------------
// viewerCanCommentAnyAuth
// ---------------------------------------------------------------------------

describe('viewerCanCommentAnyAuth', () => {
  it('returns true for authenticated user', () => {
    expect(viewerCanCommentAnyAuth({ id: 99 })).toBe(true)
  })

  it('returns true for authenticated admin', () => {
    expect(viewerCanCommentAnyAuth({ id: 1 })).toBe(true)
  })

  it('returns false for unauthenticated', () => {
    expect(viewerCanCommentAnyAuth(null)).toBe(false)
    expect(viewerCanCommentAnyAuth(undefined)).toBe(false)
  })

  it('returns false when user has no id', () => {
    expect(viewerCanCommentAnyAuth({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edit window helpers
// ---------------------------------------------------------------------------

describe('getCommentEditWindowEndsAt', () => {
  it('returns ISO string 5 hours after createdAt', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const result = getCommentEditWindowEndsAt(createdAt)
    expect(result).toBe('2026-01-01T05:00:00.000Z')
  })

  it('returns undefined for undefined input', () => {
    expect(getCommentEditWindowEndsAt(undefined)).toBeUndefined()
  })

  it('returns undefined for invalid date', () => {
    expect(getCommentEditWindowEndsAt('invalid')).toBeUndefined()
  })
})

describe('isCommentWithinEditWindow', () => {
  it('returns true for recent comment', () => {
    const recent = new Date(Date.now() - 60_000).toISOString() // 1 minute ago
    expect(isCommentWithinEditWindow(recent)).toBe(true)
  })

  it('returns false for old comment', () => {
    const old = new Date(Date.now() - COMMENT_EDIT_WINDOW_MS - 1_000).toISOString()
    expect(isCommentWithinEditWindow(old)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isCommentWithinEditWindow(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Ownership / Deletion checks
// ---------------------------------------------------------------------------

describe('assertCommentAuthor', () => {
  it('passes when user owns the comment', () => {
    expect(() =>
      assertCommentAuthor({ comment: { author: 99 }, user: { id: 99 } }),
    ).not.toThrow()
  })

  it('throws when user does not own the comment', () => {
    expect(() =>
      assertCommentAuthor({ comment: { author: 99 }, user: { id: 88 } }),
    ).toThrow('You do not have permission to edit this comment.')
  })
})

describe('assertCommentNotDeleted', () => {
  it('passes when comment is not deleted', () => {
    expect(() => assertCommentNotDeleted({})).not.toThrow()
  })

  it('throws when comment is deleted', () => {
    expect(() => assertCommentNotDeleted({ deletedAt: '2026-01-01T00:00:00Z' })).toThrow(
      'This comment has been deleted.',
    )
  })
})

describe('assertCommentEditableNow', () => {
  it('passes when within edit window', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    expect(() => assertCommentEditableNow({ createdAt: recent, status: 'pending' })).not.toThrow()
  })

  it('throws when outside edit window', () => {
    const old = new Date(Date.now() - COMMENT_EDIT_WINDOW_MS - 1_000).toISOString()
    expect(() => assertCommentEditableNow({ createdAt: old, status: 'approved' })).toThrow(
      'The edit window for this comment has expired.',
    )
  })

  it('throws when comment status is not editable', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    expect(() => assertCommentEditableNow({ createdAt: recent, status: 'rejected' })).toThrow(
      'This comment cannot be edited.',
    )
  })
})

describe('commentIsDeleted', () => {
  it('returns false when not deleted', () => {
    expect(commentIsDeleted({})).toBe(false)
  })

  it('returns true when deleted', () => {
    expect(commentIsDeleted({ deletedAt: '2026-01-01T00:00:00Z' })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// assertCommentTargetReadable
// ---------------------------------------------------------------------------

describe('assertCommentTargetReadable', () => {
  it('returns chapter target when chapter is readable', async () => {
    const chapterDoc = { id: 7, hasPassword: false }
    const findByID = vi.fn().mockResolvedValue(chapterDoc)
    const payload = { findByID } as never

    const chapterPasswords = await import('@/utils/chapterPasswords')
    const canReadSpy = vi
      .spyOn(chapterPasswords, 'canReadChapterContentForRequest')
      .mockResolvedValue(true)

    const result = await assertCommentTargetReadable({
      chapterId: 7,
      payload,
      req: {} as never,
      user: { id: 99, role: 'user' },
    })

    expect(result.type).toBe('chapter')
    expect(result.id).toBe(7)
    canReadSpy.mockRestore()
  })

  it('throws when chapter is password-locked and proof is missing', async () => {
    const chapterDoc = { id: 7, hasPassword: true }
    const findByID = vi.fn().mockResolvedValue(chapterDoc)
    const payload = { findByID } as never

    const chapterPasswords = await import('@/utils/chapterPasswords')
    const canReadSpy = vi
      .spyOn(chapterPasswords, 'canReadChapterContentForRequest')
      .mockResolvedValue(false)

    await expect(
      assertCommentTargetReadable({
        chapterId: 7,
        payload,
        req: {} as never,
        user: { id: 99, role: 'user' },
      }),
    ).rejects.toThrow(
      'You do not have permission to view comments on this content.',
    )

    canReadSpy.mockRestore()
  })

  it('returns post target when post is published', async () => {
    const postDoc = { id: 3, _status: 'published' }
    const findByID = vi.fn().mockResolvedValue(postDoc)
    const payload = { findByID } as never

    const result = await assertCommentTargetReadable({
      postId: 3,
      payload,
      req: {} as never,
    })

    expect(result.type).toBe('post')
    expect(result.id).toBe(3)
  })

  it('throws when post is not published', async () => {
    const postDoc = { id: 3, _status: 'draft' }
    const findByID = vi.fn().mockResolvedValue(postDoc)
    const payload = { findByID } as never

    await expect(
      assertCommentTargetReadable({
        postId: 3,
        payload,
        req: {} as never,
      }),
    ).rejects.toThrow('Post is not published.')
  })

  it('throws when target is not found', async () => {
    const findByID = vi.fn().mockResolvedValue(null)
    const payload = { findByID } as never

    await expect(
      assertCommentTargetReadable({
        postId: 999,
        payload,
        req: {} as never,
      }),
    ).rejects.toThrow('Comment target not found.')
  })
})

// ---------------------------------------------------------------------------
// mapCommentDocToPublicComment
// ---------------------------------------------------------------------------

describe('mapCommentDocToPublicComment', () => {
  it('maps a comment doc to public shape with own pending flag', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      parentComment: null,
      chapter: 7,
      post: null,
      author: { id: 99, fullName: 'Bob', avatar: null },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.id).toBe(1)
    expect(result.content).toBe('Hello')
    expect(result.status).toBe('pending')
    expect(result.isOwnPending).toBe(true)
    expect(result.parentCommentId).toBeNull()
    expect(result.chapterId).toBe(7)
    expect(result.postId).toBeNull()
    expect(result.author.id).toBe(99)
    expect(result.author.fullName).toBe('Bob')
  })

  it('returns isOwnPending false when viewer is different user', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'pending',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 88 })

    expect(result.isOwnPending).toBe(false)
  })

  it('returns isOwnPending false for approved comments', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.isOwnPending).toBe(false)
  })

  it('falls back to Unknown for missing author name', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99 },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.author.fullName).toBe('Unknown')
  })

  it('handles author as primitive ID (unpopulated)', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: 99,
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.author.id).toBe(99)
    expect(result.author.fullName).toBe('Unknown')
  })

  it('drops avatar when the relation is only an ID', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99, fullName: 'Bob', avatar: 42 },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.author.avatar).toBeNull()
  })

  it('keeps avatar when the relation is populated', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99, fullName: 'Bob', avatar: { id: 42, alt: 'avatar' } },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.author.avatar).toEqual({ id: 42, alt: 'avatar' })
  })

  it('handles null viewer gracefully', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99, fullName: 'Alice' },
    }

    const result = mapCommentDocToPublicComment(doc, null)

    expect(result.isOwnPending).toBe(false)
    expect(result.author.fullName).toBe('Alice')
  })

  it('returns isDeleted true and blank content for deleted comments', () => {
    const doc = {
      id: 1,
      content: 'Secret text',
      status: 'approved',
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.isDeleted).toBe(true)
    expect(result.content).toBe('')
  })

  it('returns viewerCanEdit true for owner within edit window', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      createdAt: recent,
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.viewerCanEdit).toBe(true)
  })

  it('returns viewerCanEdit false for expired edit window', () => {
    const old = new Date(Date.now() - COMMENT_EDIT_WINDOW_MS - 1_000).toISOString()
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      createdAt: old,
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.viewerCanEdit).toBe(false)
  })

  it('returns viewerCanEdit false for deleted comments', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      createdAt: recent,
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.viewerCanEdit).toBe(false)
  })

  it('returns viewerCanDelete true for owner of non-deleted comment', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.viewerCanDelete).toBe(true)
  })

  it('returns viewerCanDelete false for deleted comments', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.viewerCanDelete).toBe(false)
  })

  it('returns editWindowEndsAt 5 hours after createdAt', () => {
    const doc = {
      id: 1,
      content: 'Hello',
      status: 'approved',
      createdAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }

    const result = mapCommentDocToPublicComment(doc, { id: 99 })

    expect(result.editWindowEndsAt).toBe('2026-01-01T05:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// assertParentCommentIsValid
// ---------------------------------------------------------------------------

describe('assertParentCommentIsValid', () => {
  const makeTarget = () =>
    ({ type: 'chapter', id: 7, doc: { id: 7 } }) as const
  const makePayload = (parentDoc: unknown) => ({
    findByID: vi.fn().mockResolvedValue(parentDoc),
  })

  it('returns null when no parentCommentId provided', async () => {
    const result = await assertParentCommentIsValid({
      parentCommentId: null,
      target: makeTarget(),
      payload: makePayload(null) as never,
      req: {} as never,
      } as never)

    expect(result).toBeNull()
  })

  it('accepts a valid top-level approved parent on the same target', async () => {
    const parent = {
      id: 1,
      chapter: 7,
      parentComment: null,
      status: 'approved',
    }

    const result = await assertParentCommentIsValid({
      parentCommentId: 1,
      target: makeTarget(),
      payload: makePayload(parent) as never,
      req: {} as never,
      } as never)

    expect(result).toEqual(parent)
  })

  it('throws when parent does not exist', async () => {
    const payload = { findByID: vi.fn().mockResolvedValue(null) }

    await expect(
      assertParentCommentIsValid({
        parentCommentId: 999,
        target: makeTarget(),
        payload: payload as never,
        req: {} as never,
      } as never),
    ).rejects.toThrow('Parent comment not found.')
  })

  it('throws when parent is a reply (reply-to-reply)', async () => {
    const parent = {
      id: 2,
      chapter: 7,
      parentComment: 1,
      status: 'approved',
    }

    await expect(
      assertParentCommentIsValid({
        parentCommentId: 2,
        target: makeTarget(),
        payload: makePayload(parent) as never,
        req: {} as never,
      } as never),
    ).rejects.toThrow('Replies to replies are not supported.')
  })

  it('throws when parent belongs to a different target', async () => {
    const parent = {
      id: 1,
      chapter: 99,
      parentComment: null,
      status: 'approved',
    }

    await expect(
      assertParentCommentIsValid({
        parentCommentId: 1,
        target: makeTarget(),
        payload: makePayload(parent) as never,
        req: {} as never,
      } as never),
    ).rejects.toThrow('Parent comment must belong to the same chapter.')
  })

  it('throws when parent is not approved', async () => {
    const parent = {
      id: 1,
      chapter: 7,
      parentComment: null,
      status: 'pending',
    }

    await expect(
      assertParentCommentIsValid({
        parentCommentId: 1,
        target: makeTarget(),
        payload: makePayload(parent) as never,
        req: {} as never,
      } as never),
    ).rejects.toThrow('Cannot reply to a comment that has not been approved.')
  })

  it('throws when parent is rejected', async () => {
    const parent = {
      id: 1,
      chapter: 7,
      parentComment: null,
      status: 'rejected',
    }

    await expect(
      assertParentCommentIsValid({
        parentCommentId: 1,
        target: makeTarget(),
        payload: makePayload(parent) as never,
        req: {} as never,
      } as never),
    ).rejects.toThrow('Cannot reply to a comment that has not been approved.')
  })
})

// ---------------------------------------------------------------------------
// commentsBeforeValidateHook
// ---------------------------------------------------------------------------

describe('commentsBeforeValidateHook', () => {
  it('validates exclusive target on create', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { chapter: 1, post: 2, content: 'test' },
        operation: 'create',
        req: {} as never,
      } as never),
    ).rejects.toThrow('A comment must target either a chapter or a post, not both.')
  })

  it('normalizes content on create', async () => {
    const result = await commentsBeforeValidateHook({
      data: { chapter: 1, content: '  trimmed  ' },
      operation: 'create',
      req: {} as never,
      } as never)

    expect((result as Record<string, unknown>).content).toBe('trimmed')
  })

  it('rejects empty content on create', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { chapter: 1, content: '   ' },
        operation: 'create',
        req: {} as never,
      } as never),
    ).rejects.toThrow('Comment content cannot be empty.')
  })

  it('enforces immutability of author on update', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { author: 88 },
        operation: 'update',
        originalDoc: { author: 99 },
        req: {} as never,
      } as never),
    ).rejects.toThrow('Author cannot be changed after creation.')
  })

  it('enforces immutability of chapter on update', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { chapter: 99 },
        operation: 'update',
        originalDoc: { chapter: 7 },
        req: {} as never,
      } as never),
    ).rejects.toThrow('Chapter target cannot be changed after creation.')
  })

  it('enforces immutability of post on update', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { post: 99 },
        operation: 'update',
        originalDoc: { post: 7 },
        req: {} as never,
      } as never),
    ).rejects.toThrow('Post target cannot be changed after creation.')
  })

  it('enforces immutability of parentComment on update', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { parentComment: 99 },
        operation: 'update',
        originalDoc: { parentComment: 7 },
        req: {} as never,
      } as never),
    ).rejects.toThrow('Parent comment cannot be changed after creation.')
  })

  it('allows updating allowed fields like status on update', async () => {
    const result = await commentsBeforeValidateHook({
      data: { status: 'approved' },
      operation: 'update',
      originalDoc: { chapter: 7, author: 99 },
      req: {} as never,
      } as never)

    expect(result).toBeDefined()
  })

  it('normalizes content on update when content is provided', async () => {
    const result = await commentsBeforeValidateHook({
      data: { content: '  updated content  ' },
      operation: 'update',
      originalDoc: { chapter: 7, author: 99, status: 'pending' },
      req: {} as never,
    } as never)

    expect((result as Record<string, unknown>).content).toBe('updated content')
  })

  it('rejects resetting comment status back to pending on update', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { status: 'pending' },
        operation: 'update',
        originalDoc: { chapter: 7, author: 99, status: 'rejected' },
        req: {} as never,
      } as never),
    ).rejects.toThrow('Comment status cannot be reset to pending.')
  })

  it('allows approved -> pending transition (author edit)', async () => {
    const result = await commentsBeforeValidateHook({
      data: { status: 'pending', content: 'updated' },
      operation: 'update',
      originalDoc: { chapter: 7, author: 99, status: 'approved' },
      req: { user: { id: 99 } } as never,
    } as never)

    expect(result).toBeDefined()
  })

  it('rejects approved -> pending transition for non-author updates', async () => {
    await expect(
      commentsBeforeValidateHook({
        data: { status: 'pending', content: 'updated' },
        operation: 'update',
        originalDoc: { chapter: 7, author: 99, status: 'approved' },
        req: { user: { id: 1 } } as never,
      } as never),
    ).rejects.toThrow('Comment status cannot be reset to pending.')
  })

  it('allows same author when IDs match across different formats', async () => {
    // author from client as string, in originalDoc as number — should not throw
    const result = await commentsBeforeValidateHook({
      data: { author: '99', status: 'approved' },
      operation: 'update',
      originalDoc: { author: 99, chapter: 7 },
      req: {} as never,
    } as never)

    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// commentsBeforeChangeHook
// ---------------------------------------------------------------------------

describe('commentsBeforeChangeHook', () => {
  it('passes through on create', async () => {
    const data = { chapter: 7, author: 99, content: 'test' }
    const result = await commentsBeforeChangeHook({
      data,
      operation: 'create',
      req: {} as never,
      } as never)

    expect(result).toEqual(data)
  })

  it('preserves immutable fields on update', async () => {
    const original = { author: 99, chapter: 7, post: null, parentComment: null }
    const working = { author: 88, chapter: 99, status: 'approved' }

    const result = await commentsBeforeChangeHook({
      data: working,
      operation: 'update',
      originalDoc: original,
      req: {} as never,
      } as never)

    expect((result as Record<string, unknown>).author).toBe(99)
    expect((result as Record<string, unknown>).chapter).toBe(7)
    expect((result as Record<string, unknown>).status).toBe('approved')
  })

  it('sets moderation metadata when status changes on update', async () => {
    const result = await commentsBeforeChangeHook({
      data: { status: 'approved' },
      operation: 'update',
      originalDoc: {
        author: 99,
        chapter: 7,
        status: 'pending',
        moderatedAt: null,
        moderatedBy: null,
      },
      req: { user: { id: 1 } } as never,
    } as never)

    expect((result as Record<string, unknown>).moderatedAt).toEqual(expect.any(String))
    expect((result as Record<string, unknown>).moderatedBy).toBe(1)
  })

  it('preserves moderation metadata when approved -> pending (author edit)', async () => {
    const result = await commentsBeforeChangeHook({
      data: { status: 'pending', moderatedAt: null, moderatedBy: null },
      operation: 'update',
      originalDoc: {
        author: 99,
        chapter: 7,
        status: 'approved',
        moderatedAt: '2026-01-01T00:00:00Z',
        moderatedBy: 1,
      },
      req: { user: { id: 99 } } as never,
    } as never)

    // When author edits approved comment, resolver passes null for moderatedAt/moderatedBy
    // The hook should preserve what's in the workingData (null from resolver)
    expect((result as Record<string, unknown>).moderatedAt).toBeNull()
    expect((result as Record<string, unknown>).moderatedBy).toBeNull()
  })

  it('preserves moderation metadata when status does not change', async () => {
    const result = await commentsBeforeChangeHook({
      data: { content: 'kept' },
      operation: 'update',
      originalDoc: {
        author: 99,
        chapter: 7,
        status: 'approved',
        moderatedAt: '2026-01-01T00:00:00Z',
        moderatedBy: 5,
      },
      req: { user: { id: 1 } } as never,
    } as never)

    expect((result as Record<string, unknown>).moderatedAt).toBe('2026-01-01T00:00:00Z')
    expect((result as Record<string, unknown>).moderatedBy).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// commentsResolver (GraphQL query)
// ---------------------------------------------------------------------------

describe('commentsResolver', () => {
  const makeContext = ({
    user,
    findByID,
    findMock,
  }: {
    user?: unknown
    findByID?: ReturnType<typeof vi.fn>
    findMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findByID ?? vi.fn().mockResolvedValue(null),
        find: findMock ?? vi.fn().mockResolvedValue({ docs: [] }),
      },
      user: user ?? null,
      headers: {},
    },
  })

  it('returns approved comments only for anonymous users (post)', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const approvedComment = {
      id: 1,
      content: 'Nice post',
      status: 'approved',
      createdAt: '2026-01-01T00:00:00Z',
      author: { id: 10, fullName: 'Alice' },
    }
    const findMock = vi.fn().mockResolvedValue({
      docs: [approvedComment],
      totalDocs: 1,
    })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({ findByID, findMock }),
    )

    expect(result.viewerCanComment).toBe(false)
    expect(result.totalDocs).toBe(1)
    expect(result.docs).toHaveLength(1)

    const doc = result.docs[0] as Record<string, unknown>
    expect(doc.status).toBe('approved')
    expect(doc.isOwnPending).toBe(false)
    expect((doc.author as Record<string, unknown>).fullName).toBe('Alice')

    // Should only query approved
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: expect.arrayContaining([
            { post: { equals: 3 } },
            { status: { equals: 'approved' } },
          ]),
        },
        sort: 'createdAt',
        limit: 200,
        overrideAccess: true,
      }),
    )
  })

  it('returns approved + own pending for authenticated user role (post)', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const approved = {
      id: 1,
      content: 'Public',
      status: 'approved',
      createdAt: '2026-01-01T00:00:00Z',
      author: { id: 10, fullName: 'Alice' },
    }
    const ownPending = {
      id: 2,
      content: 'My pending',
      status: 'pending',
      createdAt: '2026-01-02T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({ docs: [ownPending], totalDocs: 1 })
      .mockResolvedValueOnce({ docs: [approved], totalDocs: 1 })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({
        findByID,
        findMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(result.viewerCanComment).toBe(true)
    expect(result.totalDocs).toBe(2)
    expect(result.docs).toHaveLength(2)

    const pendingDoc = result.docs[1] as Record<string, unknown>
    expect(pendingDoc.status).toBe('pending')
    expect(pendingDoc.isOwnPending).toBe(true)

    // Called twice: approved + own pending
    expect(findMock).toHaveBeenCalledTimes(2)
    expect(findMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          and: expect.arrayContaining([
            { post: { equals: 3 } },
            { status: { equals: 'pending' } },
            { author: { equals: 99 } },
          ]),
        },
      }),
    )
    expect(findMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        limit: 199,
        where: {
          and: expect.arrayContaining([
            { post: { equals: 3 } },
            { status: { equals: 'approved' } },
          ]),
        },
      }),
    )
  })

  it('hides other users pending comments from authenticated user', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({
        findByID,
        findMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(result.docs).toHaveLength(0)
  })

  it('does not include own pending for admin role', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const ownPending = {
      id: 2,
      content: 'My pending',
      status: 'pending',
      createdAt: '2026-01-02T00:00:00Z',
      author: { id: 1, fullName: 'Admin' },
    }
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({ docs: [ownPending], totalDocs: 1 })
      .mockResolvedValueOnce({ docs: [], totalDocs: 0 })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({
        findByID,
        findMock,
        user: { id: 1, role: 'admin' },
      }),
    )

    expect(result.viewerCanComment).toBe(true)
    expect(result.totalDocs).toBe(1)
    expect(findMock).toHaveBeenCalledTimes(2) // own pending + approved
  })

  it('throws when both chapterId and postId are provided', async () => {
    await expect(
      commentsResolver(
        undefined,
        { chapterId: '1', postId: '2' },
        makeContext(),
      ),
    ).rejects.toThrow(
      'A comment must target either a chapter or a post, not both.',
    )
  })

  it('throws when neither chapterId nor postId is provided', async () => {
    await expect(
      commentsResolver(
        undefined,
        {},
        makeContext(),
      ),
    ).rejects.toThrow('A comment must target either a chapter or a post.')
  })

  it('throws when post is not published', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'draft' })

    await expect(
      commentsResolver(
        undefined,
        { postId: '3' },
        makeContext({ findByID }),
      ),
    ).rejects.toThrow('Post is not published.')
  })

  it('throws when target is not found', async () => {
    const findByID = vi.fn().mockResolvedValue(null)

    await expect(
      commentsResolver(
        undefined,
        { postId: '999' },
        makeContext({ findByID }),
      ),
    ).rejects.toThrow('Comment target not found.')
  })

  it('returns approved comments for a chapter (authorized)', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 7, hasPassword: false })
    const findMock = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 })

    const result = await commentsResolver(
      undefined,
      { chapterId: '7' },
      makeContext({ findByID, findMock, user: { id: 99, role: 'user' } }),
    )

    expect(result.viewerCanComment).toBe(true)
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 200,
        where: {
          and: expect.arrayContaining([
            { chapter: { equals: 7 } },
            { status: { equals: 'approved' } },
          ]),
        },
      }),
    )
  })

  it('throws on password-locked chapter when proof is missing (mocked)', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 7, hasPassword: true })

    await expect(
      commentsResolver(
        undefined,
        { chapterId: '7' },
        {
          req: {
            payload: {
              findByID,
              find: vi.fn(),
            },
            user: { id: 99, role: 'user' },
            headers: {},
          },
        },
      ),
    ).rejects.toThrow(
      'You do not have permission to view comments on this content.',
    )
  })

  it('prioritizes own pending comments within the overall hard cap', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const ownPendingDocs = Array.from({ length: 2 }, (_, index) => ({
      id: index + 1,
      content: `pending-${index + 1}`,
      status: 'pending',
      createdAt: `2026-01-0${index + 1}T00:00:00Z`,
      author: { id: 99, fullName: 'Bob' },
    }))
    const approvedDocs = Array.from({ length: 198 }, (_, index) => ({
      id: index + 100,
      content: `approved-${index + 1}`,
      status: 'approved',
      createdAt: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      author: { id: 10, fullName: 'Alice' },
    }))
    const findMock = vi
      .fn()
      .mockResolvedValueOnce({ docs: ownPendingDocs, totalDocs: 2 })
      .mockResolvedValueOnce({ docs: approvedDocs, totalDocs: 198 })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({
        findByID,
        findMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(result.totalDocs).toBe(200)
    expect(result.docs).toHaveLength(200)
    expect(findMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        limit: 198,
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// createCommentResolver (GraphQL mutation)
// ---------------------------------------------------------------------------

describe('createCommentResolver', () => {
  const makeContext = ({
    user,
    findByID,
    createMock,
    countMock,
  }: {
    user?: unknown
    findByID?: ReturnType<typeof vi.fn>
    createMock?: ReturnType<typeof vi.fn>
    countMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findByID ?? vi.fn().mockResolvedValue(null),
        create: createMock ?? vi.fn().mockResolvedValue({}),
        count: countMock ?? vi.fn().mockResolvedValue({ totalDocs: 0 }),
      },
      user: user ?? null,
      headers: {},
    },
  })

  it('creates a pending top-level comment', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const createMock = vi.fn().mockResolvedValue({
      id: 1,
      content: 'Hello',
      status: 'pending',
      post: 3,
      author: { id: 99, fullName: 'Bob' },
    })

    const result = await createCommentResolver(
      undefined,
      { postId: '3', content: 'Hello' },
      makeContext({
        findByID,
        createMock,
        user: { id: 99, role: 'user' },
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.content).toBe('Hello')
    expect(comment.status).toBe('pending')
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'comments',
        data: expect.objectContaining({
          post: 3,
          author: 99,
          content: 'Hello',
          status: 'pending',
          parentComment: null,
          moderatedAt: null,
          moderatedBy: null,
        }),
        overrideAccess: true,
      }),
    )
  })

  it('creates a reply comment under an approved top-level parent', async () => {
    const findByID = vi.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.collection === 'posts') return Promise.resolve({ id: 3, _status: 'published' })
      if (args.collection === 'comments') return Promise.resolve({ id: 10, post: 3, parentComment: null, status: 'approved' })
      return Promise.resolve(null)
    })
    const createMock = vi.fn().mockResolvedValue({
      id: 2,
      content: 'Reply',
      status: 'pending',
      post: 3,
      parentComment: 10,
      author: { id: 99, fullName: 'Bob' },
    })

    const result = await createCommentResolver(
      undefined,
      { postId: '3', content: 'Reply', parentCommentId: '10' },
      makeContext({
        findByID,
        createMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentComment: 10 }),
      }),
    )
  })

  it('rejects anonymous create', async () => {
    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: 'Hello' },
        makeContext({ user: null }),
      ),
    ).rejects.toThrow('You must be signed in to comment.')
  })

  it('accepts admin create via public flow', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const createMock = vi.fn().mockResolvedValue({
      id: 1,
      content: 'Admin comment',
      status: 'pending',
      post: 3,
      author: { id: 1, fullName: 'Admin' },
    })

    const result = await createCommentResolver(
      undefined,
      { postId: '3', content: 'Admin comment' },
      makeContext({ user: { id: 1, role: 'admin' }, findByID, createMock }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.content).toBe('Admin comment')
  })

  it('rejects content that is only whitespace', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })

    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: '   ' },
        makeContext({
          findByID,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Comment content cannot be empty.')
  })

  it('rejects content exceeding max length', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const longContent = 'a'.repeat(COMMENT_MAX_LENGTH + 1)

    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: longContent },
        makeContext({
          findByID,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow(`Comment content must not exceed ${COMMENT_MAX_LENGTH} characters.`)
  })

  it('rejects reply-to-reply', async () => {
    const findByID = vi.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.collection === 'posts') return Promise.resolve({ id: 3, _status: 'published' })
      if (args.collection === 'comments') return Promise.resolve({ id: 10, post: 3, parentComment: 1, status: 'approved' })
      return Promise.resolve(null)
    })

    await expect(
      createCommentResolver(
        undefined,
        {
          postId: '3',
          content: 'Reply to reply',
          parentCommentId: '10',
        },
        makeContext({
          findByID,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Replies to replies are not supported.')
  })

  it('rejects parent comment on different target', async () => {
    const findByID = vi.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.collection === 'posts') return Promise.resolve({ id: 3, _status: 'published' })
      if (args.collection === 'comments') return Promise.resolve({ id: 10, post: 999, parentComment: null, status: 'approved' })
      return Promise.resolve(null)
    })

    await expect(
      createCommentResolver(
        undefined,
        {
          postId: '3',
          content: 'Reply',
          parentCommentId: '10',
        },
        makeContext({
          findByID,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Parent comment must belong to the same post.')
  })

  it('rejects missing chapterId and postId', async () => {
    await expect(
      createCommentResolver(
        undefined,
        { content: 'orphan' },
        makeContext({
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('A comment must target either a chapter or a post.')
  })

  it('rejects both chapterId and postId provided', async () => {
    await expect(
      createCommentResolver(
        undefined,
        { chapterId: '1', postId: '2', content: 'dual' },
        makeContext({
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('A comment must target either a chapter or a post, not both.')
  })

  it('creates a comment on a chapter target', async () => {
    const findByID = vi.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.collection === 'chapters') return Promise.resolve({ id: 7, hasPassword: false })
      return Promise.resolve(null)
    })
    const createMock = vi.fn().mockResolvedValue({
      id: 1,
      content: 'Chapter comment',
      status: 'pending',
      chapter: 7,
      author: { id: 99, fullName: 'Bob' },
    })

    const result = await createCommentResolver(
      undefined,
      { chapterId: '7', content: 'Chapter comment' },
      makeContext({
        findByID,
        createMock,
        user: { id: 99, role: 'user' },
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.content).toBe('Chapter comment')
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chapter: 7,
          post: null,
          status: 'pending',
        }),
      }),
    )
  })

  it('rejects create on password-locked chapter without proof', async () => {
    const findByID = vi.fn().mockImplementation((args: Record<string, unknown>) => {
      if (args.collection === 'chapters' && args.id === 7) return Promise.resolve({ id: 7, hasPassword: true })
      return Promise.resolve(null)
    })

    await expect(
      createCommentResolver(
        undefined,
        { chapterId: '7', content: 'Trying to comment' },
        {
          req: {
            payload: { findByID, create: vi.fn(), count: vi.fn().mockResolvedValue({ totalDocs: 0 }) },
            user: { id: 99, role: 'user' },
            headers: {},
          },
        },
      ),
    ).rejects.toThrow(
      'You do not have permission to view comments on this content.',
    )
  })

  it('rejects when per-target rate limit is exceeded', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const countMock = vi.fn().mockResolvedValue({ totalDocs: 5 })

    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: 'Hello' },
        makeContext({
          findByID,
          countMock,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Too many comments on this item.')
  })

  it('rejects when global rate limit is exceeded', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 3, _status: 'published' })
    const countMock = vi.fn()
      .mockResolvedValueOnce({ totalDocs: 0 })
      .mockResolvedValueOnce({ totalDocs: 20 })

    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: 'Hello' },
        makeContext({
          findByID,
          countMock,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Too many comments overall.')
  })
})

// ---------------------------------------------------------------------------
// updateCommentStatusResolver (GraphQL mutation)
// ---------------------------------------------------------------------------

describe('updateCommentStatusResolver', () => {
  const makeContext = ({
    user,
    findById,
    updateMock,
  }: {
    user?: unknown
    findById?: ReturnType<typeof vi.fn>
    updateMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findById ?? vi.fn().mockResolvedValue(null),
        update: updateMock ?? vi.fn().mockResolvedValue({}),
      },
      user: user ?? null,
    },
  })

  it('approves a comment as admin and sets moderation metadata', async () => {
    const existing = {
      id: 1,
      content: 'Test',
      status: 'pending',
      author: { id: 99, fullName: 'Bob' },
    }
    const updated = { ...existing, status: 'approved', moderatedAt: '2026-01-01T00:00:00Z', moderatedBy: 1 }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue(updated)

    const result = await updateCommentStatusResolver(
      undefined,
      { commentId: '1', status: 'approved' },
      makeContext({
        findById,
        updateMock,
        user: { id: 1, role: 'admin' },
      }),
    )

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'comments',
        id: 1,
        data: expect.objectContaining({
          status: 'approved',
          moderatedAt: expect.any(String),
        }),
        depth: PUBLIC_COMMENT_DEPTH,
        overrideAccess: true,
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.status).toBe('approved')
  })

  it('rejects a comment as admin', async () => {
    const existing = {
      id: 1,
      content: 'Spam',
      status: 'pending',
      author: { id: 99, fullName: 'Bob' },
    }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue({ ...existing, status: 'rejected' })

    const result = await updateCommentStatusResolver(
      undefined,
      { commentId: '1', status: 'rejected' },
      makeContext({
        findById,
        updateMock,
        user: { id: 1, role: 'admin' },
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.status).toBe('rejected')
  })

  it('rejects non-admin users', async () => {
    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '1', status: 'approved' },
        makeContext({ user: { id: 99, role: 'user' } }),
      ),
    ).rejects.toThrow('Only admins can moderate comments.')
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '1', status: 'approved' },
        makeContext({ user: null }),
      ),
    ).rejects.toThrow('Only admins can moderate comments.')
  })

  it('rejects invalid status values', async () => {
    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '1', status: 'invalid' },
        makeContext({ user: { id: 1, role: 'admin' } }),
      ),
    ).rejects.toThrow('Invalid moderation status.')
  })

  it('rejects pending status (not allowed for moderation)', async () => {
    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '1', status: 'pending' },
        makeContext({ user: { id: 1, role: 'admin' } }),
      ),
    ).rejects.toThrow('Invalid moderation status.')
  })

  it('throws when comment is not found', async () => {
    const findById = vi.fn().mockResolvedValue(null)

    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '999', status: 'approved' },
        makeContext({
          findById,
          user: { id: 1, role: 'admin' },
        }),
      ),
    ).rejects.toThrow('Comment not found.')
  })

  it('rejects moderation of deleted comments', async () => {
    const existing = {
      id: 1,
      content: 'Test',
      status: 'pending',
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      updateCommentStatusResolver(
        undefined,
        { commentId: '1', status: 'approved' },
        makeContext({
          findById,
          user: { id: 1, role: 'admin' },
        }),
      ),
    ).rejects.toThrow('Cannot moderate a deleted comment.')
  })
})

// ---------------------------------------------------------------------------
// updateCommentResolver (GraphQL mutation)
// ---------------------------------------------------------------------------

describe('updateCommentResolver', () => {
  const makeContext = ({
    user,
    findById,
    updateMock,
  }: {
    user?: unknown
    findById?: ReturnType<typeof vi.fn>
    updateMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findById ?? vi.fn().mockResolvedValue(null),
        update: updateMock ?? vi.fn().mockResolvedValue({}),
      },
      user: user ?? null,
      headers: {},
    },
  })

  it('allows author edit within 5 hours', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'pending',
      createdAt: recent,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue({ ...existing, content: 'Updated' })

    const result = await updateCommentResolver(
      undefined,
      { commentId: '1', content: 'Updated' },
      makeContext({
        findById,
        updateMock,
        user: { id: 99, role: 'user' },
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.content).toBe('Updated')
  })

  it('keeps pending as pending', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'pending',
      createdAt: recent,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue({ ...existing, content: 'Updated' })

    await updateCommentResolver(
      undefined,
      { commentId: '1', content: 'Updated' },
      makeContext({
        findById,
        updateMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
        }),
      }),
    )
  })

  it('changes approved to pending', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'approved',
      createdAt: recent,
      moderatedAt: '2026-01-01T00:00:00Z',
      moderatedBy: 1,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue({ ...existing, content: 'Updated', status: 'pending' })

    await updateCommentResolver(
      undefined,
      { commentId: '1', content: 'Updated' },
      makeContext({
        findById,
        updateMock,
        user: { id: 99, role: 'user' },
      }),
    )

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          moderatedAt: null,
          moderatedBy: null,
        }),
      }),
    )
  })

  it('rejects non-owner', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'pending',
      createdAt: recent,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      updateCommentResolver(
        undefined,
        { commentId: '1', content: 'Updated' },
        makeContext({
          findById,
          user: { id: 88, role: 'user' },
        }),
      ),
    ).rejects.toThrow('You do not have permission to edit this comment.')
  })

  it('rejects deleted comment', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'pending',
      createdAt: recent,
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      updateCommentResolver(
        undefined,
        { commentId: '1', content: 'Updated' },
        makeContext({
          findById,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('This comment has been deleted.')
  })

  it('rejects expired edit window', async () => {
    const old = new Date(Date.now() - COMMENT_EDIT_WINDOW_MS - 1_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'pending',
      createdAt: old,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      updateCommentResolver(
        undefined,
        { commentId: '1', content: 'Updated' },
        makeContext({
          findById,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('The edit window for this comment has expired.')
  })

  it('rejects rejected comments even when they are still within the time window', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const existing = {
      id: 1,
      content: 'Original',
      status: 'rejected',
      createdAt: recent,
      author: { id: 99, fullName: 'Bob' },
      chapter: 7,
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      updateCommentResolver(
        undefined,
        { commentId: '1', content: 'Updated' },
        makeContext({
          findById,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('This comment cannot be edited.')
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      updateCommentResolver(
        undefined,
        { commentId: '1', content: 'Updated' },
        makeContext({ user: null }),
      ),
    ).rejects.toThrow('You must be signed in to comment.')
  })
})

// ---------------------------------------------------------------------------
// deleteCommentResolver (GraphQL mutation)
// ---------------------------------------------------------------------------

describe('deleteCommentResolver', () => {
  const makeContext = ({
    user,
    findById,
    updateMock,
  }: {
    user?: unknown
    findById?: ReturnType<typeof vi.fn>
    updateMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findById ?? vi.fn().mockResolvedValue(null),
        update: updateMock ?? vi.fn().mockResolvedValue({}),
      },
      user: user ?? null,
    },
  })

  it('soft-deletes by setting deletedAt and deletedBy', async () => {
    const existing = {
      id: 1,
      content: 'Test',
      status: 'approved',
      author: { id: 99, fullName: 'Bob' },
    }
    const findById = vi.fn().mockResolvedValue(existing)
    const updateMock = vi.fn().mockResolvedValue({
      ...existing,
      deletedAt: '2026-01-01T00:00:00Z',
      deletedBy: 99,
    })

    const result = await deleteCommentResolver(
      undefined,
      { commentId: '1' },
      makeContext({
        findById,
        updateMock,
        user: { id: 99, role: 'user' },
      }),
    )

    const comment = result.comment as Record<string, unknown>
    expect(comment.isDeleted).toBe(true)
    expect(comment.content).toBe('')
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'comments',
        id: 1,
        data: expect.objectContaining({
          deletedAt: expect.any(String),
          deletedBy: 99,
        }),
        depth: PUBLIC_COMMENT_DEPTH,
        overrideAccess: true,
      }),
    )
  })

  it('rejects non-owner', async () => {
    const existing = {
      id: 1,
      content: 'Test',
      status: 'approved',
      author: { id: 99, fullName: 'Bob' },
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      deleteCommentResolver(
        undefined,
        { commentId: '1' },
        makeContext({
          findById,
          user: { id: 88, role: 'user' },
        }),
      ),
    ).rejects.toThrow('You do not have permission to delete this comment.')
  })

  it('rejects double-delete', async () => {
    const existing = {
      id: 1,
      content: 'Test',
      status: 'approved',
      deletedAt: '2026-01-01T00:00:00Z',
      author: { id: 99, fullName: 'Bob' },
    }
    const findById = vi.fn().mockResolvedValue(existing)

    await expect(
      deleteCommentResolver(
        undefined,
        { commentId: '1' },
        makeContext({
          findById,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('This comment has been deleted.')
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      deleteCommentResolver(
        undefined,
        { commentId: '1' },
        makeContext({ user: null }),
      ),
    ).rejects.toThrow('You must be signed in to comment.')
  })
})
