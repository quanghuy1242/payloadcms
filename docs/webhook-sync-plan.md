# Better Auth ↔ Payload CMS Bidirectional Sync Plan

**Date**: October 27, 2025  
**Status**: 🔵 Planning Phase

## Executive Summary

This document outlines a **webhook-based bidirectional synchronization** strategy between Better Auth (identity provider) and PayloadCMS (content management). Since Better Auth does not expose a management API, synchronization will be achieved through:

1. **Better Auth → Payload**: Database hooks that trigger HTTP webhooks to Payload
2. **Payload → Better Auth**: Collection hooks that trigger HTTP webhooks to Better Auth
3. **Shared webhook secret** for verification and authentication

## Architecture Overview

```
┌─────────────────┐                  ┌──────────────────┐
│  Better Auth    │                  │   PayloadCMS     │
│  (Identity DB)  │                  │   (Content DB)   │
└────────┬────────┘                  └────────┬─────────┘
         │                                    │
         │  databaseHooks                     │  hooks
         │  (create/update/delete)            │  (beforeChange/afterChange/afterDelete)
         │                                    │
         ├─► Trigger Webhook ────────────────┼─► POST /api/webhooks/better-auth
         │    {type: user.created/updated/   │    - Validate signature
         │     deleted, data: {...}}          │    - Update Payload user
         │                                    │
         │◄── Trigger Webhook ────────────────┤   POST /api/webhooks/payload
         │    - Validate signature            │◄── {type: user.updated/deleted,
         │    - Update Better Auth DB         │     data: {...}}
         │                                    │
         └────────────────────────────────────┘
```

## Key Principles

1. **Event-Driven**: Changes trigger webhooks immediately (no polling)
2. **Idempotent**: Webhooks can be retried safely
3. **Fail-Safe**: Failures logged but don't block primary operation
4. **Secure**: HMAC signature verification on all webhooks
5. **Transactional**: Use Better Auth's database hooks (run in same transaction)

---

## Part 1: Better Auth → Payload Webhooks

### Overview

Better Auth exposes **database hooks** (`databaseHooks`) that run in the same transaction as database operations. We'll use these to send webhooks to Payload when users are created/updated/deleted in Better Auth.

### Implementation in Better Auth

#### 1. Webhook Client Module

**File**: `src/lib/webhooks/payload.ts` (in Better Auth repo)

```typescript
import crypto from 'node:crypto'
import fetch from 'cross-fetch'
import { env } from '@/env'

type WebhookEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  timestamp: number
  data: {
    id: string
    email: string
    name?: string | null
    emailVerified?: boolean
    image?: string | null
    // Additional Better Auth fields
    username?: string | null
    displayUsername?: string | null
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

/**
 * Send webhook to Payload CMS
 * @returns true if successful, false otherwise (logs error but doesn't throw)
 */
export async function sendPayloadWebhook(event: WebhookEvent): Promise<boolean> {
  const webhookUrl = env.PAYLOAD_WEBHOOK_URL
  const webhookSecret = env.PAYLOAD_WEBHOOK_SECRET

  if (!webhookUrl || !webhookSecret) {
    console.warn('[webhook] PAYLOAD_WEBHOOK_URL or PAYLOAD_WEBHOOK_SECRET not configured')
    return false
  }

  try {
    const payload = JSON.stringify(event)
    const signature = generateSignature(payload, webhookSecret)

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': crypto.randomUUID(),
        'X-Webhook-Timestamp': event.timestamp.toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      console.error(
        `[webhook] Payload webhook failed (${response.status}): ${errorText}`,
        { event: event.type, userId: event.data.id }
      )
      return false
    }

    console.log(`[webhook] Payload webhook sent successfully`, {
      event: event.type,
      userId: event.data.id,
    })
    return true
  } catch (error) {
    console.error('[webhook] Payload webhook error:', error, {
      event: event.type,
      userId: event.data.id,
    })
    return false
  }
}
```

#### 2. Configure Database Hooks

**File**: `src/lib/auth.ts` (update existing file in Better Auth repo)

```typescript
import { betterAuth } from 'better-auth'
import { sendPayloadWebhook } from '@/lib/webhooks/payload'

export const auth = betterAuth({
  // ... existing config
  databaseHooks: {
    user: {
      create: {
        async after(user, context) {
          // Send webhook after user created in Better Auth
          await sendPayloadWebhook({
            type: 'user.created',
            timestamp: Date.now(),
            data: {
              id: user.id,
              email: user.email,
              name: user.name || null,
              emailVerified: user.emailVerified || false,
              image: user.image || null,
              username: (user as any).username || null,
              displayUsername: (user as any).displayUsername || null,
            },
          })
          // Don't throw errors - webhook failures shouldn't block user creation
        },
      },
      update: {
        async after(user, context) {
          // Send webhook after user updated in Better Auth
          await sendPayloadWebhook({
            type: 'user.updated',
            timestamp: Date.now(),
            data: {
              id: user.id,
              email: user.email,
              name: user.name || null,
              emailVerified: user.emailVerified || false,
              image: user.image || null,
              username: (user as any).username || null,
              displayUsername: (user as any).displayUsername || null,
            },
          })
        },
      },
      delete: {
        async after(user, context) {
          // Send webhook after user deleted in Better Auth
          await sendPayloadWebhook({
            type: 'user.deleted',
            timestamp: Date.now(),
            data: {
              id: user.id,
              email: user.email,
              name: user.name || null,
            },
          })
        },
      },
    },
  },
})
```

#### 3. Environment Variables

**File**: `.env` (Better Auth repo)

```bash
# Payload CMS webhook configuration
PAYLOAD_WEBHOOK_URL=https://payload.example.com/api/webhooks/better-auth
PAYLOAD_WEBHOOK_SECRET=<shared-secret-32-chars-minimum>
```

#### 4. Environment Schema

**File**: `src/env.ts` (update existing file in Better Auth repo)

```typescript
import { z } from 'zod'

const serverSchema = z.object({
  // ... existing vars
  PAYLOAD_WEBHOOK_URL: z.string().url().optional(),
  PAYLOAD_WEBHOOK_SECRET: z.string().min(32).optional(),
})
```

---

## Part 2: Payload → Better Auth Webhooks

### Overview

PayloadCMS provides collection hooks (`beforeChange`, `afterChange`, `afterDelete`) that we'll use to send webhooks to Better Auth when users are modified in Payload.

### Implementation in Payload CMS

#### 1. Webhook Client Module

**File**: `src/lib/betterAuth/webhooks.ts` (in Payload repo)

```typescript
import crypto from 'node:crypto'
import fetch from 'cross-fetch'

type WebhookEvent = {
  type: 'user.updated' | 'user.deleted'
  timestamp: number
  data: {
    betterAuthUserId: string
    email?: string
    fullName?: string
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}

/**
 * Send webhook to Better Auth
 * @returns true if successful, false otherwise (logs error but doesn't throw)
 */
export async function sendBetterAuthWebhook(event: WebhookEvent): Promise<boolean> {
  const webhookUrl = process.env.BETTER_AUTH_WEBHOOK_URL
  const webhookSecret = process.env.BETTER_AUTH_WEBHOOK_SECRET

  if (!webhookUrl || !webhookSecret) {
    console.warn('[webhook] BETTER_AUTH_WEBHOOK_URL or BETTER_AUTH_WEBHOOK_SECRET not configured')
    return false
  }

  try {
    const payload = JSON.stringify(event)
    const signature = generateSignature(payload, webhookSecret)

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-ID': crypto.randomUUID(),
        'X-Webhook-Timestamp': event.timestamp.toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText)
      console.error(
        `[webhook] Better Auth webhook failed (${response.status}): ${errorText}`,
        { event: event.type, userId: event.data.betterAuthUserId }
      )
      return false
    }

    console.log(`[webhook] Better Auth webhook sent successfully`, {
      event: event.type,
      userId: event.data.betterAuthUserId,
    })
    return true
  } catch (error) {
    console.error('[webhook] Better Auth webhook error:', error, {
      event: event.type,
      userId: event.data.betterAuthUserId,
    })
    return false
  }
}
```

#### 2. Update Users Collection Hooks

**File**: `src/collections/Users.ts` (update existing file in Payload repo)

```typescript
import { sendBetterAuthWebhook } from '../lib/betterAuth/webhooks'

export const Users: CollectionConfig = {
  // ... existing config
  hooks: {
    // ... existing beforeValidate, beforeChange hooks
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // Only sync updates (creates are handled by beforeChange -> signUpBetterAuthUser)
        if (operation !== 'update') {
          return doc
        }

        if (!doc.betterAuthUserId) {
          return doc
        }

        // Detect changes to sync-worthy fields
        const emailChanged = doc.email !== previousDoc.email
        const nameChanged = doc.fullName !== previousDoc.fullName

        if (emailChanged || nameChanged) {
          const success = await sendBetterAuthWebhook({
            type: 'user.updated',
            timestamp: Date.now(),
            data: {
              betterAuthUserId: doc.betterAuthUserId,
              email: emailChanged ? doc.email : undefined,
              fullName: nameChanged ? doc.fullName : undefined,
            },
          })

          if (success) {
            req.payload.logger.info(
              `Webhook sent to Better Auth for user ${doc.id} (${doc.email})`
            )
          } else {
            req.payload.logger.warn(
              `Failed to send webhook to Better Auth for user ${doc.id} (${doc.email})`
            )
          }
        }

        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        if (!doc.betterAuthUserId) {
          return
        }

        const success = await sendBetterAuthWebhook({
          type: 'user.deleted',
          timestamp: Date.now(),
          data: {
            betterAuthUserId: doc.betterAuthUserId,
          },
        })

        if (success) {
          req.payload.logger.info(
            `Webhook sent to Better Auth for deleted user ${doc.id} (${doc.email})`
          )
        } else {
          req.payload.logger.warn(
            `Failed to send webhook to Better Auth for deleted user ${doc.id} (${doc.email})`
          )
        }
      },
    ],
  },
}
```

---

## Part 3: Webhook Receivers

### Better Auth Webhook Receiver

**File**: `src/app/api/webhooks/payload/route.ts` (in Better Auth repo)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { user as userSchema } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { env } from '@/env'

type PayloadWebhookEvent = {
  type: 'user.updated' | 'user.deleted'
  timestamp: number
  data: {
    betterAuthUserId: string
    email?: string
    fullName?: string
  }
}

/**
 * Verify HMAC signature
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const signature = request.headers.get('x-webhook-signature')
    const timestamp = request.headers.get('x-webhook-timestamp')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const webhookSecret = env.BETTER_AUTH_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[webhook] BETTER_AUTH_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const body = await request.text()
    const isValid = verifySignature(body, signature, webhookSecret)

    if (!isValid) {
      console.warn('[webhook] Invalid signature from Payload')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Check timestamp (reject if > 5 minutes old)
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      if (age > 5 * 60 * 1000) {
        return NextResponse.json({ error: 'Webhook expired' }, { status: 400 })
      }
    }

    const event: PayloadWebhookEvent = JSON.parse(body)

    // Handle event
    switch (event.type) {
      case 'user.updated':
        await handleUserUpdated(event.data)
        break
      case 'user.deleted':
        await handleUserDeleted(event.data)
        break
      default:
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[webhook] Error processing Payload webhook:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

async function handleUserUpdated(data: PayloadWebhookEvent['data']) {
  const updates: Record<string, any> = {}

  if (data.email) {
    updates.email = data.email
  }

  if (data.fullName) {
    updates.name = data.fullName
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date()

    await db
      .update(userSchema)
      .set(updates)
      .where(eq(userSchema.id, data.betterAuthUserId))

    console.log(`[webhook] Updated Better Auth user ${data.betterAuthUserId}`, updates)
  }
}

async function handleUserDeleted(data: PayloadWebhookEvent['data']) {
  // Option 1: Soft delete (mark as deleted)
  // await db
  //   .update(userSchema)
  //   .set({ emailVerified: false, updatedAt: new Date() })
  //   .where(eq(userSchema.id, data.betterAuthUserId))

  // Option 2: Hard delete (remove from database)
  // Note: This will cascade delete sessions, accounts, etc.
  await db.delete(userSchema).where(eq(userSchema.id, data.betterAuthUserId))

  console.log(`[webhook] Deleted Better Auth user ${data.betterAuthUserId}`)
}
```

### Payload CMS Webhook Receiver

**File**: `src/app/(payload)/api/webhooks/better-auth/route.ts` (in Payload repo)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'

type BetterAuthWebhookEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  timestamp: number
  data: {
    id: string
    email: string
    name?: string | null
    emailVerified?: boolean
    image?: string | null
    username?: string | null
    displayUsername?: string | null
  }
}

/**
 * Verify HMAC signature
 */
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config })

  try {
    // Verify webhook secret
    const signature = request.headers.get('x-webhook-signature')
    const timestamp = request.headers.get('x-webhook-timestamp')

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    const webhookSecret = process.env.BETTER_AUTH_WEBHOOK_SECRET
    if (!webhookSecret) {
      payload.logger.error('[webhook] BETTER_AUTH_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const body = await request.text()
    const isValid = verifySignature(body, signature, webhookSecret)

    if (!isValid) {
      payload.logger.warn('[webhook] Invalid signature from Better Auth')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Check timestamp (reject if > 5 minutes old)
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10)
      if (age > 5 * 60 * 1000) {
        return NextResponse.json({ error: 'Webhook expired' }, { status: 400 })
      }
    }

    const event: BetterAuthWebhookEvent = JSON.parse(body)

    // Handle event
    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event.data, payload)
        break
      case 'user.updated':
        await handleUserUpdated(event.data, payload)
        break
      case 'user.deleted':
        await handleUserDeleted(event.data, payload)
        break
      default:
        return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    payload.logger.error('[webhook] Error processing Better Auth webhook:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

async function handleUserCreated(
  data: BetterAuthWebhookEvent['data'],
  payload: any
) {
  // Check if user already exists
  const existingUser = await payload.find({
    collection: 'users',
    where: {
      betterAuthUserId: {
        equals: data.id,
      },
    },
    limit: 1,
    depth: 0,
  })

  if (existingUser.docs.length > 0) {
    payload.logger.warn(`[webhook] User ${data.id} already exists, skipping creation`)
    return
  }

  // Create user in Payload
  await payload.create({
    collection: 'users',
    data: {
      email: data.email,
      fullName: data.name || data.email,
      betterAuthUserId: data.id,
      role: 'user',
    },
    overrideAccess: true,
    depth: 0,
  })

  payload.logger.info(`[webhook] Created Payload user for Better Auth user ${data.id}`)
}

async function handleUserUpdated(
  data: BetterAuthWebhookEvent['data'],
  payload: any
) {
  const existingUser = await payload.find({
    collection: 'users',
    where: {
      betterAuthUserId: {
        equals: data.id,
      },
    },
    limit: 1,
    depth: 0,
  })

  if (existingUser.docs.length === 0) {
    payload.logger.warn(`[webhook] User ${data.id} not found in Payload, cannot update`)
    return
  }

  const user = existingUser.docs[0]
  const updates: any = {}

  // Only update if values differ
  if (data.email && data.email !== user.email) {
    updates.email = data.email
  }

  if (data.name && data.name !== user.fullName) {
    updates.fullName = data.name
  }

  if (Object.keys(updates).length > 0) {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: updates,
      overrideAccess: true,
      depth: 0,
    })

    payload.logger.info(`[webhook] Updated Payload user ${user.id} from Better Auth`, updates)
  }
}

async function handleUserDeleted(
  data: BetterAuthWebhookEvent['data'],
  payload: any
) {
  const existingUser = await payload.find({
    collection: 'users',
    where: {
      betterAuthUserId: {
        equals: data.id,
      },
    },
    limit: 1,
    depth: 0,
  })

  if (existingUser.docs.length === 0) {
    payload.logger.warn(`[webhook] User ${data.id} not found in Payload, cannot delete`)
    return
  }

  const user = existingUser.docs[0]

  // Delete user from Payload
  await payload.delete({
    collection: 'users',
    id: user.id,
    overrideAccess: true,
  })

  payload.logger.info(`[webhook] Deleted Payload user ${user.id} from Better Auth webhook`)
}
```

---

## Environment Configuration

### Better Auth `.env`

```bash
# Webhook receiving (from Payload)
BETTER_AUTH_WEBHOOK_SECRET=<shared-secret-32-chars-minimum>

# Webhook sending (to Payload)
PAYLOAD_WEBHOOK_URL=https://payload.example.com/api/webhooks/better-auth
PAYLOAD_WEBHOOK_SECRET=<shared-secret-32-chars-minimum>
```

### Payload `.env`

```bash
# Webhook receiving (from Better Auth)
BETTER_AUTH_WEBHOOK_SECRET=<shared-secret-32-chars-minimum>

# Webhook sending (to Better Auth)
BETTER_AUTH_WEBHOOK_URL=https://auth.example.com/api/webhooks/payload
BETTER_AUTH_WEBHOOK_SECRET=<shared-secret-32-chars-minimum>
```

**Note**: Use the **same secret** for bidirectional communication per direction:
- `BETTER_AUTH_WEBHOOK_SECRET` - Used by Payload to verify Better Auth webhooks AND by Better Auth to verify Payload webhooks
- Or use separate secrets if you want directional isolation

---

## Security Considerations

### 1. Signature Verification
- ✅ HMAC-SHA256 with shared secret
- ✅ Timing-safe comparison to prevent timing attacks
- ✅ Timestamp validation (5-minute window)

### 2. Secrets Management
- ✅ Minimum 32-character secrets
- ✅ Store in environment variables
- ✅ Rotate periodically

### 3. Webhook Safety
- ✅ Idempotent operations (safe to retry)
- ✅ Timeout handling (10s max)
- ✅ Error logging but non-blocking
- ✅ Override access controls (`overrideAccess: true`)

### 4. Replay Attack Prevention
- ✅ Unique webhook IDs
- ✅ Timestamp validation
- ✅ Optional: Store processed webhook IDs for deduplication

---

## Testing Strategy

### Unit Tests

```typescript
// tests/webhooks/signature.test.ts
describe('Webhook Signatures', () => {
  test('generates valid signature', () => {
    const payload = JSON.stringify({ test: 'data' })
    const secret = 'test-secret-32-characters-long'
    const signature = generateSignature(payload, secret)
    expect(verifySignature(payload, signature, secret)).toBe(true)
  })

  test('rejects invalid signature', () => {
    const payload = JSON.stringify({ test: 'data' })
    const signature = 'invalid-signature'
    const secret = 'test-secret-32-characters-long'
    expect(verifySignature(payload, signature, secret)).toBe(false)
  })

  test('rejects expired timestamps', () => {
    const timestamp = Date.now() - (6 * 60 * 1000) // 6 minutes ago
    const age = Date.now() - timestamp
    expect(age > 5 * 60 * 1000).toBe(true)
  })
})
```

### Integration Tests

```typescript
// tests/webhooks/integration.test.ts
describe('Webhook Integration', () => {
  test('Better Auth user.created → Payload creates user', async () => {
    // 1. Create user in Better Auth
    // 2. Verify webhook sent
    // 3. Verify user created in Payload
  })

  test('Payload user.updated → Better Auth updates user', async () => {
    // 1. Update user in Payload
    // 2. Verify webhook sent
    // 3. Verify user updated in Better Auth
  })

  test('Payload user.deleted → Better Auth deletes user', async () => {
    // 1. Delete user in Payload
    // 2. Verify webhook sent
    // 3. Verify user deleted in Better Auth
  })
})
```

### Manual Testing

```bash
# Test Better Auth → Payload webhook
curl -X POST https://payload.example.com/api/webhooks/better-auth \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <computed-signature>" \
  -H "X-Webhook-ID: $(uuidgen)" \
  -H "X-Webhook-Timestamp: $(date +%s)000" \
  -d '{
    "type": "user.updated",
    "timestamp": 1730000000000,
    "data": {
      "id": "better-auth-user-id",
      "email": "test@example.com",
      "name": "Test User"
    }
  }'

# Test Payload → Better Auth webhook
curl -X POST https://auth.example.com/api/webhooks/payload \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: <computed-signature>" \
  -H "X-Webhook-ID: $(uuidgen)" \
  -H "X-Webhook-Timestamp: $(date +%s)000" \
  -d '{
    "type": "user.updated",
    "timestamp": 1730000000000,
    "data": {
      "betterAuthUserId": "better-auth-user-id",
      "email": "newemail@example.com",
      "fullName": "Updated Name"
    }
  }'
```

---

## Monitoring & Observability

### Metrics to Track

1. **Webhook Success Rate**
   - Track success/failure per webhook type
   - Alert if failure rate > 5%

2. **Webhook Latency**
   - Track time from trigger to completion
   - Alert if p95 > 3 seconds

3. **Signature Failures**
   - Track invalid signature attempts
   - Alert on spikes (potential attack)

4. **Sync Lag**
   - Track time between systems being in sync
   - Alert if lag > 10 seconds

### Logging

```typescript
// Example structured log
console.log(JSON.stringify({
  level: 'info',
  type: 'webhook',
  direction: 'outgoing',
  event: 'user.updated',
  userId: 'user-id',
  success: true,
  latency: 234,
  timestamp: Date.now(),
}))
```

---

## Deployment Checklist

### Better Auth Repository

- [ ] Add `src/lib/webhooks/payload.ts`
- [ ] Update `src/lib/auth.ts` with database hooks
- [ ] Add `src/app/api/webhooks/payload/route.ts`
- [ ] Update `src/env.ts` with webhook vars
- [ ] Add environment variables to Vercel/hosting
- [ ] Test webhook signing/verification
- [ ] Deploy to staging
- [ ] Verify webhooks in logs

### Payload Repository

- [ ] Add `src/lib/betterAuth/webhooks.ts`
- [ ] Update `src/collections/Users.ts` with hooks
- [ ] Add `src/app/(payload)/api/webhooks/better-auth/route.ts`
- [ ] Add environment variables
- [ ] Test webhook signing/verification
- [ ] Deploy to staging
- [ ] Verify webhooks in logs

### Testing

- [ ] Create user in Better Auth → Verify in Payload
- [ ] Create user in Payload → Verify in Better Auth
- [ ] Update user in Better Auth → Verify in Payload
- [ ] Update user in Payload → Verify in Better Auth
- [ ] Delete user in Better Auth → Verify in Payload
- [ ] Delete user in Payload → Verify in Better Auth
- [ ] Test webhook failure handling
- [ ] Test invalid signatures
- [ ] Test expired timestamps

---

## Future Enhancements

### 1. Retry Queue
Implement exponential backoff retry for failed webhooks:
```typescript
// Use a queue system like BullMQ or Inngest
await queue.add('webhook', event, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
})
```

### 2. Webhook Replay Protection
Store processed webhook IDs to prevent replay attacks:
```typescript
const processedWebhooks = new Set<string>()
if (processedWebhooks.has(webhookId)) {
  return NextResponse.json({ error: 'Already processed' }, { status: 200 })
}
```

### 3. Batch Updates
Group multiple updates into single webhook payload:
```typescript
type BatchWebhookEvent = {
  type: 'users.batch_updated'
  updates: Array<{id: string, changes: {...}}>
}
```

### 4. Field-Level Sync Control
Configure which fields sync in each direction:
```typescript
const syncConfig = {
  betterAuth: ['email', 'name', 'emailVerified'],
  payload: ['email', 'fullName', 'avatar']
}
```

---

## Conclusion

This webhook-based synchronization strategy provides:

✅ **Bidirectional sync** between Better Auth and Payload  
✅ **Event-driven** updates (no polling)  
✅ **Secure** via HMAC signature verification  
✅ **Fail-safe** with comprehensive error handling  
✅ **Transactional** using Better Auth's database hooks  
✅ **Observable** with structured logging  

Next steps:
1. Implement webhook clients in both repos
2. Add webhook receivers in both repos
3. Configure environment variables
4. Deploy to staging and test
5. Monitor logs and metrics
6. Deploy to production

