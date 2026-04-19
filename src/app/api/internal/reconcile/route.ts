/**
 * POST /api/internal/reconcile
 *
 * Manually-triggered reconciliation job (P7).
 *
 * Default behavior:
 * 1. Sweep Auther's full client grant set to build authoritative tuple metadata.
 * 2. Bootstrap from that same sweep to discover users that already had grants before Payload
 *    subscribed to webhook events.
 * 3. Reconcile all known local users against Auther ListObjects.
 * 4. Enqueue deferred grants for discovered users that do not yet exist in Payload (P12).
 * 5. Clean up expired revocation tombstones (P14).
 *
 * Protected: admin session or CRON_SECRET header.
 */
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import type { Where } from 'payload'

import {
  cleanupRevocationTombstones,
  enqueueDeferredGrantJob,
} from '@/utils/deferredGrants'
import {
  buildAutherTupleMetadataMap,
  fetchAutherGroupMembers,
  listAutherClientGrants,
  listAutherObjects,
  resolvePayloadUserId,
  type AutherTupleMetadata,
  upsertGrantMirrorRow,
} from '@/utils/grantMirror'

const ENTITY_TYPES_TO_RECONCILE = ['book'] as const
const DEFAULT_BOOTSTRAP_ENABLED = true
const BOOTSTRAP_GRANTS_PAGE_LIMIT = 100

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>
type AutherListObjectsItem = Awaited<ReturnType<typeof listAutherObjects>>[number]

type ReconciliationBody = {
  bootstrapCursor?: string
  fromUserId?: string | number
  includeBootstrap?: boolean
}

type ReconciliationResult = {
  inserted: number
  revoked: number
  flagUpdated: number
  usersProcessed: number
  deferredEnqueued: number
  bootstrapUsersDiscovered: number
  tombstonesDeleted: number
  errors: string[]
}

type LocalUserDoc = {
  id: string | number
  betterAuthUserId?: string
}

type MirrorDoc = {
  id: string | number
  autherTupleId?: string
  requiresLiveCheck?: boolean
}

type BootstrapScanResult = {
  nextCursor: string | null
  tupleMetadataById: Map<string, AutherTupleMetadata>
  users: Map<string, string | number | null>
}

type EffectiveTupleMetadata = {
  relation: string
  sourceSubjectType: 'user' | 'group'
}

const requireAdminOrCron = async (): Promise<boolean> => {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret) {
    const headerStore = await headers()
    const authHeader = headerStore.get('authorization') ?? ''

    if (authHeader === `Bearer ${cronSecret}`) {
      return true
    }
  }

  const payload = await getPayload({ config: configPromise })
  const headerStore = await headers()
  const { user } = await payload.auth({ headers: headerStore })

  return user?.role === 'admin'
}

const loadActiveMirrorDocsForUser = async (
  payload: PayloadInstance,
  entityType: (typeof ENTITY_TYPES_TO_RECONCILE)[number],
  payloadUserId: string | number,
): Promise<MirrorDoc[] | null> => {
  const allMirrorDocs: MirrorDoc[] = []
  let mirrorPage = 1

  while (true) {
    const mirrorBatch = await payload
      .find({
        collection: 'grant-mirror',
        where: {
          and: [
            { payloadUserId: { equals: payloadUserId } },
            { entityType: { equals: entityType } },
            { syncStatus: { equals: 'active' } },
          ],
        },
        limit: 100,
        page: mirrorPage,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!mirrorBatch) {
      return null
    }

    allMirrorDocs.push(...(mirrorBatch.docs as MirrorDoc[]))

    if (!mirrorBatch.hasNextPage) {
      break
    }

    mirrorPage++
  }

  return allMirrorDocs
}

const resolveTupleMetadata = ({
  item,
  tupleId,
  tupleMetadataById,
}: {
  item: AutherListObjectsItem
  tupleId: string
  tupleMetadataById: Map<string, AutherTupleMetadata>
}): EffectiveTupleMetadata => {
  const listObjectsTuple = item.tuples.find((tuple) => tuple.tupleId === tupleId)
  const authoritativeTuple = tupleMetadataById.get(tupleId)

  return {
    relation: listObjectsTuple?.relation ?? authoritativeTuple?.relation ?? 'viewer',
    sourceSubjectType:
      listObjectsTuple?.sourceSubjectType ?? authoritativeTuple?.sourceSubjectType ?? 'user',
  }
}

const buildAuthoritativeTupleMap = ({
  items,
  tupleMetadataById,
}: {
  items: AutherListObjectsItem[]
  tupleMetadataById: Map<string, AutherTupleMetadata>
}): Map<string, { abacRequired: boolean; entityId: string; relation: string; sourceSubjectType: 'user' | 'group' }> => {
  const tuples = new Map<string, {
    abacRequired: boolean
    entityId: string
    relation: string
    sourceSubjectType: 'user' | 'group'
  }>()

  for (const item of items) {
    for (const tupleId of item.tupleIds) {
      const metadata = resolveTupleMetadata({ item, tupleId, tupleMetadataById })

      tuples.set(tupleId, {
        abacRequired: item.abacRequired,
        entityId: item.entityId,
        relation: metadata.relation,
        sourceSubjectType: metadata.sourceSubjectType,
      })
    }
  }

  return tuples
}

const scanAutherClientGrants = async ({
  collectBootstrapUsers,
  initialCursor,
  payload,
  result,
}: {
  collectBootstrapUsers: boolean
  initialCursor: string | null
  payload: PayloadInstance
  result: ReconciliationResult
}): Promise<BootstrapScanResult> => {
  const candidateUserIds = new Set<string>()
  const groupMembersCache = new Map<string, string[]>()
  const tupleMetadataById = new Map<string, AutherTupleMetadata>()
  let cursor = initialCursor
  let aborted = false

  while (true) {
    const page = await listAutherClientGrants({
      cursor: cursor ?? undefined,
      limit: BOOTSTRAP_GRANTS_PAGE_LIMIT,
    }).catch((error) => {
      result.errors.push(
        `bootstrap-grants cursor=${cursor ?? 'START'}: ${error instanceof Error ? error.message : String(error)}`,
      )

      return null
    })

    if (!page) {
      aborted = true
      break
    }

    const pageTupleMetadata = buildAutherTupleMetadataMap(page.grants)

    for (const [tupleId, metadata] of pageTupleMetadata) {
      tupleMetadataById.set(tupleId, metadata)
    }

    if (collectBootstrapUsers) {
      for (const grant of page.grants) {
        if (grant.subjectType === 'user') {
          candidateUserIds.add(grant.subjectId)
          continue
        }

        if (!groupMembersCache.has(grant.subjectId)) {
          const members = await fetchAutherGroupMembers(grant.subjectId).catch((error) => {
            result.errors.push(
              `bootstrap-group-members groupId=${grant.subjectId}: ${error instanceof Error ? error.message : String(error)}`,
            )

            return null
          })

          if (!members) {
            continue
          }

          groupMembersCache.set(grant.subjectId, members)
        }

        for (const memberUserId of groupMembersCache.get(grant.subjectId) ?? []) {
          candidateUserIds.add(memberUserId)
        }
      }
    }

    if (!page.hasMore || !page.nextCursor) {
      cursor = null
      break
    }

    cursor = page.nextCursor
  }

  result.bootstrapUsersDiscovered = collectBootstrapUsers ? candidateUserIds.size : 0

  const users = new Map<string, string | number | null>()

  if (collectBootstrapUsers) {
    for (const userId of candidateUserIds) {
      const payloadUserId = await resolvePayloadUserId(payload, userId).catch((error) => {
        result.errors.push(
          `bootstrap-resolve-user user=${userId}: ${error instanceof Error ? error.message : String(error)}`,
        )

        return null
      })

      users.set(userId, payloadUserId)
    }
  }

  return {
    nextCursor: aborted ? cursor : null,
    tupleMetadataById,
    users,
  }
}

const reconcileResolvedUser = async ({
  autherUserId,
  payload,
  payloadUserId,
  result,
  tupleMetadataById,
}: {
  autherUserId: string
  payload: PayloadInstance
  payloadUserId: string | number
  result: ReconciliationResult
  tupleMetadataById: Map<string, AutherTupleMetadata>
}): Promise<void> => {
  const now = new Date().toISOString()

  for (const entityType of ENTITY_TYPES_TO_RECONCILE) {
    const autherItems = await listAutherObjects(autherUserId, entityType).catch((error) => {
      result.errors.push(
        `list-objects user=${autherUserId} entityType=${entityType}: ${error instanceof Error ? error.message : String(error)}`,
      )

      return null
    })

    if (autherItems === null) {
      continue
    }

    const autherByTupleId = buildAuthoritativeTupleMap({
      items: autherItems,
      tupleMetadataById,
    })

    const allMirrorDocs = await loadActiveMirrorDocsForUser(payload, entityType, payloadUserId)

    if (allMirrorDocs === null) {
      result.errors.push(
        `mirror-read user=${payloadUserId} entityType=${entityType}: failed to fetch active mirror rows`,
      )
      continue
    }

    const mirrorByTupleId = new Map(allMirrorDocs.map((doc) => [doc.autherTupleId ?? '', doc]))

    for (const [tupleId, autherTuple] of autherByTupleId) {
      if (!mirrorByTupleId.has(tupleId)) {
        try {
          await upsertGrantMirrorRow(payload, {
            autherTupleId: tupleId,
            payloadUserId,
            entityType,
            entityId: autherTuple.entityId,
            relation: autherTuple.relation,
            sourceSubjectType: autherTuple.sourceSubjectType,
            requiresLiveCheck: autherTuple.abacRequired,
            syncStatus: 'active',
          })

          result.inserted++
        } catch (error) {
          result.errors.push(
            `insert tupleId=${tupleId} userId=${payloadUserId}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    for (const [tupleId, mirrorDoc] of mirrorByTupleId) {
      if (!tupleId || autherByTupleId.has(tupleId)) {
        continue
      }

      try {
        await payload.update({
          collection: 'grant-mirror',
          id: mirrorDoc.id,
          data: { syncStatus: 'revoked', syncedAt: now },
          overrideAccess: true,
        })

        result.revoked++
      } catch (error) {
        result.errors.push(
          `revoke tupleId=${tupleId} userId=${payloadUserId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    for (const [tupleId, autherTuple] of autherByTupleId) {
      const mirrorDoc = mirrorByTupleId.get(tupleId)

      if (!mirrorDoc) {
        continue
      }

      const flagDrifted = mirrorDoc.requiresLiveCheck !== autherTuple.abacRequired
      const updateData: Record<string, unknown> = { syncedAt: now }

      if (flagDrifted) {
        updateData.requiresLiveCheck = autherTuple.abacRequired
        result.flagUpdated++
      }

      try {
        await payload.update({
          collection: 'grant-mirror',
          id: mirrorDoc.id,
          data: updateData,
          overrideAccess: true,
        })
      } catch (error) {
        result.errors.push(
          `flag-update tupleId=${tupleId} userId=${payloadUserId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  result.usersProcessed++
}

const enqueueDeferredGrantsForUnknownUser = async ({
  autherUserId,
  payload,
  result,
  tupleMetadataById,
}: {
  autherUserId: string
  payload: PayloadInstance
  result: ReconciliationResult
  tupleMetadataById: Map<string, AutherTupleMetadata>
}): Promise<void> => {
  const timestampMs = Date.now()

  for (const entityType of ENTITY_TYPES_TO_RECONCILE) {
    const autherItems = await listAutherObjects(autherUserId, entityType).catch((error) => {
      result.errors.push(
        `bootstrap-list-objects user=${autherUserId} entityType=${entityType}: ${error instanceof Error ? error.message : String(error)}`,
      )

      return null
    })

    if (autherItems === null) {
      continue
    }

    for (const item of autherItems) {
      for (const tupleId of item.tupleIds) {
        const metadata = resolveTupleMetadata({
          item,
          tupleId,
          tupleMetadataById,
        })

        try {
          await enqueueDeferredGrantJob(payload, {
            id: `bootstrap-${autherUserId}-${tupleId}`,
            betterAuthUserId: autherUserId,
            tupleId,
            entityType,
            entityId: item.entityId,
            relation: metadata.relation,
            sourceSubjectType: metadata.sourceSubjectType,
            hasCondition: item.abacRequired,
            timestampMs,
          })

          result.deferredEnqueued++
        } catch (error) {
          result.errors.push(
            `defer tupleId=${tupleId} user=${autherUserId}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await requireAdminOrCron())) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as ReconciliationBody | null
  const fromUserId = body?.fromUserId ?? null
  const bootstrapCursor = typeof body?.bootstrapCursor === 'string' ? body.bootstrapCursor : null
  const includeBootstrap = body?.includeBootstrap ?? DEFAULT_BOOTSTRAP_ENABLED

  const payload = await getPayload({ config: configPromise })
  const result: ReconciliationResult = {
    inserted: 0,
    revoked: 0,
    flagUpdated: 0,
    usersProcessed: 0,
    deferredEnqueued: 0,
    bootstrapUsersDiscovered: 0,
    tombstonesDeleted: 0,
    errors: [],
  }

  const grantScan = await scanAutherClientGrants({
    collectBootstrapUsers: includeBootstrap,
    initialCursor: bootstrapCursor,
    payload,
    result,
  })
  const alreadyProcessedAutherUserIds = new Set<string>()

  for (const [autherUserId, payloadUserId] of grantScan.users) {
    if (alreadyProcessedAutherUserIds.has(autherUserId)) {
      continue
    }

    if (payloadUserId != null) {
      await reconcileResolvedUser({
        autherUserId,
        payload,
        payloadUserId,
        result,
        tupleMetadataById: grantScan.tupleMetadataById,
      })
    } else {
      await enqueueDeferredGrantsForUnknownUser({
        autherUserId,
        payload,
        result,
        tupleMetadataById: grantScan.tupleMetadataById,
      })
    }

    alreadyProcessedAutherUserIds.add(autherUserId)
  }

  let lastProcessedUserId: string | number | null = null
  let moreUsersRemain = false
  let userPage = 1

  while (true) {
    const whereClause: Where = {
      betterAuthUserId: { not_equals: '' },
    }

    if (fromUserId != null) {
      whereClause.id = { greater_than: fromUserId }
    }

    const usersResult = await payload
      .find({
        collection: 'users',
        where: whereClause,
        sort: 'id',
        limit: 100,
        page: userPage,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!usersResult) {
      result.errors.push(`[reconcile] Failed to fetch users page ${userPage} — aborting run`)

      if (lastProcessedUserId != null) {
        moreUsersRemain = true
      }

      break
    }

    for (const userDoc of usersResult.docs) {
      const user = userDoc as LocalUserDoc

      if (!user.betterAuthUserId) {
        lastProcessedUserId = user.id
        continue
      }

      if (alreadyProcessedAutherUserIds.has(user.betterAuthUserId)) {
        lastProcessedUserId = user.id
        continue
      }

      await reconcileResolvedUser({
        autherUserId: user.betterAuthUserId,
        payload,
        payloadUserId: user.id,
        result,
        tupleMetadataById: grantScan.tupleMetadataById,
      })

      alreadyProcessedAutherUserIds.add(user.betterAuthUserId)
      lastProcessedUserId = user.id
    }

    if (!usersResult.hasNextPage) {
      moreUsersRemain = false
      break
    }

    moreUsersRemain = true
    userPage++
  }

  result.tombstonesDeleted = await cleanupRevocationTombstones(payload).catch((error) => {
    result.errors.push(
      `cleanup-revocation-tombstones: ${error instanceof Error ? error.message : String(error)}`,
    )

    return 0
  })

  return Response.json({
    ok: true,
    ...result,
    nextBootstrapCursor: grantScan.nextCursor,
    nextFromUserId: moreUsersRemain ? lastProcessedUserId : null,
  })
}