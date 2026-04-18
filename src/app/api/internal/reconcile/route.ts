/**
 * POST /api/internal/reconcile
 *
 * Manually-triggered reconciliation job (P7).
 * Calls Auther's ListObjects API for all users with mirror entries,
 * diffs against current mirror state, and corrects divergences.
 *
 * Protected: admin session or CRON_SECRET header.
 */
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import type { Where } from 'payload'

import { listAutherObjects, upsertGrantMirrorRow } from '@/utils/grantMirror'

const ENTITY_TYPES_TO_RECONCILE = ['book'] as const

type ReconciliationResult = {
  inserted: number
  revoked: number
  flagUpdated: number
  usersProcessed: number
  errors: string[]
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

export async function POST(request: Request): Promise<Response> {
  if (!(await requireAdminOrCron())) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Optional: resume from a checkpoint user ID returned by a prior run.
  // Pass `fromUserId` in the JSON body to skip users processed in a previous call.
  // The response includes `nextFromUserId` when more users remain so callers can
  // chain invocations for large user bases or resume after an interruption.
  let fromUserId: string | number | null = null
  const body = (await request.json().catch(() => null)) as { fromUserId?: string | number } | null

  if (body?.fromUserId != null) {
    fromUserId = body.fromUserId
  }

  const payload = await getPayload({ config: configPromise })
  const result: ReconciliationResult = {
    inserted: 0,
    revoked: 0,
    flagUpdated: 0,
    usersProcessed: 0,
    errors: [],
  }

  const now = new Date().toISOString()
  let lastProcessedUserId: string | number | null = null
  let moreUsersRemain = false

  // 1. Paginate through all users with a betterAuthUserId.
  // Sort by id ascending for stable, resumable iteration.
  let userPage = 1

  while (true) {
    const whereClause: Where = {
      betterAuthUserId: { not_equals: '' },
    }

    // Checkpoint: skip users already processed in a prior run
    if (fromUserId != null) {
      whereClause['id'] = { greater_than: fromUserId }
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
      // Preserve moreUsersRemain=true if we already processed some users so callers
      // can resume from the last checkpoint rather than treating this as a clean completion.
      if (lastProcessedUserId != null) {
        moreUsersRemain = true
      }
      break
    }

    for (const userDoc of usersResult.docs) {
      const user = userDoc as {
        id: string | number
        betterAuthUserId?: string
      }

      if (!user.betterAuthUserId) {
        lastProcessedUserId = user.id
        continue
      }

      result.usersProcessed++

      for (const entityType of ENTITY_TYPES_TO_RECONCILE) {
        try {
          // 2. Fetch the authoritative grant set from Auther
          const autherItems = await listAutherObjects(user.betterAuthUserId, entityType).catch(
            () => [],
          )

          const autherByTupleId = new Map(autherItems.map((item) => [item.tupleId, item]))

          // 3. Fetch current active mirror rows for this user + entity type (paginated)
          const allMirrorDocs: Array<{ id: string | number; autherTupleId?: string; requiresLiveCheck?: boolean }> =
            []
          let mirrorPage = 1

          while (true) {
            const mirrorBatch = await payload
              .find({
                collection: 'grant-mirror',
                where: {
                  and: [
                    { payloadUserId: { equals: user.id } },
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
              break
            }

            allMirrorDocs.push(
              ...(mirrorBatch.docs as Array<{
                id: string | number
                autherTupleId?: string
                requiresLiveCheck?: boolean
              }>),
            )

            if (!mirrorBatch.hasNextPage) {
              break
            }

            mirrorPage++
          }

          const mirrorByTupleId = new Map(
            allMirrorDocs.map((d) => [d.autherTupleId ?? '', d]),
          )

          // 4. Insert rows present in Auther but missing from mirror
          for (const [tupleId, autherItem] of autherByTupleId) {
            if (!mirrorByTupleId.has(tupleId)) {
              try {
                await upsertGrantMirrorRow(payload, {
                  autherTupleId: tupleId,
                  payloadUserId: user.id,
                  entityType,
                  entityId: autherItem.entityId,
                  // ListObjects does not return the relation; 'viewer' is the minimum
                  // that satisfies the view permission used to query. Higher-privilege
                  // rows (editor/owner) are established via the webhook path.
                  relation: 'viewer',
                  // ListObjects already expands groups; every returned item is user-accessible.
                  // sourceSubjectType is best-effort here — the webhook path tags correctly.
                  sourceSubjectType: 'user',
                  requiresLiveCheck: autherItem.abacRequired,
                  syncStatus: 'active',
                })

                result.inserted++
              } catch (error) {
                result.errors.push(
                  `insert tupleId=${tupleId} userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`,
                )
              }
            }
          }

          // 5. Revoke rows present in mirror but absent from Auther
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
                `revoke tupleId=${tupleId} userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`,
              )
            }
          }

          // 6. For rows in both: always stamp syncedAt and update requiresLiveCheck if drifted
          for (const [tupleId, autherItem] of autherByTupleId) {
            const mirrorDoc = mirrorByTupleId.get(tupleId)

            if (!mirrorDoc) {
              continue
            }

            const flagDrifted = mirrorDoc.requiresLiveCheck !== autherItem.abacRequired
            const updateData: Record<string, unknown> = { syncedAt: now }

            if (flagDrifted) {
              updateData.requiresLiveCheck = autherItem.abacRequired
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
                `flag-update tupleId=${tupleId} userId=${user.id}: ${error instanceof Error ? error.message : String(error)}`,
              )
            }
          }
        } catch (error) {
          result.errors.push(
            `user=${user.id} entityType=${entityType}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Checkpoint: record last user processed for resumability
      lastProcessedUserId = user.id
    }

    if (!usersResult.hasNextPage) {
      moreUsersRemain = false
      break
    }

    moreUsersRemain = true
    userPage++
  }

  return Response.json({
    ok: true,
    ...result,
    // Pass nextFromUserId as the fromUserId for the next call to resume where this left off.
    // null means all users have been processed.
    nextFromUserId: moreUsersRemain ? lastProcessedUserId : null,
  })
}
