import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Comments } from '@/collections/Comments'
import { commentsResolver } from '@/graphql/queries/Comments/resolver'
import { createCommentResolver } from '@/graphql/mutations/CreateComment/resolver'
import { updateCommentStatusResolver } from '@/graphql/mutations/UpdateCommentStatus/resolver'
import {
  assertCommentCreateRole,
  assertCommentTargetReadable,
  assertExclusiveCommentTarget,
  assertParentCommentIsValid,
  commentsBeforeChangeHook,
  commentsBeforeValidateHook,
  mapCommentDocToPublicComment,
  normalizeCommentContent,
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
    expect(Comments.indexes!.length).toBeGreaterThanOrEqual(5)
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
    const longContent = 'a'.repeat(2001)
    expect(() => normalizeCommentContent(longContent)).toThrow('Comment content must not exceed 2000 characters.')
  })

  it('allows content at exactly max length', () => {
    const maxContent = 'a'.repeat(2000)
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
        originalDoc: { chapter: 7, author: 99, status: 'approved' },
        req: {} as never,
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
    const findMock = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 })

    const result = await commentsResolver(
      undefined,
      { postId: '3' },
      makeContext({
        findByID,
        findMock,
        user: { id: 1, role: 'admin' },
      }),
    )

    expect(result.viewerCanComment).toBe(false)
    expect(findMock).toHaveBeenCalledTimes(1) // Only approved query
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
  }: {
    user?: unknown
    findByID?: ReturnType<typeof vi.fn>
    createMock?: ReturnType<typeof vi.fn>
  } = {}) => ({
    req: {
      payload: {
        findByID: findByID ?? vi.fn().mockResolvedValue(null),
        create: createMock ?? vi.fn().mockResolvedValue({}),
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

  it('rejects admin create via public flow', async () => {
    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: 'Hello' },
        makeContext({ user: { id: 1, role: 'admin' } }),
      ),
    ).rejects.toThrow('You do not have permission to comment from this interface.')
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
    const longContent = 'a'.repeat(2001)

    await expect(
      createCommentResolver(
        undefined,
        { postId: '3', content: longContent },
        makeContext({
          findByID,
          user: { id: 99, role: 'user' },
        }),
      ),
    ).rejects.toThrow('Comment content must not exceed 2000 characters.')
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
            payload: { findByID, create: vi.fn() },
            user: { id: 99, role: 'user' },
            headers: {},
          },
        },
      ),
    ).rejects.toThrow(
      'You do not have permission to view comments on this content.',
    )
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
          moderatedBy: 1,
        }),
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
})
