import type {
  Access,
  CollectionAfterDeleteHook,
  CollectionAfterOperationHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  FieldAccess,
  PayloadRequest,
} from 'payload'

import {
  BetterAuthRequestError,
  BetterAuthUserExistsError,
  signUpBetterAuthUser,
} from '@/lib/betterAuth/api'
import { extractTokenFromHeaders } from '@/lib/betterAuth/tokens'
import { drainDeferredGrantsForUser } from '@/utils/deferredGrants'
import { checkPermissionBatch } from '@/utils/grantMirror'

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

export const adminAccess: Access = ({ req }) => {
  return isAdminUser(req.user)
}

export const adminFieldAccess: FieldAccess = ({ req }) => {
  return isAdminUser(req.user)
}

type UserHookData = {
  betterAuthUserId?: unknown
  email?: unknown
  fullName?: unknown
  role?: unknown
}

type UserHookResult = {
  id?: string | number | null
  betterAuthUserId?: string | null
}

type MirrorDoc = {
  id?: string | number
}

export const booksAfterDeleteGrantMirrorHook: CollectionAfterDeleteHook = async ({ id, req }) => {
  const bookId = String(id)
  const now = new Date().toISOString()

  while (true) {
    // Always re-fetch page 1: as rows are revoked they fall out of the
    // `not_equals: 'revoked'` filter, so offset-based pagination would
    // skip rows in the middle of a large batch.
    const batch = await req.payload
      .find({
        collection: 'grant-mirror',
        where: {
          and: [
            { entityType: { equals: 'book' } },
            { entityId: { equals: bookId } },
            { syncStatus: { not_equals: 'revoked' } },
          ],
        },
        limit: 100,
        page: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!batch || batch.docs.length === 0) {
      break
    }

    await Promise.all(
      batch.docs.map(async (doc) => {
        const mirrorDoc = doc as MirrorDoc

        if (mirrorDoc.id == null) {
          return
        }

        await req.payload
          .update({
            collection: 'grant-mirror',
            id: mirrorDoc.id,
            data: { syncStatus: 'revoked', syncedAt: now },
            overrideAccess: true,
          })
          .catch(() => {
            // Best-effort; reconciliation will catch stragglers.
          })
      }),
    )
  }
}

export const usersBeforeValidateHook: CollectionBeforeValidateHook = ({ data, originalDoc, operation, req }) => {
  if (isAdminUser(req.user)) {
    return data
  }

  const workingData = data ? { ...data } : {}
  const originalRole = (originalDoc as { role?: unknown } | undefined)?.role

  if (operation === 'create') {
    return {
      ...workingData,
      role: 'user',
    }
  }

  return {
    ...workingData,
    role: originalRole ?? 'user',
  }
}

export const usersBeforeChangeHook: CollectionBeforeChangeHook = async ({ data, operation, originalDoc }) => {
  if (!data) {
    return data
  }

  const workingData = { ...(data as UserHookData) }

  if (operation === 'update') {
    const existingIdentifier = toNullableString(
      (originalDoc as { betterAuthUserId?: unknown } | undefined)?.betterAuthUserId,
    )

    if (existingIdentifier != null) {
      return {
        ...workingData,
        betterAuthUserId: existingIdentifier,
      }
    }

    const incomingIdentifier = toNullableString(workingData.betterAuthUserId)

    if (incomingIdentifier != null) {
      return {
        ...workingData,
        betterAuthUserId: incomingIdentifier,
      }
    }

    return {
      ...workingData,
      betterAuthUserId: null,
    }
  }

  if (operation !== 'create') {
    return data
  }

  const currentIdentifier = toNullableString(workingData.betterAuthUserId)

  if (currentIdentifier != null) {
    return {
      ...workingData,
      betterAuthUserId: currentIdentifier,
    }
  }

  const email = toNullableString(workingData.email)

  if (!email) {
    throw new Error('Email is required to provision Better Auth users.')
  }

  const fullName = toNullableString(workingData.fullName)

  try {
    const signUpResult = await signUpBetterAuthUser({
      email,
      name: fullName ?? undefined,
    })

    return {
      ...workingData,
      betterAuthUserId: signUpResult.id,
      email: signUpResult.email ?? email,
      fullName: fullName ?? signUpResult.name ?? email,
    }
  } catch (error) {
    if (error instanceof BetterAuthUserExistsError) {
      throw new Error(
        'A Better Auth user with this email already exists. Link the record by providing the Better Auth user ID.',
      )
    }

    if (error instanceof BetterAuthRequestError) {
      throw error
    }

    throw new Error(
      error instanceof Error ? error.message : 'Unknown error occurred while provisioning Better Auth user.',
    )
  }
}

export const usersAfterOperationHook: CollectionAfterOperationHook = async ({ operation, result, req }) => {
  if (operation !== 'create') {
    return result
  }

  const user = result as UserHookResult | null

  if (!user?.id || !user.betterAuthUserId) {
    return result
  }

  // Fire-and-forget drain — do not block user creation.
  void drainDeferredGrantsForUser(req.payload, user.betterAuthUserId, user.id).catch((error) => {
    console.error('[users] Failed to drain deferred grants for user:', user.betterAuthUserId, error)
  })

  return result
}

type PrivateBookId = string | number

const accessiblePrivateBookIdsCache = new WeakMap<PayloadRequest, Promise<GrantedPrivateBookIds>>()

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

const buildAutherPermissionContext = ({
  entityIds,
  entityType,
  req,
  userId,
}: {
  entityIds: string[]
  entityType: string
  req: PayloadRequest
  userId: string | number
}): Record<string, unknown> => {
  const requestUser = req.user as {
    betterAuthUserId?: unknown
    email?: unknown
    role?: unknown
  } | null | undefined
  const betterAuthUserId = toNullableString(requestUser?.betterAuthUserId)
  const email = toNullableString(requestUser?.email)
  const role = toNullableString(requestUser?.role)
  const userContext: Record<string, unknown> = {
    payloadUserId: String(userId),
  }

  if (betterAuthUserId) {
    userContext.betterAuthUserId = betterAuthUserId
  }

  if (email) {
    userContext.payloadEmail = email
  }

  if (role) {
    userContext.payloadRole = role
  }

  // When a purchase/subscription collection is added, extend this context here so
  // Auther Lua conditions can evaluate entitlement-specific fields in batch checks.
  return {
    user: userContext,
    resource: {
      entityType,
      payloadEntityIds: entityIds,
    },
  }
}

type GrantedPrivateBookIds = {
  hasWildcardGrant: boolean
  privateBookIds: PrivateBookId[]
}

/**
 * Mirror-based read path: query the GrantMirror collection for active book grants.
 *
 * Returns a promise (cached per request) that resolves to the list of private book IDs
 * the user can access. Zero Auther calls for unconditional grants; at most one Auther
 * batch call for requiresLiveCheck rows.
 *
 * When sessionToken is null, only unconditional grants are returned (fail-closed for
 * conditioned grants that require a live Auther check).
 */
const getGrantedPrivateBookIds = async (
  req: PayloadRequest,
  sessionToken: string | null,
  userId: string | number,
): Promise<GrantedPrivateBookIds> => {
  const cached = accessiblePrivateBookIdsCache.get(req)

  if (cached) {
    return cached
  }

  const promise = (async (): Promise<GrantedPrivateBookIds> => {
    // Paginate all active mirror rows for this user to avoid the hard 1000-row cap
    type MirrorDoc = { entityId?: string; requiresLiveCheck?: boolean }

    const allDocs: MirrorDoc[] = []
    let page = 1

    while (true) {
      const batch = await req.payload
        .find({
          collection: 'grant-mirror',
          where: {
            and: [
              { payloadUserId: { equals: userId } },
              { entityType: { equals: 'book' } },
              { syncStatus: { equals: 'active' } },
            ],
          },
          limit: 500,
          page,
          depth: 0,
          overrideAccess: true,
        })
        .catch((err: unknown) => {
          console.error('[access] Mirror query failed:', err)
          return null
        })

      if (!batch) {
        // DB error — fail-closed: return empty (only public books will be shown)
        return { hasWildcardGrant: false, privateBookIds: [] }
      }

      allDocs.push(...(batch.docs as MirrorDoc[]))

      if (!batch.hasNextPage) {
        break
      }

      page++
    }

    const unconditionalIds: PrivateBookId[] = []
    const conditionalIds: string[] = []
    let hasUnconditionalWildcardGrant = false

    for (const d of allDocs) {
      if (!d.entityId) {
        continue
      }

      if (d.entityId === '*') {
        if (d.requiresLiveCheck) {
          conditionalIds.push(d.entityId)
        } else {
          hasUnconditionalWildcardGrant = true
        }

        continue
      }

      if (d.requiresLiveCheck) {
        // Auther API expects string IDs
        conditionalIds.push(d.entityId)
      } else {
        // Normalize to a number for the Payload SQL `id IN (...)` filter
        const normalized = normalizeEntityId(d.entityId)

        if (normalized != null) {
          unconditionalIds.push(normalized)
        }
      }
    }

    if (hasUnconditionalWildcardGrant) {
      return {
        hasWildcardGrant: true,
        privateBookIds: [],
      }
    }

    // For requiresLiveCheck rows, call Auther check-permission batch (fail-closed).
    // Skip entirely when no session token is present — conditioned grants are denied (§10.4).
    let approvedConditionalIds: string[] = []

    if (conditionalIds.length > 0 && sessionToken) {
      approvedConditionalIds = await checkPermissionBatch({
        sessionToken,
        entityType: 'book',
        entityIds: conditionalIds,
        context: buildAutherPermissionContext({
          entityIds: conditionalIds,
          entityType: 'book',
          req,
          userId,
        }),
      })
    }

    const hasWildcardGrant = approvedConditionalIds.includes('*')

    return {
      hasWildcardGrant,
      privateBookIds: [...unconditionalIds, ...approvedConditionalIds.filter((id) => id !== '*')],
    }
  })().catch((err: unknown) => {
    console.error('[access] getGrantedPrivateBookIds failed:', err)
    return { hasWildcardGrant: false, privateBookIds: [] }
  })

  accessiblePrivateBookIdsCache.set(req, promise)

  return promise
}

const resolveBooksReadAccess = async ({
  req,
  sessionToken,
  userId,
}: {
  req: PayloadRequest
  sessionToken: string | null
  userId: string | number
}) => {
  const clauses: Array<Record<string, unknown>> = [publicBooksQuery, ownBooksQuery(userId)]
  const { hasWildcardGrant, privateBookIds } = await getGrantedPrivateBookIds(req, sessionToken, userId)

  if (hasWildcardGrant) {
    return true as never
  }

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
  sessionToken: string | null
  userId: string | number
}) => {
  const clauses: Array<Record<string, unknown>> = [publicChaptersQuery, ownChaptersQuery(userId)]
  const { hasWildcardGrant, privateBookIds } = await getGrantedPrivateBookIds(req, sessionToken, userId)

  if (hasWildcardGrant) {
    return true as never
  }

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

  // Pass token (may be null). getGrantedPrivateBookIds handles null gracefully:
  // unconditional mirror grants are still returned; conditioned grants require a token.
  const sessionToken = getSessionTokenFromRequest(req)

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
