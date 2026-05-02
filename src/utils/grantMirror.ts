/**
 * Grant mirror utilities — shared logic for syncing Auther grant tuples
 * into the local GrantMirror collection.
 */
import type { Payload } from 'payload'

import { getAutherBaseUrl, getAutherApiKey } from '@/lib/env'
import { getPayloadClientId } from '@/lib/betterAuth/env'
import { requestJSON } from '@/utils/http'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrantMirrorRow = {
  autherTupleId: string
  payloadUserId: string | number
  entityType: 'book' | 'chapter' | 'comment'
  entityId: string
  relation: string
  sourceSubjectType: 'user' | 'group'
  requiresLiveCheck: boolean
  syncStatus: 'active' | 'revoked' | 'pending'
  syncedAt: string
}

export const MIRRORED_ENTITY_TYPES = ['book', 'chapter', 'comment'] as const
export type MirrorableEntityType = (typeof MIRRORED_ENTITY_TYPES)[number]

type GroupMembersResponse = {
  members?: Array<{ userId: string }>
}

export type AutherClientGrantRecord = {
  tupleId: string
  relation: string
  subjectType: 'user' | 'group'
  subjectId: string
  userId: string | null
  userEmail: string | null
}

export type AutherTupleMetadata = {
  relation: string
  sourceSubjectType: 'user' | 'group'
  subjectId: string
}

type AutherClientGrantsResponse = {
  grants?: AutherClientGrantRecord[]
  nextCursor?: string | null
  hasMore?: boolean
}

// ---------------------------------------------------------------------------
// Auther API helpers
// ---------------------------------------------------------------------------

/**
 * Calls Auther's members API for a group and returns the list of
 * fully-expanded member user IDs (Auther IDs, not Payload IDs).
 */
export const fetchAutherGroupMembers = async (groupId: string): Promise<string[]> => {
  const url = new URL(
    `/api/internal/groups/${encodeURIComponent(groupId)}/members`,
    getAutherBaseUrl(),
  )

  const response = await requestJSON<GroupMembersResponse>(url.toString(), {
    headers: { 'x-api-key': getAutherApiKey() },
  })

  return (response.members ?? []).map((m) => m.userId).filter(Boolean)
}

type ListObjectsItem = {
  entityId: string
  abacRequired: boolean
  tupleId: string
  tupleIds: string[]
  tuples: Array<{
    tupleId: string
    relation: string
    sourceSubjectType?: 'user' | 'group'
    subjectId?: string
    subjectRelation?: string | null
  }>
}

type ListObjectsResponse = {
  items?: Array<{
    entityId?: string
    abacRequired?: boolean
    abac_required?: boolean
    tupleId?: string
    tupleIds?: string[]
    tuples?: Array<{
      tupleId?: string
      relation?: string
      subjectType?: 'user' | 'group'
      subjectId?: string
      subjectRelation?: string | null
    }>
  }>
}

export type AutherClientGrantsPage = {
  grants: AutherClientGrantRecord[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Calls Auther's client-scoped grants endpoint.
 * When entityTypeName/entityId are omitted, Auther returns a paginated full grant sweep for the client.
 */
export const listAutherClientGrants = async ({
  cursor,
  entityId,
  entityTypeName,
  limit,
}: {
  cursor?: string
  entityId?: string
  entityTypeName?: string
  limit?: number
} = {}): Promise<AutherClientGrantsPage> => {
  const url = new URL(`/api/internal/clients/${getPayloadClientId()}/grants`, getAutherBaseUrl())

  if (entityTypeName) {
    url.searchParams.set('entityTypeName', entityTypeName)
  }

  if (entityId) {
    url.searchParams.set('entityId', entityId)
  }

  if (cursor) {
    url.searchParams.set('cursor', cursor)
  }

  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    url.searchParams.set('limit', String(limit))
  }

  const response = await requestJSON<AutherClientGrantsResponse>(url.toString(), {
    headers: { 'x-api-key': getAutherApiKey() },
  })

  return {
    grants: (response.grants ?? []).filter(
      (grant): grant is AutherClientGrantRecord =>
        grant != null &&
        typeof grant.tupleId === 'string' &&
        typeof grant.relation === 'string' &&
        (grant.subjectType === 'user' || grant.subjectType === 'group') &&
        typeof grant.subjectId === 'string',
    ),
    hasMore: response.hasMore === true,
    nextCursor: typeof response.nextCursor === 'string' && response.nextCursor.length > 0
      ? response.nextCursor
      : null,
  }
}

export const buildAutherTupleMetadataMap = (
  grants: AutherClientGrantRecord[],
): Map<string, AutherTupleMetadata> => {
  const tupleMetadata = new Map<string, AutherTupleMetadata>()

  for (const grant of grants) {
    if (!grant.tupleId) {
      continue
    }

    tupleMetadata.set(grant.tupleId, {
      relation: grant.relation,
      sourceSubjectType: grant.subjectType,
      subjectId: grant.subjectId,
    })
  }

  return tupleMetadata
}

/**
 * Calls Auther's ListObjects API for a given user and entity type.
 * Returns all entity IDs the user can access, with ABAC flags.
 */
export const listAutherObjects = async (
  autherUserId: string,
  entityType: string,
  permission = 'view',
): Promise<ListObjectsItem[]> => {
  const url = new URL('/api/auth/list-objects', getAutherBaseUrl())
  const clientId = getPayloadClientId()
  const entityTypeName = `client_${clientId}:${entityType}`

  const response = await requestJSON<ListObjectsResponse>(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getAutherApiKey(),
    },
    body: JSON.stringify({ userId: autherUserId, entityType: entityTypeName, permission }),
  })

  return (response.items ?? []).reduce<ListObjectsItem[]>((items, item) => {
    if (!item || typeof item.entityId !== 'string') {
      return items
    }

    const tuples = Array.isArray(item.tuples)
      ? item.tuples.reduce<ListObjectsItem['tuples']>((accumulator, tuple) => {
          if (!tuple || typeof tuple.tupleId !== 'string' || typeof tuple.relation !== 'string') {
            return accumulator
          }

          accumulator.push({
            tupleId: tuple.tupleId,
            relation: tuple.relation,
            sourceSubjectType:
              tuple.subjectType === 'user' || tuple.subjectType === 'group'
                ? tuple.subjectType
                : undefined,
            subjectId:
              typeof tuple.subjectId === 'string' && tuple.subjectId.length > 0
                ? tuple.subjectId
                : undefined,
            subjectRelation:
              tuple.subjectRelation == null || typeof tuple.subjectRelation === 'string'
                ? tuple.subjectRelation
                : undefined,
          })

          return accumulator
        }, [])
      : []

    const tupleIds = tuples.length > 0
      ? tuples.map((tuple) => tuple.tupleId)
      : Array.isArray(item.tupleIds)
        ? item.tupleIds.filter((tupleId): tupleId is string => typeof tupleId === 'string' && tupleId.length > 0)
        : typeof item.tupleId === 'string' && item.tupleId.length > 0
          ? [item.tupleId]
          : []

    items.push({
      entityId: item.entityId,
      abacRequired: item.abacRequired ?? item.abac_required ?? false,
      tupleId: tupleIds[0] ?? '',
      tupleIds,
      tuples,
    })

    return items
  }, [])
}

export const listGrantMirrorTupleMetadata = async (
  payload: Payload,
  tupleIds: string[],
): Promise<Map<string, { relation: string; requiresLiveCheck: boolean }>> => {
  const uniqueTupleIds = [...new Set(tupleIds.filter(Boolean))]

  if (uniqueTupleIds.length === 0) {
    return new Map()
  }

  const result = await payload.find({
    collection: 'grant-mirror',
    where: {
      and: [
        { autherTupleId: { in: uniqueTupleIds } },
        { syncStatus: { equals: 'active' } },
      ],
    },
    limit: uniqueTupleIds.length,
    depth: 0,
    overrideAccess: true,
  })

  const tupleMetadata = new Map<string, { relation: string; requiresLiveCheck: boolean }>()

  for (const doc of result.docs as Array<{
    autherTupleId?: string
    relation?: string
    requiresLiveCheck?: boolean
  }>) {
    if (!doc.autherTupleId || !doc.relation || tupleMetadata.has(doc.autherTupleId)) {
      continue
    }

    tupleMetadata.set(doc.autherTupleId, {
      relation: doc.relation,
      requiresLiveCheck: doc.requiresLiveCheck ?? false,
    })
  }

  return tupleMetadata
}

type CheckPermissionBatchResponse = {
  results?: Record<string, boolean>
}

/**
 * Calls Auther check-permission for a batch of book IDs with the given context.
 * Returns the set of entityIds that passed.
 */
export const checkPermissionBatch = async ({
  sessionToken,
  entityType,
  entityIds,
  context,
}: {
  sessionToken: string
  entityType: string
  entityIds: string[]
  context: Record<string, unknown>
}): Promise<string[]> => {
  const clientId = getPayloadClientId()
  const scopedEntityType = `client_${clientId}:${entityType}`
  const url = new URL('/api/auth/check-permission/batch', getAutherBaseUrl())

  const response = await requestJSON<CheckPermissionBatchResponse>(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      entityType: scopedEntityType,
      entityIds,
      permission: 'view',
      context,
    }),
  }).catch((err) => {
    console.error('[grantMirror] checkPermissionBatch: Auther call failed, denying all conditioned grants:', err)
    return { results: {} as Record<string, boolean> }
  })

  const results = response.results ?? {}

  return entityIds.filter((id) => results[id] === true)
}

// ---------------------------------------------------------------------------
// Mirror write helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a Better Auth user ID to a Payload user ID.
 * Returns null if no user exists yet.
 */
export const resolvePayloadUserId = async (
  payload: Payload,
  betterAuthUserId: string,
): Promise<string | number | null> => {
  const result = await payload.find({
    collection: 'users',
    where: { betterAuthUserId: { equals: betterAuthUserId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const user = result.docs[0] as { id?: string | number } | undefined

  return user?.id ?? null
}

/**
 * Upserts a single grant mirror row.
 * Idempotent: an existing row is updated; a new row is inserted.
 */
export const upsertGrantMirrorRow = async (
  payload: Payload,
  row: Omit<GrantMirrorRow, 'syncedAt'>,
): Promise<void> => {
  const now = new Date().toISOString()

  const existing = await payload.find({
    collection: 'grant-mirror',
    where: {
      and: [
        { autherTupleId: { equals: row.autherTupleId } },
        { payloadUserId: { equals: row.payloadUserId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    const doc = existing.docs[0] as { id: string | number }

    await payload.update({
      collection: 'grant-mirror',
      id: doc.id,
      data: {
        syncStatus: 'active',
        requiresLiveCheck: row.requiresLiveCheck,
        syncedAt: now,
      },
      overrideAccess: true,
    })
  } else {
    // Payload relationship fields require numeric IDs
    const numericUserId =
      typeof row.payloadUserId === 'string' ? parseInt(row.payloadUserId, 10) : row.payloadUserId

    if (typeof numericUserId === 'number' && Number.isNaN(numericUserId)) {
      throw new Error(
        `upsertGrantMirrorRow: cannot convert payloadUserId to a number: "${row.payloadUserId}"`,
      )
    }

    await payload.create({
      collection: 'grant-mirror',
      data: { ...row, payloadUserId: numericUserId, syncedAt: now },
      overrideAccess: true,
    })
  }
}

/**
 * Revokes all mirror rows associated with a given Auther tuple ID.
 * Idempotent: already-revoked rows are left as-is.
 * Paginated to handle group grants expanded to many users.
 */
export const revokeGrantMirrorRows = async (
  payload: Payload,
  autherTupleId: string,
): Promise<number> => {
  const now = new Date().toISOString()
  let totalRevoked = 0

  while (true) {
    // Always re-fetch page 1: as rows are revoked they fall out of the
    // `not_equals: 'revoked'` filter, so offset-based pagination would
    // skip rows in the middle of a large batch.
    const batch = await payload
      .find({
        collection: 'grant-mirror',
        where: {
          and: [
            { autherTupleId: { equals: autherTupleId } },
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
        const d = doc as { id: string | number }

        await payload.update({
          collection: 'grant-mirror',
          id: d.id,
          data: { syncStatus: 'revoked', syncedAt: now },
          overrideAccess: true,
        })
      }),
    )

    totalRevoked += batch.docs.length
  }

  return totalRevoked
}

/**
 * Strips the entity-type scope prefix added by Auther (e.g. "client_xyz:book" → "book").
 */
export const stripEntityTypeScope = (scopedEntityType: string): string => {
  const idx = scopedEntityType.lastIndexOf(':')

  return idx >= 0 ? scopedEntityType.slice(idx + 1) : scopedEntityType
}

export const parsePayloadMirrorEntityType = (
  scopedEntityType: string,
): MirrorableEntityType | null => {
  const payloadScopePrefix = `client_${getPayloadClientId()}:`

  if (!scopedEntityType.startsWith(payloadScopePrefix)) {
    return null
  }

  const entityType = scopedEntityType.slice(payloadScopePrefix.length)

  return MIRRORED_ENTITY_TYPES.includes(entityType as MirrorableEntityType)
    ? (entityType as MirrorableEntityType)
    : null
}
