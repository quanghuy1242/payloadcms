import type { Access, FieldAccess, PayloadRequest } from 'payload'

import { checkAutherBookAccess } from '@/lib/betterAuth/auther'
import { extractTokenFromHeaders } from '@/lib/betterAuth/tokens'

import { normalizeEntityId } from './identifiers'
import { toNullableString } from './strings'

export { normalizeEntityId }

export const USER_ROLES = ['admin', 'user'] as const

export type UserRole = (typeof USER_ROLES)[number]

type AccessUser = {
  id?: string | number | null
  role?: UserRole | null
}

export const getUserId = (user?: AccessUser | null): string | number | null => {
  if (!user) {
    return null
  }

  return normalizeEntityId(user.id)
}

export const isAdminUser = (user?: AccessUser | null): boolean => {
  return user?.role === 'admin'
}

export const publicReadAccess: Access = () => true

export const authenticatedAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  return getUserId(req.user) != null
}

export const authenticatedFieldAccess: FieldAccess = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  return getUserId(req.user) != null
}

type BookReadRecord = {
  createdBy?: unknown
  id?: unknown
}

type ChapterReadRecord = {
  book?: unknown
  createdBy?: unknown
  id?: unknown
}

type PrivateBookId = string | number

const accessiblePrivateBookIdsCache = new WeakMap<PayloadRequest, Promise<PrivateBookId[]>>()

const getSessionTokenFromRequest = (req: PayloadRequest): string | null => {
  const headers = (req as { headers?: Headers | undefined }).headers

  if (!headers || typeof headers.get !== 'function') {
    return null
  }

  return extractTokenFromHeaders(headers)
}

const publicBooksQuery = {
  and: [
    {
      visibility: {
        equals: 'public',
      },
    },
    {
      _status: {
        equals: 'published',
      },
    },
  ],
} as const

const publicChaptersQuery = {
  and: [
    {
      'book.visibility': {
        equals: 'public',
      },
    },
    {
      _status: {
        equals: 'published',
      },
    },
  ],
} as const

const ownBooksQuery = (userId: string | number) => {
  return {
    createdBy: {
      equals: userId,
    },
  }
}

const ownChaptersQuery = (userId: string | number) => {
  return {
    createdBy: {
      equals: userId,
    },
  }
}

const buildPrivateBooksQuery = (privateBookIds: PrivateBookId[]) => {
  if (privateBookIds.length === 0) {
    return null
  }

  return {
    and: [
      {
        id: {
          in: privateBookIds,
        },
      },
      {
        _status: {
          equals: 'published',
        },
      },
    ],
  }
}

const buildPrivateChaptersQuery = (privateBookIds: PrivateBookId[]) => {
  if (privateBookIds.length === 0) {
    return null
  }

  return {
    and: [
      {
        book: {
          in: privateBookIds,
        },
      },
      {
        _status: {
          equals: 'published',
        },
      },
    ],
  }
}

const fetchPrivateBooksForRequest = async (
  req: PayloadRequest,
): Promise<Array<BookReadRecord>> => {
  const privateBooks: Array<BookReadRecord> = []
  const limit = 100
  let page = 1

  while (true) {
    const response = await req.payload.find({
      collection: 'books',
      depth: 0,
      limit,
      page,
      overrideAccess: true,
      req,
      select: {
        createdBy: true,
        id: true,
      },
      where: {
        and: [
          {
            visibility: {
              equals: 'private',
            },
          },
          {
            _status: {
              equals: 'published',
            },
          },
        ],
      } as never,
    })

    privateBooks.push(...(response.docs as Array<BookReadRecord>))

    if (!response.hasNextPage) {
      break
    }

    page += 1
  }

  return privateBooks
}

const getGrantedPrivateBookIds = async (
  req: PayloadRequest,
  sessionToken: string,
  userId: string | number,
): Promise<PrivateBookId[]> => {
  const cached = accessiblePrivateBookIdsCache.get(req)

  if (cached) {
    return cached
  }

  const promise = (async () => {
    const privateBooks = await fetchPrivateBooksForRequest(req)
    const candidateBooks = privateBooks.filter((book) => {
      const ownerId = normalizeEntityId(book.createdBy)

      if (ownerId == null) {
        return true
      }

      return String(ownerId) !== String(userId)
    })

    const grants = await Promise.all(
      candidateBooks.map(async (book) => {
        const bookId = normalizeEntityId(book.id)

        if (bookId == null) {
          return null
        }

        const allowed = await checkAutherBookAccess({
          bookId,
          sessionToken,
        }).catch(() => false)

        return allowed ? bookId : null
      }),
    )

    return grants.filter((bookId): bookId is PrivateBookId => bookId != null)
  })().catch(() => [] as PrivateBookId[])

  accessiblePrivateBookIdsCache.set(req, promise)

  return promise
}

const resolveBooksReadAccess = async ({
  req,
  sessionToken,
  userId,
}: {
  req: PayloadRequest
  sessionToken: string
  userId: string | number
}) => {
  const clauses: Array<Record<string, unknown>> = [publicBooksQuery, ownBooksQuery(userId)]
  const privateBookIds = await getGrantedPrivateBookIds(req, sessionToken, userId)

  const privateBooksQuery = buildPrivateBooksQuery(privateBookIds)

  if (privateBooksQuery) {
    clauses.push(privateBooksQuery as Record<string, unknown>)
  }

  return {
    or: clauses,
  } as never
}

const resolveChaptersReadAccess = async ({
  req,
  sessionToken,
  userId,
}: {
  req: PayloadRequest
  sessionToken: string
  userId: string | number
}) => {
  const clauses: Array<Record<string, unknown>> = [publicChaptersQuery, ownChaptersQuery(userId)]
  const privateBookIds = await getGrantedPrivateBookIds(req, sessionToken, userId)

  const privateChaptersQuery = buildPrivateChaptersQuery(privateBookIds)

  if (privateChaptersQuery) {
    clauses.push(privateChaptersQuery as Record<string, unknown>)
  }

  return {
    or: clauses,
  } as never
}

export const publicBooksReadAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  if (!req.user) {
    return {
      and: [
        {
          visibility: {
            equals: 'public',
          },
        },
        {
          _status: {
            equals: 'published',
          },
        },
      ],
    } as never
  }

  const userId = getUserId(req.user)

  if (userId == null) {
    return false
  }

  const sessionToken = getSessionTokenFromRequest(req)

  if (!sessionToken) {
    return {
      or: [publicBooksQuery, ownBooksQuery(userId)],
    } as never
  }

  return resolveBooksReadAccess({
    req,
    sessionToken,
    userId,
  })
}

export const chaptersReadAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  if (!req.user) {
    return {
      and: [
        {
          'book.visibility': {
            equals: 'public',
          },
        },
        {
          _status: {
            equals: 'published',
          },
        },
      ],
    } as never
  }

  const userId = getUserId(req.user)

  if (userId == null) {
    return false
  }

  const sessionToken = getSessionTokenFromRequest(req)

  if (!sessionToken) {
    return {
      or: [publicChaptersQuery, ownChaptersQuery(userId)],
    } as never
  }

  return resolveChaptersReadAccess({
    req,
    sessionToken,
    userId,
  })
}

const resolveTargetId = (doc: unknown, id: unknown): string | number | null => {
  const docId = doc ? getUserId(doc as AccessUser) : null

  if (docId != null) {
    return docId
  }

  if (id == null) {
    return null
  }

  return getUserId({ id } as AccessUser)
}

const isAdminOrSelf = (user: AccessUser | null | undefined, doc: unknown, id: unknown): boolean => {
  if (isAdminUser(user)) {
    return true
  }

  const userId = getUserId(user)

  if (userId == null) {
    return false
  }

  const targetId = resolveTargetId(doc, id)

  if (targetId == null) {
    return false
  }

  return String(targetId) === String(userId)
}

export const adminOrSelfAccess: Access = (args) => {
  const docValue = 'doc' in args ? (args as { doc?: unknown }).doc : undefined
  const idValue = 'id' in args ? (args as { id?: unknown }).id : undefined

  return isAdminOrSelf(args.req.user as AccessUser | null | undefined, docValue, idValue)
}

export const adminOrSelfFieldAccess: FieldAccess = (args) => {
  const docValue = 'doc' in args ? (args as { doc?: unknown }).doc : undefined
  const idValue = 'id' in args ? (args as { id?: unknown }).id : undefined

  return isAdminOrSelf(args.req.user as AccessUser | null | undefined, docValue, idValue)
}

export const ownerAccess = (field: string): Access => {
  return ({ req }) => {
    if (isAdminUser(req.user)) {
      return true
    }

    const userId = getUserId(req.user)

    if (userId == null) {
      return false
    }

    return {
      [field]: {
        equals: userId,
      },
    }
  }
}

// @ts-ignore
export const postsReadAccess: Access = ({ req }) => {
  // No authentication = no access
  if (!req.user) {
    return false
  }

  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  // Must be authenticated
  if (userId == null) {
    return false
  }

  // Authenticated users can read published posts OR their own drafts
  return {
    or: [
      {
        author: {
          equals: userId,
        },
      },
      {
        _status: {
          equals: 'published',
        },
      },
    ],
  }
}

// Allow authenticated users to read media tied to published posts or their own media
export const publishedMediaReadAccess: Access = async ({ req, data, id }) => {
  // No authentication = no access
  if (!req.user) {
    return false
  }

  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  // Must be authenticated
  if (userId == null) {
    return false
  }

  if (data == null && id == null) {
    return true
  }

  const candidateId = normalizeEntityId(data?.id ?? id)

  const mediaRecord =
    data ??
    (candidateId != null
      ? await req.payload
          .findByID({
            collection: 'media',
            id: candidateId,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
      : null)

  if (!mediaRecord) {
    return {
      owner: {
        equals: userId,
      },
    }
  }

  const mediaId = normalizeEntityId(mediaRecord.id ?? candidateId)
  const ownerId = normalizeEntityId(mediaRecord.owner)

  if (ownerId != null && String(ownerId) === String(userId)) {
    return true
  }

  if (mediaId == null) {
    return true
  }

  const mediaIdString = toNullableString(mediaId)
  const mediaIdVariants = [
    mediaId,
    ...(mediaIdString && mediaIdString !== String(mediaId) ? [mediaIdString] : []),
  ]

  const postReferenceConditions = [
    {
      coverImage: {
        in: mediaIdVariants,
      },
    },
    {
      'meta.image': {
        in: mediaIdVariants,
      },
    },
    mediaIdString
      ? {
          content: {
            contains: `"id":${mediaIdString}`,
          },
        }
      : null,
    mediaIdString
      ? {
          content: {
            contains: `"id":"${mediaIdString}"`,
          },
        }
      : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  const isReferencedByPosts = await req.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: { or: postReferenceConditions } as never,
  })

  if (isReferencedByPosts.docs.length > 0) {
    return true
  }

  const isReferencedByCategories = await req.payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: {
      image: {
        in: mediaIdVariants,
      },
    },
  })

  if (isReferencedByCategories.docs.length > 0) {
    return true
  }

  // Check if media is used as a user avatar
  const isReferencedByUsers = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: {
      avatar: {
        in: mediaIdVariants,
      },
    },
  })

  if (isReferencedByUsers.docs.length > 0) {
    return true
  }

  // Check if media is used in homepage banner
  try {
    const homepage = await req.payload.findGlobal({
      slug: 'homepage',
      depth: 0,
      overrideAccess: false,
    })

    if (homepage?.imageBanner) {
      const bannerMediaId = normalizeEntityId(homepage.imageBanner)
      if (bannerMediaId != null && mediaIdVariants.includes(bannerMediaId)) {
        return true
      }
    }
  } catch (error) {
    // Homepage might not exist or user doesn't have access, continue
  }

  return {
    owner: {
      equals: userId,
    },
  }
}

/**
 * Global access control that allows admins or users whose email contains a specific string.
 * Useful for restricting global document updates to specific users.
 */
export const adminOrEmailContains = (emailSubstring: string): Access => {
  return ({ req }) => {
    if (isAdminUser(req.user)) {
      return true
    }

    const email = req.user?.email
    if (email && typeof email === 'string' && email.includes(emailSubstring)) {
      return true
    }

    return false
  }
}
