/**
 * Deferred grant utilities (P8 support).
 *
 * When a grant.created webhook arrives for a Better Auth user that has no
 * corresponding Payload user yet, the grant event is persisted to the
 * DeferredGrants collection for visibility and also enqueued through QStash.
 * The queue worker retries while the user is missing, and the Users
 * afterOperation hook remains a long-tail drain point when the local user
 * eventually appears.
 */
import type { Payload } from 'payload'

import { publishQStashJson } from '@/lib/qstash'

import {
  resolvePayloadUserId,
  stripEntityTypeScope,
  upsertGrantMirrorRow,
} from './grantMirror'

/** 7 days in milliseconds — grants that have waited longer than this are expired. */
export const DEFERRED_GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const DEFERRED_GRANTS_COLLECTION = 'deferred-grants' as const
export const DEFERRED_GRANTS_QUEUE_PATH = '/api/internal/queues/deferred-grants' as const

const MIRRORED_ENTITY_TYPES = ['book', 'chapter', 'comment'] as const

type MirrorableEntityType = (typeof MIRRORED_ENTITY_TYPES)[number]

type DeferredGrantDoc = {
  id: string | number
  betterAuthUserId?: string
  tupleId?: string
  entityType?: string
  entityId?: string
  relation?: string
  sourceSubjectType?: string
  hasCondition?: boolean
  status?: string
  type?: string
  createdAt?: string
}

export type DeferredGrantQueueInput = {
  id: string
  betterAuthUserId: string
  tupleId: string
  entityType: string
  entityId: string
  relation: string
  sourceSubjectType: 'user' | 'group'
  hasCondition: boolean
  timestampMs: number
}

export type DeferredGrantJob = {
  id: string
  deferredGrantId: string | number
  betterAuthUserId: string
  queuedAt: number
}

const parseMirrorableEntityType = (
  entityType: string | undefined,
): MirrorableEntityType | null => {
  if (!entityType) {
    return null
  }

  const rawEntityType = stripEntityTypeScope(entityType)

  return MIRRORED_ENTITY_TYPES.includes(rawEntityType as MirrorableEntityType)
    ? (rawEntityType as MirrorableEntityType)
    : null
}

const isExpired = (timestampMs: number): boolean => {
  return Date.now() - timestampMs > DEFERRED_GRANT_TTL_MS
}

const loadDeferredGrantById = async (
  payload: Payload,
  id: string | number,
): Promise<DeferredGrantDoc | null> => {
  return (await payload
    .findByID({
      collection: DEFERRED_GRANTS_COLLECTION,
      id,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as DeferredGrantDoc | null
}

const updateDeferredGrantStatus = async (
  payload: Payload,
  id: string | number,
  status: 'pending' | 'processed' | 'expired',
  processedAt?: string,
): Promise<void> => {
  const data: { status: 'pending' | 'processed' | 'expired'; processedAt?: string } = { status }

  if (processedAt) {
    data.processedAt = processedAt
  }

  await payload.update({
    collection: DEFERRED_GRANTS_COLLECTION,
    id,
    data,
    overrideAccess: true,
  })
}

const findGrantDeferredRecord = async (
  payload: Payload,
  betterAuthUserId: string,
  tupleId: string,
): Promise<DeferredGrantDoc | null> => {
  const result = await payload.find({
    collection: DEFERRED_GRANTS_COLLECTION,
    where: {
      and: [
        { betterAuthUserId: { equals: betterAuthUserId } },
        { tupleId: { equals: tupleId } },
        {
          or: [
            { type: { equals: 'grant' } },
            { type: { exists: false } },
          ],
        },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return (result.docs[0] as DeferredGrantDoc | undefined) ?? null
}

const findRevocationTombstone = async (
  payload: Payload,
  tupleId: string,
): Promise<DeferredGrantDoc | null> => {
  const result = await payload.find({
    collection: DEFERRED_GRANTS_COLLECTION,
    where: {
      and: [
        { tupleId: { equals: tupleId } },
        { type: { equals: 'revocation_tombstone' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  return (result.docs[0] as DeferredGrantDoc | undefined) ?? null
}

const processDeferredGrantDoc = async (
  payload: Payload,
  doc: DeferredGrantDoc,
  resolvedPayloadUserId?: string | number,
): Promise<'processed' | 'pending' | 'expired' | 'skipped'> => {
  if (doc.type === 'revocation_tombstone' || doc.status !== 'pending') {
    return 'skipped'
  }

  if (doc.createdAt && isExpired(new Date(doc.createdAt).getTime())) {
    console.warn('[deferred-grants] Expiring stale deferred grant:', doc.tupleId)
    await updateDeferredGrantStatus(payload, doc.id, 'expired')
    return 'expired'
  }

  if (!doc.betterAuthUserId || !doc.tupleId || !doc.entityType || !doc.entityId || !doc.relation) {
    console.warn('[deferred-grants] Expiring malformed deferred grant record:', doc.id)
    await updateDeferredGrantStatus(payload, doc.id, 'expired')
    return 'expired'
  }

  const tombstone = await findRevocationTombstone(payload, doc.tupleId)

  if (tombstone) {
    await updateDeferredGrantStatus(payload, doc.id, 'expired')
    return 'expired'
  }

  const entityType = parseMirrorableEntityType(doc.entityType)

  if (!entityType) {
    console.warn(
      '[deferred-grants] Expiring deferred grant with unsupported entity type:',
      doc.entityType,
    )
    await updateDeferredGrantStatus(payload, doc.id, 'expired')
    return 'expired'
  }

  const payloadUserId =
    resolvedPayloadUserId ?? (await resolvePayloadUserId(payload, doc.betterAuthUserId))

  if (!payloadUserId) {
    return 'pending'
  }

  await upsertGrantMirrorRow(payload, {
    autherTupleId: doc.tupleId,
    payloadUserId,
    entityType,
    entityId: doc.entityId,
    relation: doc.relation,
    sourceSubjectType: (doc.sourceSubjectType as 'user' | 'group') ?? 'user',
    requiresLiveCheck: doc.hasCondition ?? false,
    syncStatus: 'active',
  })

  await updateDeferredGrantStatus(payload, doc.id, 'processed', new Date().toISOString())

  return 'processed'
}

export const enqueueDeferredGrantJob = async (
  payload: Payload,
  input: DeferredGrantQueueInput,
): Promise<string | number> => {
  const existing = await findGrantDeferredRecord(payload, input.betterAuthUserId, input.tupleId)
  const data = {
    betterAuthUserId: input.betterAuthUserId,
    tupleId: input.tupleId,
    entityType: input.entityType,
    entityId: input.entityId,
    relation: input.relation,
    sourceSubjectType: input.sourceSubjectType,
    hasCondition: input.hasCondition,
    status: 'pending' as const,
    type: 'grant' as const,
  }

  let deferredGrantId: string | number

  if (existing) {
    deferredGrantId = existing.id
    await payload.update({
      collection: DEFERRED_GRANTS_COLLECTION,
      id: existing.id,
      data,
      overrideAccess: true,
    })
  } else {
    const created = (await payload.create({
      collection: DEFERRED_GRANTS_COLLECTION,
      data,
      overrideAccess: true,
    })) as { id: string | number }

    deferredGrantId = created.id
  }

  await publishQStashJson<DeferredGrantJob>(
    DEFERRED_GRANTS_QUEUE_PATH,
    {
      id: input.id,
      deferredGrantId,
      betterAuthUserId: input.betterAuthUserId,
      queuedAt: input.timestampMs,
    },
    3,
  )

  return deferredGrantId
}

export const expirePendingDeferredGrantsByTupleId = async (
  payload: Payload,
  tupleId: string,
): Promise<number> => {
  let expiredCount = 0

  while (true) {
    const batch = await payload.find({
      collection: DEFERRED_GRANTS_COLLECTION,
      where: {
        and: [
          { tupleId: { equals: tupleId } },
          { status: { equals: 'pending' } },
          {
            or: [
              { type: { not_equals: 'revocation_tombstone' } },
              { type: { exists: false } },
            ],
          },
        ],
      },
      limit: 100,
      page: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (batch.docs.length === 0) {
      break
    }

    await Promise.all(
      batch.docs.map(async (doc) => {
        const deferredGrant = doc as DeferredGrantDoc
        await updateDeferredGrantStatus(payload, deferredGrant.id, 'expired')
      }),
    )

    expiredCount += batch.docs.length
  }

  return expiredCount
}

export const upsertRevocationTombstone = async (
  payload: Payload,
  input: {
    betterAuthUserId: string
    tupleId: string
    entityType: string
    entityId: string
    sourceSubjectType: 'user' | 'group'
  },
): Promise<void> => {
  const existing = await findRevocationTombstone(payload, input.tupleId)
  // For group-subject revocations the betterAuthUserId field stores the group ID.
  // Tombstones are keyed by tupleId + type and are never dereferenced for user resolution.
  const data = {
    betterAuthUserId: input.betterAuthUserId,
    tupleId: input.tupleId,
    entityType: input.entityType,
    entityId: input.entityId,
    relation: 'viewer',
    sourceSubjectType: input.sourceSubjectType,
    hasCondition: false,
    status: 'expired' as const,
    type: 'revocation_tombstone' as const,
  }

  if (existing) {
    await payload.update({
      collection: DEFERRED_GRANTS_COLLECTION,
      id: existing.id,
      data,
      overrideAccess: true,
    })
    return
  }

  await payload.create({
    collection: DEFERRED_GRANTS_COLLECTION,
    data,
    overrideAccess: true,
  })
}

export const processDeferredGrantJob = async (
  payload: Payload,
  job: DeferredGrantJob,
): Promise<'processed' | 'pending' | 'expired' | 'skipped'> => {
  const deferredGrant = await loadDeferredGrantById(payload, job.deferredGrantId)

  if (!deferredGrant) {
    return 'skipped'
  }

  if (isExpired(job.queuedAt)) {
    await updateDeferredGrantStatus(payload, deferredGrant.id, 'expired')
    console.warn(
      '[deferred-grants] Expiring deferred grant job after retry window:',
      deferredGrant.tupleId,
    )
    return 'expired'
  }

  return processDeferredGrantDoc(payload, deferredGrant)
}

/**
 * Processes all pending deferred grants for a newly created Payload user.
 * Called fire-and-forget from the Users afterOperation hook.
 *
 * Records older than DEFERRED_GRANT_TTL_MS are expired rather than processed:
 * if a user has not appeared in Payload within 7 days of the grant being
 * created in Auther, the grant is considered stale and reconciliation will
 * correct the mirror when the user eventually does sign in.
 */
export const drainDeferredGrantsForUser = async (
  payload: Payload,
  betterAuthUserId: string,
  payloadUserId: string | number,
): Promise<void> => {
  const pending = await payload.find({
    collection: DEFERRED_GRANTS_COLLECTION,
    where: {
      and: [
        { betterAuthUserId: { equals: betterAuthUserId } },
        { status: { equals: 'pending' } },
        {
          or: [
            { type: { not_equals: 'revocation_tombstone' } },
            { type: { exists: false } },
          ],
        },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  if (pending.docs.length === 0) {
    return
  }

  await Promise.all(
    pending.docs.map(async (doc) => {
      const deferredGrant = doc as DeferredGrantDoc

      try {
        await processDeferredGrantDoc(payload, deferredGrant, payloadUserId)
      } catch (error) {
        console.error('[deferred-grants] Failed to drain grant:', deferredGrant.tupleId, error)
      }
    }),
  )
}
