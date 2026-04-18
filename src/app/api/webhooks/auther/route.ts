/**
 * POST /api/webhooks/auther
 *
 * Inbound webhook endpoint for Auther grant and membership events.
 * Covers P2 (grant.created, grant.revoked) and P3 (group.member.added, group.member.removed).
 *
 * Security: HMAC-SHA256 signature verification + timestamp replay-prevention window.
 */
import crypto from 'node:crypto'

import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { getAutherWebhookSecret } from '@/lib/env'
import {
  enqueueDeferredGrantJob,
  expirePendingDeferredGrantsByTupleId,
  upsertRevocationTombstone,
} from '@/utils/deferredGrants'
import {
  fetchAutherGroupMembers,
  listGrantMirrorTupleMetadata,
  listAutherObjects,
  resolvePayloadUserId,
  revokeGrantMirrorRows,
  stripEntityTypeScope,
  upsertGrantMirrorRow,
} from '@/utils/grantMirror'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Webhook event types
// ---------------------------------------------------------------------------

type GrantCreatedEvent = {
  id: string
  type: 'grant.created'
  timestamp: number
  tupleId: string
  subjectType: 'user' | 'group'
  subjectId: string
  entityType: string
  entityId: string
  relation: string
  hasCondition: boolean
}

type GrantRevokedEvent = {
  id: string
  type: 'grant.revoked'
  timestamp: number
  tupleId: string
  subjectType: 'user' | 'group'
  subjectId: string
  entityType: string
  entityId: string
}

type GroupMemberAddedEvent = {
  id: string
  type: 'group.member.added'
  timestamp: number
  groupId: string
  userId: string
}

type GroupMemberRemovedEvent = {
  id: string
  type: 'group.member.removed'
  timestamp: number
  groupId: string
  userId: string
}

type AutherWebhookEvent =
  | GrantCreatedEvent
  | GrantRevokedEvent
  | GroupMemberAddedEvent
  | GroupMemberRemovedEvent

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

const verifySignature = (
  secret: string,
  timestampMs: number,
  rawBody: string,
  signatureHeader: string,
): boolean => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampMs}.${rawBody}`)
    .digest('hex')

  const received = signatureHeader.replace(/^sha256=/, '')

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

const handleGrantCreated = async (
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  event: GrantCreatedEvent,
): Promise<void> => {
  const rawEntityType = stripEntityTypeScope(event.entityType)
  const validEntityTypes = ['book', 'chapter', 'comment'] as const
  const entityType = validEntityTypes.includes(rawEntityType as (typeof validEntityTypes)[number])
    ? (rawEntityType as (typeof validEntityTypes)[number])
    : null

  if (!entityType) {
    // Ignore entity types we don't mirror
    return
  }

  // Out-of-order guard (§6.4): if grant.revoked was already processed for this tupleId,
  // a late-arriving grant.created must not restore the revoked row.
  //
  // Two checks are needed:
  // 1. A revoked mirror row exists (normal case — revoke arrived after create was processed).
  // 2. A revocation tombstone exists in deferred-grants (edge case — revoke arrived when no
  //    mirror row had been written yet, e.g. Auther retried create after revoke was processed).
  const alreadyRevoked = await payload
    .find({
      collection: 'grant-mirror',
      where: {
        and: [
          { autherTupleId: { equals: event.tupleId } },
          { syncStatus: { equals: 'revoked' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[] }))

  if (alreadyRevoked.docs.length > 0) {
    console.warn(
      '[auther-webhook] Out-of-order: dropping late grant.created for already-revoked tuple:',
      event.tupleId,
    )
    return
  }

  const revocationTombstone = await payload
    .find({
      collection: 'deferred-grants',
      where: {
        and: [
          { tupleId: { equals: event.tupleId } },
          { type: { equals: 'revocation_tombstone' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as unknown[] }))

  if (revocationTombstone.docs.length > 0) {
    console.warn(
      '[auther-webhook] Out-of-order (tombstone): dropping late grant.created for already-revoked tuple:',
      event.tupleId,
    )
    return
  }

  if (event.subjectType === 'user') {
    const payloadUserId = await resolvePayloadUserId(payload, event.subjectId)

    if (!payloadUserId) {
      await enqueueDeferredGrantJob(payload, {
        id: event.id,
        betterAuthUserId: event.subjectId,
        tupleId: event.tupleId,
        entityType: event.entityType,
        entityId: event.entityId,
        relation: event.relation,
        sourceSubjectType: 'user',
        hasCondition: event.hasCondition,
        timestampMs: event.timestamp,
      })
      return
    }

    await upsertGrantMirrorRow(payload, {
      autherTupleId: event.tupleId,
      payloadUserId,
      entityType,
      entityId: event.entityId,
      relation: event.relation,
      sourceSubjectType: 'user',
      requiresLiveCheck: event.hasCondition,
      syncStatus: 'active',
    })
  } else if (event.subjectType === 'group') {
    // Expand group → individual users
    const memberAutherIds = await fetchAutherGroupMembers(event.subjectId)

    await Promise.all(
      memberAutherIds.map(async (memberAutherId) => {
        const payloadUserId = await resolvePayloadUserId(payload, memberAutherId)

        if (!payloadUserId) {
          await enqueueDeferredGrantJob(payload, {
            id: `${event.id}:${memberAutherId}`,
            betterAuthUserId: memberAutherId,
            tupleId: event.tupleId,
            entityType: event.entityType,
            entityId: event.entityId,
            relation: event.relation,
            sourceSubjectType: 'group',
            hasCondition: event.hasCondition,
            timestampMs: event.timestamp,
          })
          return
        }

        await upsertGrantMirrorRow(payload, {
          autherTupleId: event.tupleId,
          payloadUserId,
          entityType,
          entityId: event.entityId,
          relation: event.relation,
          sourceSubjectType: 'group',
          requiresLiveCheck: event.hasCondition,
          syncStatus: 'active',
        })
      }),
    )
  }
}

const handleGrantRevoked = async (
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  event: GrantRevokedEvent,
): Promise<void> => {
  const revokedCount = await revokeGrantMirrorRows(payload, event.tupleId)
  await expirePendingDeferredGrantsByTupleId(payload, event.tupleId)

  if (revokedCount === 0) {
    await upsertRevocationTombstone(payload, {
      betterAuthUserId: event.subjectId,
      tupleId: event.tupleId,
      entityType: event.entityType,
      entityId: event.entityId,
      sourceSubjectType: event.subjectType,
    }).catch((err) => {
      console.warn('[auther-webhook] Failed to write revocation tombstone:', event.tupleId, err)
    })
  }
}

const handleGroupMemberAdded = async (
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  event: GroupMemberAddedEvent,
): Promise<void> => {
  // Call Auther's ListObjects for the newly added user to get all books they can now access.
  // This avoids the scoping bug of querying ALL group rows — it correctly reflects what the
  // specific group join actually grants to this user (§4.4).
  // Let lookup failures bubble here so the webhook returns 500 and Auther retries the event.
  // Silently dropping a membership-add event would leave access absent until reconciliation.
  const autherItems = await listAutherObjects(event.userId, 'book')

  if (autherItems.length === 0) {
    return
  }

  const tupleMetadata = await listGrantMirrorTupleMetadata(
    payload,
    autherItems.map((item) => item.tupleId),
  )

  const payloadUserId = await resolvePayloadUserId(payload, event.userId)

  if (!payloadUserId) {
    // User not in Payload yet — enqueue deferred grants for each book
    for (const item of autherItems) {
      const existingTuple = tupleMetadata.get(item.tupleId)

      await enqueueDeferredGrantJob(payload, {
        id: `defer-${event.id}-${item.tupleId}`,
        betterAuthUserId: event.userId,
        tupleId: item.tupleId,
        entityType: 'book',
        entityId: item.entityId,
        relation: existingTuple?.relation ?? 'viewer',
        sourceSubjectType: 'group',
        hasCondition: existingTuple?.requiresLiveCheck ?? item.abacRequired,
        timestampMs: event.timestamp,
      })
    }

    return
  }

  // Upsert mirror rows for all effective grants.
  // - Rows that already exist (e.g. from a direct user grant) are idempotently updated.
  // - New rows (accessible only via this group) are created with sourceSubjectType='group'.
  // upsertGrantMirrorRow does NOT overwrite sourceSubjectType on existing rows.
  await Promise.all(
    autherItems.map((item) => {
      const existingTuple = tupleMetadata.get(item.tupleId)

      return upsertGrantMirrorRow(payload, {
        autherTupleId: item.tupleId,
        payloadUserId,
        entityType: 'book',
        entityId: item.entityId,
        relation: existingTuple?.relation ?? 'viewer',
        sourceSubjectType: 'group',
        requiresLiveCheck: existingTuple?.requiresLiveCheck ?? item.abacRequired,
        syncStatus: 'active',
      }).catch(() => {
        // Best-effort per row
      })
    }),
  )
}

const handleGroupMemberRemoved = async (
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  event: GroupMemberRemovedEvent,
): Promise<void> => {
  const payloadUserId = await resolvePayloadUserId(payload, event.userId)

  if (!payloadUserId) {
    // User has no Payload account yet. They may have pending deferred grants from a prior
    // group.member.added event. Those grants are now stale — expire them so they are not
    // applied when the user eventually signs in (§8.1 deferred grant path).
    const pendingDeferred = await payload
      .find({
        collection: 'deferred-grants',
        where: {
          and: [
            { betterAuthUserId: { equals: event.userId } },
            { status: { equals: 'pending' } },
            { sourceSubjectType: { equals: 'group' } },
          ],
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] }))

    if (pendingDeferred.docs.length > 0) {
      // Re-fetch authoritative grants to expire only rows for tuples the user no longer holds.
      const remainingItems = await listAutherObjects(event.userId, 'book').catch(() => null)
      const remainingTupleIds = remainingItems ? new Set(remainingItems.map((i) => i.tupleId)) : null

      await Promise.all(
        pendingDeferred.docs.map(async (doc) => {
          const d = doc as { id: string | number; tupleId?: string }

          // If Auther is unreachable (remainingTupleIds is null), fail-closed:
          // expire all pending group deferred grants for this user.
          if (remainingTupleIds === null || !remainingTupleIds.has(d.tupleId ?? '')) {
            await payload
              .update({
                collection: 'deferred-grants',
                id: d.id,
                data: { status: 'expired' },
                overrideAccess: true,
              })
              .catch(() => {})
          }
        }),
      )
    }

    return
  }

  // Fetch the user's remaining authoritative grants from Auther AFTER the group removal.
  // This correctly handles rows tagged as either sourceSubjectType='group' OR 'user'
  // (reconciliation may have tagged group-derived rows as 'user' — §sourceSubjectType bug).
  const autherItems = await listAutherObjects(event.userId, 'book').catch(() => null)

  if (autherItems === null) {
    // Auther unreachable — fail-closed: skip, let reconciliation correct this later (§10.4)
    console.warn(
      '[auther-webhook] group.member.removed: Auther unreachable, skipping revocation for user:',
      event.userId,
    )
    return
  }

  const remainingTupleIds = new Set(autherItems.map((item) => item.tupleId))

  // Collect all active mirror rows for this user first (read-only pass, safe for page++),
  // then revoke in a second pass. Separating read and write avoids the offset-pagination
  // bug where revoked rows fall out of the filter and shift the page boundary.
  const allActiveDocs: Array<{ id: string | number; autherTupleId?: string }> = []
  let collectPage = 1
  let readError = false

  while (true) {
    const batch = await payload
      .find({
        collection: 'grant-mirror',
        where: {
          and: [
            { payloadUserId: { equals: payloadUserId } },
            { entityType: { equals: 'book' } },
            { syncStatus: { equals: 'active' } },
          ],
        },
        limit: 100,
        page: collectPage,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!batch) {
      console.error(
        '[auther-webhook] group.member.removed: failed to read mirror page',
        collectPage,
        'for user',
        event.userId,
        '— partial revocation; reconciliation will correct.',
      )
      readError = true
      break
    }

    allActiveDocs.push(
      ...(batch.docs as Array<{ id: string | number; autherTupleId?: string }>),
    )

    if (!batch.hasNextPage) {
      break
    }

    collectPage++
  }

  const now = new Date().toISOString()

  // Only proceed with revocation if we have a complete picture of active rows.
  // A partial read (readError=true) would silently leave rows un-revoked; we
  // log the error above and let reconciliation correct the gap instead.
  if (readError) {
    return
  }

  // Revoke rows no longer present in Auther's authoritative grant set
  await Promise.all(
    allActiveDocs
      .filter((d) => !remainingTupleIds.has(d.autherTupleId ?? ''))
      .map((d) =>
        payload
          .update({
            collection: 'grant-mirror',
            id: d.id,
            data: { syncStatus: 'revoked', syncedAt: now },
            overrideAccess: true,
          })
          .catch(() => {}),
      ),
  )
}

// ---------------------------------------------------------------------------
// Main route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-auther-signature-256') ?? ''
  const timestampHeader = request.headers.get('x-auther-timestamp') ?? ''

  const timestampMs = parseInt(timestampHeader, 10)

  if (!signatureHeader || !timestampMs || Number.isNaN(timestampMs)) {
    return Response.json({ error: 'Missing signature or timestamp' }, { status: 400 })
  }

  const now = Date.now()

  if (Math.abs(now - timestampMs) > WEBHOOK_MAX_AGE_MS) {
    return Response.json({ error: 'Webhook timestamp out of acceptable range' }, { status: 400 })
  }

  let secret: string

  try {
    secret = getAutherWebhookSecret()
  } catch {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  if (!verifySignature(secret, timestampMs, rawBody, signatureHeader)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: AutherWebhookEvent

  try {
    event = JSON.parse(rawBody) as AutherWebhookEvent
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!event.type || !event.id) {
    return Response.json({ error: 'Missing event type or id' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    switch (event.type) {
      case 'grant.created':
        await handleGrantCreated(payload, event)
        break
      case 'grant.revoked':
        await handleGrantRevoked(payload, event)
        break
      case 'group.member.added':
        await handleGroupMemberAdded(payload, event)
        break
      case 'group.member.removed':
        await handleGroupMemberRemoved(payload, event)
        break
      default:
        // Unknown event type — acknowledge to prevent retries for unsupported events
        break
    }

    return Response.json({ ok: true })
  } catch (error) {
    console.error('[auther-webhook] Error processing event:', event.type, error)
    // Return 500 so Auther retries delivery
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
