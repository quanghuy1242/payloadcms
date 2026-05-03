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

import {
  getAutherWebhookSecret,
  getAutherClientId,
} from '@/lib/env'
import {
  enqueueDeferredGrantJob,
  expirePendingDeferredGrantsByTupleId,
  upsertRevocationTombstone,
} from '@/utils/deferredGrants'
import {
  fetchAutherGroupMembers,
  listGrantMirrorTupleMetadata,
  listAutherObjects,
  parseAutherProjectionRoutingMetadata,
  parsePayloadMirrorEntityType,
  resolvePayloadUserId,
  revokeGrantMirrorRows,
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
  subjectType: 'user' | 'group' | 'apikey'
  subjectId: string
  entityType: string
  entityId: string
  relation: string
  hasCondition: boolean
  authorizationSpaceId?: string
}

type GrantRevokedEvent = {
  id: string
  type: 'grant.revoked'
  timestamp: number
  tupleId: string
  subjectType: 'user' | 'group' | 'apikey'
  subjectId: string
  entityType: string
  entityId: string
  authorizationSpaceId?: string
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

type AutherWebhookEnvelope = {
  id?: string
  type?: string
  timestamp?: number
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

const verifySignature = (
  secret: string,
  timestampMs: number,
  rawBody: string,
  signatureHeader: string,
): boolean => {
  const signedPayload = `${timestampMs}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
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
  // API key grants (e.g. full_access) have no Payload user mirror — skip silently.
  if (event.subjectType === 'apikey') {
    return
  }

  const entityType = parsePayloadMirrorEntityType(event.entityType)

  if (!entityType) {
    // Ignore entity types outside the Payload client scope or types we do not mirror.
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
  // API key grants (e.g. full_access) have no Payload user mirror — skip silently.
  if (event.subjectType === 'apikey') {
    return
  }

  if (!parsePayloadMirrorEntityType(event.entityType)) {
    return
  }

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

  const authoritativeTupleIds = autherItems.flatMap((item) => item.tupleIds)

  const tupleMetadata = await listGrantMirrorTupleMetadata(
    payload,
    authoritativeTupleIds,
  )

  const payloadUserId = await resolvePayloadUserId(payload, event.userId)

  if (!payloadUserId) {
    // User not in Payload yet — enqueue deferred grants for each book
    for (const item of autherItems) {
      for (const tupleId of item.tupleIds) {
        const existingTuple = tupleMetadata.get(tupleId)
        const listObjectsTuple = item.tuples.find((tuple) => tuple.tupleId === tupleId)

        await enqueueDeferredGrantJob(payload, {
          id: `defer-${event.id}-${tupleId}`,
          betterAuthUserId: event.userId,
          tupleId,
          entityType: 'book',
          entityId: item.entityId,
          relation: listObjectsTuple?.relation ?? existingTuple?.relation ?? 'viewer',
          sourceSubjectType: listObjectsTuple?.sourceSubjectType ?? 'group',
          hasCondition: existingTuple?.requiresLiveCheck ?? item.abacRequired,
          timestampMs: event.timestamp,
        })
      }
    }

    return
  }

  // Upsert mirror rows for all effective grants.
  // - Rows that already exist (e.g. from a direct user grant) are idempotently updated.
  // - New rows (accessible only via this group) are created with sourceSubjectType='group'.
  // upsertGrantMirrorRow does NOT overwrite sourceSubjectType on existing rows.
  await Promise.all(
    autherItems.flatMap((item) =>
      item.tupleIds.map((tupleId) => {
        const existingTuple = tupleMetadata.get(tupleId)
        const listObjectsTuple = item.tuples.find((tuple) => tuple.tupleId === tupleId)

        return upsertGrantMirrorRow(payload, {
          autherTupleId: tupleId,
          payloadUserId,
          entityType: 'book',
          entityId: item.entityId,
          relation: listObjectsTuple?.relation ?? existingTuple?.relation ?? 'viewer',
          sourceSubjectType: listObjectsTuple?.sourceSubjectType ?? 'group',
          requiresLiveCheck: existingTuple?.requiresLiveCheck ?? item.abacRequired,
          syncStatus: 'active',
        }).catch(() => {
          // Best-effort per row
        })
      }),
    ),
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
      const remainingTupleIds = remainingItems
        ? new Set(remainingItems.flatMap((item) => item.tupleIds))
        : null

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
  // This handles both direct-user and group-derived tuples because the comparison is keyed
  // by Auther tuple ID, not by the local sourceSubjectType label alone.
  const autherItems = await listAutherObjects(event.userId, 'book').catch(() => null)

  if (autherItems === null) {
    // Auther unreachable — fail-closed: skip, let reconciliation correct this later (§10.4)
    console.warn(
      '[auther-webhook] group.member.removed: Auther unreachable, skipping revocation for user:',
      event.userId,
    )
    return
  }

  const remainingTupleIds = new Set(autherItems.flatMap((item) => item.tupleIds))

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
  const signatureHeader = request.headers.get('x-webhook-signature') ?? ''
  const timestampHeader = request.headers.get('x-webhook-timestamp') ?? ''

  const timestampMs = parseInt(timestampHeader, 10)

  if (!signatureHeader || !timestampHeader || Number.isNaN(timestampMs)) {
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

  const expectedClientId = getAutherClientId()

  let event: AutherWebhookEvent

  try {
    // Auther wraps the grant payload in a WebhookEventPayload envelope:
    // { id, origin, type, timestamp, data: { tupleId, entityType, ... } }
    // We need to unwrap it and flatten into the event shape.
    const envelope = JSON.parse(rawBody) as AutherWebhookEnvelope

    // If AUTHER_CLIENT_ID is configured, reject events not scoped to this client.
    // R2 also accepts future authorizationSpaceId metadata, but does not use it
    // as the routing source of truth until the R3 space-routing migration.
    if (expectedClientId) {
      const routingMetadata = parseAutherProjectionRoutingMetadata(envelope?.data)
      if (routingMetadata.clientId !== null && routingMetadata.clientId !== expectedClientId) {
        // Wrong client — acknowledge to prevent retries; this is not our event.
        return Response.json({ ok: true, skipped: 'wrong_client' })
      }
    }

    if (!envelope.type || !envelope.id) {
      return Response.json({ error: 'Missing event type or id' }, { status: 400 })
    }

    event = {
      id: envelope.id,
      type: envelope.type,
      timestamp: envelope.timestamp ?? timestampMs,
      ...(envelope.data ?? {}),
    } as AutherWebhookEvent
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
