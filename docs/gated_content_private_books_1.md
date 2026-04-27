# Gated Content — Private Books and Chapter Lock (Phase 1)

> **Revised document.** This version is grounded in the actual source code of all three repos:
> - **`payloadcms`** (this repo) — PayloadCMS 3.60 + Next.js 15, Turso/SQLite, Cloudflare R2
> - **`auther`** ([github.com/quanghuy1242/auther](https://github.com/quanghuy1242/auther)) — Better Auth + ReBAC engine, Next.js 15 App Router, Drizzle/SQLite
> - **`next-blog`** ([github.com/quanghuy1242/next-blog](https://github.com/quanghuy1242/next-blog)) — Next.js Pages Router blog frontend

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Feature A: Private Books](#feature-a-private-books)
   - [A.1 payloadcms — Data Model](#a1-payloadcms--data-model)
   - [A.2 payloadcms — Access Rules](#a2-payloadcms--access-rules)
   - [A.3 payloadcms — Admin Access Panel](#a3-payloadcms--admin-access-panel)
   - [A.4 payloadcms — API Proxy Route](#a4-payloadcms--api-proxy-route)
   - [A.5 auther — Book Entity Type Registration](#a5-auther--book-entity-type-registration)
   - [A.6 auther — Grant Management HTTP Endpoint](#a6-auther--grant-management-http-endpoint)
   - [A.7 next-blog — Types and Query Changes](#a7-next-blog--types-and-query-changes)
   - [A.8 next-blog — Session Cookie Forwarding](#a8-next-blog--session-cookie-forwarding)
    - [A.9 payloadcms — Token-aware Book Read Access](#a9-payloadcms--token-aware-book-read-access)
   - [A.10 next-blog — Books Listing Page](#a10-next-blog--books-listing-page)
   - [A.11 next-blog — Book Detail Page](#a11-next-blog--book-detail-page)
   - [A.12 next-blog — Chapter Page](#a12-next-blog--chapter-page)
   - [A.13 next-blog — Locked State Components](#a13-next-blog--locked-state-components)
3. [Feature B: Chapter Password Lock](#feature-b-chapter-password-lock)
  - [B.1 payloadcms — Password Hash Storage](#b1-payloadcms--password-hash-storage)
  - [B.2 payloadcms — GraphQL Unlock and Content Gate](#b2-payloadcms--graphql-unlock-and-content-gate)
  - [B.3 payloadcms — Admin UI for Set / Change / Clear](#b3-payloadcms--admin-ui-for-set--change--clear)
  - [B.4 next-blog — Password Gate Flow](#b4-next-blog--password-gate-flow)
  - [B.5 edge cases and invariants](#b5-edge-cases-and-invariants)
4. [Environment Variables](#4-environment-variables)
5. [Deployment Order](#5-deployment-order)
6. [Checklists per Repo](#6-checklists-per-repo)

---

## 1. Architecture Overview

```
Browser
  │
  ├─► blog.quanghuy.dev (next-blog, Pages Router)
  │     │  getServerSideProps reads cookie "better-auth.session_token"
  │     │  from req.cookies (set by Auther on domain ".quanghuy.dev")
  │     │
  │     ├─► payload.quanghuy.dev/api/graphql  (payloadcms)
  │     │     Static PAYLOAD_API_KEY — returns all books incl. private
  │     │
  │     └─► auth.quanghuy.dev/api/auth/check-permission  (auther)
  │           Authorization: Bearer <session_token>
  │           Body: { entityType:"client_<payloadClientId>:book", entityId:"<payloadBookId>", permission:"view" }
  │           Response: { allowed: true|false, ... }
  │
  └─► payload.quanghuy.dev/admin (payloadcms admin)
        BookAccessPanel component
          │
          └─► payload.quanghuy.dev/api/books/[id]/access  (proxy route)
                x-api-key: AUTHER_API_KEY
                  │
                  └─► auth.quanghuy.dev/api/internal/clients/<payloadClientId>/grants  (auther, new endpoint)
```

**Key design constraints discovered from reading the repos:**

1. `check-permission` at Auther identifies the subject entirely from the `Authorization: Bearer` header — there is no `subjectType`/`subjectId` in the request body. The body only contains `entityType`, `entityId`, `permission`, and optional `resource` context.
2. Auther's `src/app/api/internal/` currently contains only `cleanup-traces`, `queues`, and `rotate-jwks` — no grant-management HTTP endpoint exists. One must be added.
3. Auther's existing `grantScopedPermission()` server action in `src/app/admin/clients/[id]/access/actions.ts` shows the correct tuple shape: `entityType = "client_{clientId}:{entityTypeName}"`. For the book use-case this same namespaced shape must be used: `entityType = "client_{payloadClientId}:book"` with `entityId = "<payloadBookId>"`.
4. next-blog uses **Pages Router** (`pages/`), not App Router. All data fetching happens in `getServerSideProps`. Session cookies are read from `context.req.cookies`.
5. `common/apis/books.ts` uses a hardcoded `AUTHOR_ID = 1` filter in `createBooksWhere()`. This filter must be preserved; the `visibility` filter is additive.
6. The blog's `fetchAPI` in `common/apis/base.ts` uses a static API key. As long as the Payload admin API key belongs to an admin user, it bypasses the new `publicBooksReadAccess` rule and returns private books too — gating is enforced in `getServerSideProps`.

---

# Feature A: Private Books

---

### A.1 payloadcms — Data Model

**File:** `src/collections/Books.ts`

Add a `visibility` select field. The field goes in the sidebar. Existing books all default to `'public'`, so no data will break.

```ts
// Inside the fields array of Books.ts
{
  name: 'visibility',
  type: 'select',
  required: true,
  defaultValue: 'public',
  options: [
    { label: 'Public', value: 'public' },
    { label: 'Private', value: 'private' },
  ],
  admin: {
    position: 'sidebar',
    description: 'Private books are only visible to users with explicit access in Auther.',
  },
},
```

**Why no change to `Chapters.ts`:** Chapter visibility is derived entirely from the parent book. There is no per-chapter override for book-level privacy.

**Migration:** After adding the field, run:

```bash
# Set TURSO_* env vars in .env for accurate migration (see migration-env-checker skill)
pnpm payload migrate:create
# Commit both 20xx_xxx.ts and 20xx_xxx.json
```

**Regenerate types:**

```bash
pnpm generate:types
# src/payload-types.ts will now have visibility: 'public' | 'private' on the Book type
```

---

### A.2 payloadcms — Access Rules

**File:** `src/utils/access.ts`

The current `authenticatedAccess` function returns `true` for any logged-in user. We need two new functions:

**`publicBooksReadAccess`** — used on `Books.read`:

```ts
import type { Access } from 'payload'
import { isAdminUser, getUserId } from './access' // already in this file

export const publicBooksReadAccess: Access = ({ req }) => {
  // Admin always sees everything
  if (isAdminUser(req.user)) return true

  // No session: restrict to public published books only
  if (!req.user) {
    return {
      and: [
        { visibility: { equals: 'public' } },
        { _status: { equals: 'published' } },
      ],
    }
  }

  // Authenticated non-admin: public published OR books they created
  return {
    or: [
      {
        and: [
          { visibility: { equals: 'public' } },
          { _status: { equals: 'published' } },
        ],
      },
      { createdBy: { equals: req.user.id } },
    ],
  }
}
```

**`chaptersReadAccess`** — used on `Chapters.read`. Chapters inherit visibility from their parent book. If the `book.visibility` nested path filter causes a query error with the libSQL adapter, use the fallback hook approach noted below.

```ts
export const chaptersReadAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true

  if (!req.user) {
    return {
      and: [
        { 'book.visibility': { equals: 'public' } },
        { _status: { equals: 'published' } },
      ],
    }
  }

  return {
    or: [
      {
        and: [
          { 'book.visibility': { equals: 'public' } },
          { _status: { equals: 'published' } },
        ],
      },
      { createdBy: { equals: req.user.id } },
    ],
  }
}
```

> **Fallback if `book.visibility` nested filter fails:** Add a `beforeOperation: [filterPrivateBookChapters]` hook on `Chapters` that queries private book IDs from the DB and appends an `id: { not_in: [...] }` clause to `where`.

**Wire up in collections:**

```ts
// src/collections/Books.ts
import { publicBooksReadAccess } from '../utils/access'
access: {
  read: publicBooksReadAccess,
},
```

```ts
// src/collections/Chapters.ts
import { chaptersReadAccess } from '../utils/access'
access: {
  read: chaptersReadAccess,
},
```

**Why the viewer token should be forwarded instead:** the blog should not make a separate permission decision. It should forward the Better Auth session token to Payload, let the Better Auth strategy map that token into `req.user`, and let the Payload read helper decide whether the response should contain public books only or public plus Auther-granted private books.

---

### A.3 payloadcms — Admin Access Panel

**Purpose:** Allow the admin to grant/revoke reader access to a private book directly from the Payload book editor — without navigating to Auther's admin UI.

**File:** `src/components/admin/books/BookAccessPanel.tsx`

This is a browser-only React component. Follow the existing `'use client'` pattern used elsewhere in `src/components/admin/`.

```tsx
'use client'
import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

interface GrantEntry {
  tupleId: string
  userId: string
  userEmail: string
  relation: string
}

export function BookAccessPanel() {
  const { id, data } = useDocumentInfo()
  const [grants, setGrants] = useState<GrantEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isPrivate = data?.visibility === 'private'

  useEffect(() => {
    if (!isPrivate || !id) return
    setLoading(true)
    fetch(`/api/books/${id}/access`)
      .then((r) => r.json())
      .then((d) => setGrants(d.grants ?? []))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id, isPrivate])

  if (!isPrivate) return null

  async function handleGrant() {
    setError(null)
    const res = await fetch(`/api/books/${id}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput, relation: 'reader' }),
    })
    if (!res.ok) {
      setError((await res.json()).error ?? 'Failed to grant access')
      return
    }
    setEmailInput('')
    const updated = await fetch(`/api/books/${id}/access`).then((r) => r.json())
    setGrants(updated.grants ?? [])
  }

  async function handleRevoke(tupleId: string) {
    await fetch(`/api/books/${id}/access`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tupleId }),
    })
    setGrants((prev) => prev.filter((g) => g.tupleId !== tupleId))
  }

  return (
    <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <h4 style={{ marginBottom: '0.5rem' }}>Book Access</h4>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead><tr><th>User</th><th>Relation</th><th></th></tr></thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.tupleId}>
              <td>{g.userEmail}</td>
              <td>{g.relation}</td>
              <td><button onClick={() => handleRevoke(g.tupleId)}>Revoke</button></td>
            </tr>
          ))}
          {grants.length === 0 && !loading && (
            <tr><td colSpan={3} style={{ color: '#aaa' }}>No users have been granted access.</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem' }}>
        <input
          type="email"
          placeholder="User email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc' }}
        />
        <button onClick={handleGrant}>Grant reader</button>
      </div>
    </div>
  )
}
```

**Register in `src/collections/Books.ts`:**

```ts
admin: {
  components: {
    edit: {
      beforeDocumentControls: [
        // existing controls...
        '/components/admin/books/BookAccessPanel',
      ],
    },
  },
},
```

**Important:** `useDocumentInfo()` is imported from `@payloadcms/ui`. Do not remove any existing `// @ts-ignore` comments if the import triggers type errors.

---

### A.4 payloadcms — API Proxy Route

This route is called by `BookAccessPanel`. It proxies grant/revoke/list operations to Auther, authenticating with `AUTHER_API_KEY` (a service-level API key, not a user session token) and reusing the existing Better Auth `PAYLOAD_CLIENT_ID` for the scoped entity type.

**File:** `src/app/api/books/[id]/access/route.ts`

```ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { getAutherBaseUrl, getAutherApiKey } from '@/lib/env'
import { getPayloadClientId } from '@/lib/betterAuth/env'

async function requireAdmin() {
  const payload = await getPayload({ config: configPromise })
  const hdrs = await headers()
  const { user } = await payload.auth({ headers: hdrs })
  if (!user || user.role !== 'admin') return null
  return user
}

// GET /api/books/[id]/access — list who has access
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!await requireAdmin()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const res = await fetch(
    `${getAutherBaseUrl()}/api/internal/clients/${getPayloadClientId()}/grants?entityTypeName=book&entityId=${params.id}`,
    { headers: { 'x-api-key': getAutherApiKey() } }
  )
  if (!res.ok) return Response.json({ error: 'Auther error' }, { status: 502 })
  return Response.json(await res.json())
}

// POST /api/books/[id]/access — grant access to a user by email
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!await requireAdmin()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json() as { email: string; relation: string }
  if (!body.email || !body.relation) {
    return Response.json({ error: 'email and relation are required' }, { status: 400 })
  }
  const res = await fetch(`${getAutherBaseUrl()}/api/internal/clients/${getPayloadClientId()}/grants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': getAutherApiKey() },
    body: JSON.stringify({
      entityTypeName: 'book',
      entityId: params.id,
      relation: body.relation,
      subjectType: 'user',
      subjectEmail: body.email,
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    return Response.json({ error: errBody.error ?? 'Auther error' }, { status: 502 })
  }
  return Response.json({ ok: true })
}

// DELETE /api/books/[id]/access — revoke a specific tuple
export async function DELETE(req: Request) {
  if (!await requireAdmin()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json() as { tupleId: string }
  if (!body.tupleId) {
    return Response.json({ error: 'tupleId is required' }, { status: 400 })
  }
  const res = await fetch(`${getAutherBaseUrl()}/api/internal/clients/${getPayloadClientId()}/grants/${body.tupleId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': getAutherApiKey() },
  })
  if (!res.ok) return Response.json({ error: 'Auther error' }, { status: 502 })
  return Response.json({ ok: true })
}
```

**Use the existing `getPayloadClientId` from `src/lib/betterAuth/env.ts`. `src/lib/env.ts` only needs `getAutherBaseUrl` and `getAutherApiKey` for this feature.**

```ts
// src/lib/env.ts — append to bottom

let cachedAutherBaseUrl: string | undefined
export const getAutherBaseUrl = (): string => {
  if (cachedAutherBaseUrl !== undefined) return cachedAutherBaseUrl
  const value = process.env.AUTHER_BASE_URL
  if (!value) throw new Error('AUTHER_BASE_URL is not set')
  cachedAutherBaseUrl = value.replace(/\/+$/, '')
  return cachedAutherBaseUrl
}

let cachedAutherApiKey: string | undefined
export const getAutherApiKey = (): string => {
  if (cachedAutherApiKey !== undefined) return cachedAutherApiKey
  const value = process.env.AUTHER_API_KEY
  if (!value) throw new Error('AUTHER_API_KEY is not set')
  cachedAutherApiKey = value
  return cachedAutherApiKey
}

```

> **Security note:** `requireAdmin()` validates the Payload session from the request headers, so only Payload admins can call this proxy. `AUTHER_API_KEY` is used server-to-server only and is never exposed to the browser. `PAYLOAD_CLIENT_ID` is resolved server-side through Better Auth and never accepted from browser input.

---

### A.5 auther — Book Entity Type Registration

**What needs to happen:** The `authorization_models` table must contain a row for the client-scoped book type before any `check-permission` call will work for books:

- `entityType = "client_{PAYLOAD_CLIENT_ID}:book"`

Do not register a global plain `book` type for this feature. `PermissionService.checkPermission()` returns `false` (logs "No authorization model found") if the scoped type is missing.

**One-time setup:**
1. Log in to Auther admin at `auth.quanghuy.dev/admin`
2. Navigate to **Access Control** → **Authorization Models**
3. Click **Add Model** → JSON mode → paste:

```json
{
  "entityType": "client_<PAYLOAD_CLIENT_ID>:book",
  "description": "Reader-level access for gated books",
  "definition": {
    "relations": {
      "owner": { "union": ["editor"] },
      "editor": { "union": ["reader"] },
      "reader": []
    },
    "permissions": {
      "view": { "relation": "reader" },
      "edit": { "relation": "editor" },
      "manage_access": { "relation": "owner" }
    }
  }
}
```

> `PAYLOAD_CLIENT_ID` above is the OAuth client ID used by Payload Admin in Auther.

**Hierarchy meaning:**
- `owner` implies `editor` implies `reader`
- Granting `reader` → `view` permission only
- Granting `owner` → `view` + `edit` + `manage_access`

**How the check works:** `POST /api/auth/check-permission` with `{ entityType:"client_<PAYLOAD_CLIENT_ID>:book", entityId:"42", permission:"view" }` and `Authorization: Bearer <token>`:
1. Loads the `client_<PAYLOAD_CLIENT_ID>:book` model from `authorization_models`
2. Resolves `permission:"view"` → `requiredRelation:"reader"`
3. Expands implied relations: `reader`, `editor`, `owner`
4. Queries `access_tuples` for `entityType="client_<PAYLOAD_CLIENT_ID>:book"`, `entityId="42"`, `relation IN (...)`, `subjectType="user"`, `subjectId=<from token>`
5. Returns `{ allowed: true }` if any match

---

### A.6 auther — Grant Management HTTP Endpoint

**Problem:** The Payload proxy route (A.4) needs HTTP endpoints to list, create, and delete ReBAC tuples for books. These endpoints must be restricted to the caller's own client namespace and must never trust raw `entityType` from request input.

**New files to create in Auther:**

**`src/app/api/internal/clients/[clientId]/grants/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { TupleRepository } from '@/lib/repositories/tuple-repository'
import { authorizationModelRepository } from '@/lib/repositories'
import { db } from '@/lib/db'
import { user as userTable } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { accessTuples } from '@/db/rebac-schema'
import { env } from '@/env'

function requireInternalApiKey(req: NextRequest): boolean {
  return req.headers.get('x-api-key') === env.INTERNAL_API_KEY
}

function isAllowedClientScope(clientId: string): boolean {
  // For this feature, Payload Admin is the only allowed caller scope.
  return clientId === env.PAYLOAD_CLIENT_ID
}

function buildScopedEntityType(clientId: string, entityTypeName: string): string {
  return `client_${clientId}:${entityTypeName}`
}

// GET ?entityTypeName=book&entityId=42 — list tuples in caller's client scope only
export async function GET(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAllowedClientScope(params.clientId)) {
    return NextResponse.json({ error: 'Forbidden client scope' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const entityTypeName = searchParams.get('entityTypeName')
  const entityId = searchParams.get('entityId')
  if (!entityTypeName || !entityId) {
    return NextResponse.json({ error: 'entityTypeName and entityId are required' }, { status: 400 })
  }

  const entityType = buildScopedEntityType(params.clientId, entityTypeName)

  const tuples = await db
    .select()
    .from(accessTuples)
    .where(and(eq(accessTuples.entityType, entityType), eq(accessTuples.entityId, entityId)))

  const grants = await Promise.all(
    tuples.map(async (t) => {
      let userEmail = t.subjectId
      if (t.subjectType === 'user') {
        const [u] = await db
          .select({ email: userTable.email })
          .from(userTable)
          .where(eq(userTable.id, t.subjectId))
        userEmail = u?.email ?? t.subjectId
      }
      return { tupleId: t.id, userId: t.subjectId, userEmail, relation: t.relation }
    })
  )
  return NextResponse.json({ grants })
}

// POST — grant a relation in caller's client scope only
export async function POST(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAllowedClientScope(params.clientId)) {
    return NextResponse.json({ error: 'Forbidden client scope' }, { status: 403 })
  }

  const body = await req.json() as {
    entityTypeName: string; entityId: string; relation: string
    subjectType: 'user' | 'apikey'; subjectId?: string; subjectEmail?: string
  }
  const { entityTypeName, entityId, relation, subjectType } = body
  if (!entityTypeName || !entityId || !relation || !subjectType) {
    return NextResponse.json({ error: 'entityTypeName, entityId, relation, subjectType required' }, { status: 400 })
  }

  const entityType = buildScopedEntityType(params.clientId, entityTypeName)

  // Resolve email → user ID
  let subjectId = body.subjectId
  if (!subjectId && body.subjectEmail && subjectType === 'user') {
    const [u] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, body.subjectEmail))
    if (!u) return NextResponse.json({ error: `No user: ${body.subjectEmail}` }, { status: 404 })
    subjectId = u.id
  }
  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId or subjectEmail required' }, { status: 400 })
  }

  // Validate relation exists in model
  const model = await authorizationModelRepository.findByEntityType(entityType)
  if (!model) return NextResponse.json({ error: `No model for: ${entityType}` }, { status: 400 })
  const def = model.definition as { relations: Record<string, unknown> }
  if (!def.relations[relation]) {
    return NextResponse.json({ error: `Unknown relation: ${relation}` }, { status: 400 })
  }

  const tupleRepo = new TupleRepository()
  const { created } = await tupleRepo.createIfNotExists({
    entityType, entityTypeId: model.id, entityId, relation, subjectType, subjectId,
  })
  return NextResponse.json({ ok: true, created })
}
```

**`src/app/api/internal/clients/[clientId]/grants/[tupleId]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { TupleRepository } from '@/lib/repositories/tuple-repository'
import { env } from '@/env'

function requireInternalApiKey(req: NextRequest): boolean {
  return req.headers.get('x-api-key') === env.INTERNAL_API_KEY
}

function isAllowedClientScope(clientId: string): boolean {
  return clientId === env.PAYLOAD_CLIENT_ID
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { clientId: string; tupleId: string } }
) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAllowedClientScope(params.clientId)) {
    return NextResponse.json({ error: 'Forbidden client scope' }, { status: 403 })
  }

  const tupleRepo = new TupleRepository()
  const tuple = await tupleRepo.findById(params.tupleId)
  if (!tuple) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Enforce namespace ownership before delete
  if (!tuple.entityType.startsWith(`client_${params.clientId}:`)) {
    return NextResponse.json({ error: 'Tuple outside client scope' }, { status: 403 })
  }

  await tupleRepo.deleteById(params.tupleId)
  return NextResponse.json({ ok: true })
}
```

**Scope invariants for A.6:**

1. Never accept raw `entityType` from caller input.
2. Always derive full entity type server-side as `client_${clientId}:${entityTypeName}`.
3. Always enforce client namespace ownership on read, create, and delete paths.
4. Reject any tuple deletion where tuple namespace does not match the route client scope.

**Add `INTERNAL_API_KEY` to `src/env.ts` in Auther** (Zod schema — append to server env):

```ts
INTERNAL_API_KEY: z.string().min(32),
```

Generate value: `openssl rand -hex 32`

> The `INTERNAL_API_KEY` in Auther and the `AUTHER_API_KEY` in payloadcms/next-blog must match — they are the same secret, named per-repo.

---

### A.7 next-blog — Types and Query Changes

**File:** `types/cms.ts` — add `visibility` to `Book`:

```ts
export interface Book {
  // ...existing fields...
  visibility?: 'public' | 'private'
}
```

**File:** `common/apis/books.ts` — add `visibility` to `BOOK_FIELDS`:

```ts
const BOOK_FIELDS = `
  id
  title
  author
  slug
  visibility
  cover { ... }
  // ...rest unchanged
`
```

Do **not** add a `visibility` filter to `createBooksWhere()` — the blog should forward the viewer token to Payload, and Payload access rules should decide which books are returned. Anonymous requests still get public/published books only.

---

### A.8 next-blog — Session Cookie Forwarding

**Prerequisite:** Confirm Auther sets `better-auth.session_token` on the `.quanghuy.dev` root domain. Check `src/lib/auth.ts` in Auther for the `cookieDomain` or `trustedOrigins` setting. Without this, `context.req.cookies['better-auth.session_token']` will be `undefined` on the blog.

**Pattern** (used identically in both gated pages):

```ts
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
  // sessionToken is null → anonymous request → Payload returns public/published books only
}
```

---

### A.9 payloadcms — Token-aware Book Read Access

**Where:** `src/utils/access.ts`, `src/lib/betterAuth/auther.ts`, and the existing Better Auth auth strategy in `src/lib/betterAuth/strategy.ts`.

**New file:** `src/lib/betterAuth/auther.ts`

This helper calls Auther's `check-permission` endpoint with the viewer's token and the client-scoped book entity type.

The blog should not run a separate `checkBookAccess()` helper. It should forward the viewer's Better Auth session token on requests to Payload. Payload authenticates that token into `req.user`, and the book read helper decides which books and chapters are visible.

**How the flow should work:**
- Anonymous request: Payload returns public/published books only.
- Authenticated request: Payload returns public/published books plus any private books that Auther has granted to the token owner.
- Admin request: Payload returns everything.

**Payload-side sketch:**

```ts
// src/utils/access.ts
export const booksReadAccess: Access = async ({ req }) => {
  if (isAdminUser(req.user)) return true

  const token = extractTokenFromHeaders(req.headers)
  if (!token) {
    return publicBooksQuery
  }

  const permittedBookIds = await listAccessibleBookIds(token)

  return {
    or: [
      publicBooksQuery,
      { id: { in: permittedBookIds } },
    ],
  } as never
}
```

**Important implementation details:**
- The blog only forwards the token; it does not decide access itself.
- Any Auther permission lookup happens inside Payload.
- Chapters should follow the same token-aware book access path.
- If token parsing fails, fall back to public/published only.

---

### A.10 next-blog — Books Listing Page

**File:** `pages/books/index.tsx` — forward the viewer token when fetching books; do not manually filter to public-only books in the blog:

```ts
export const getServerSideProps: GetServerSideProps<BooksPageProps> = async (context) => {
  const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
  const data = await getDataForBooksPage(BOOKS_PAGE_SIZE, sessionToken)
  return {
    props: {
      initialBooks: data.books,
      initialHasMore: data.hasMore,
      homepage: data.homepage,
    },
  }
}
```

**File:** `pages/api/books.ts` — proxy the token to Payload and return the books exactly as Payload exposes them:

```ts
res.status(200).json({
  books,
  hasMore,
  nextOffset: offset + books.length,
})
```

**Why no local filter:** Payload should already have applied the read access rule, so the blog should not duplicate public/private logic.

---

### A.11 next-blog — Book Detail Page

**File:** `pages/books/[slug].tsx`

Forward the viewer token to Payload when fetching the book and chapters. If Payload returns an inaccessible response for a private book, render the locked state instead of running a separate permission check in the blog.

The blog-side fetch helper should accept the token and pass it through as `Authorization: Bearer <sessionToken>`. The page can then branch on the Payload response, not on an Auther permission call.

Update the component:

```ts
interface BookDetailPageProps {
  book: Book; chapters: Chapter[]
  homepage: Pick<Homepage, 'header'> | null
  locked: boolean
}

export default function BookDetailPage({ book, chapters, homepage, locked }: BookDetailPageProps) {
  if (locked) return <BookLockedState book={book} homepage={homepage} />
  // ...existing render...
}
```

---

### A.12 next-blog — Chapter Page

**File:** `pages/books/[slug]/chapters/[chapterSlug].tsx`

Same rule as the book detail page: forward the viewer token to Payload, and if Payload says the chapter is inaccessible through the parent book access rule, redirect to the book detail page / locked state. There should be no separate `checkBookAccess()` helper in the blog.

The chapter fetch helper should accept the token and pass it through to Payload. If Payload denies access, the blog renders the locked book page or a redirect based on the response shape.

---

### A.13 next-blog — Locked State Components

**New file:** `components/pages/books/book-locked-state.tsx`

```tsx
import React from 'react'
import type { Book, Homepage } from 'types/cms'
import { Layout } from 'components/core/layout'
import { Container } from 'components/core/container'
import { BookCover } from 'components/shared/book-cover'

interface BookLockedStateProps {
  book: Book
  homepage: Pick<Homepage, 'header'> | null
}

export function BookLockedState({ book, homepage }: BookLockedStateProps) {
  const autherSignInUrl = process.env.NEXT_PUBLIC_AUTHER_SIGN_IN_URL

  return (
    <Layout header={homepage?.header} className="flex flex-col items-center">
      <Container className="my-8 w-full max-w-md">
        <div className="flex flex-col items-center gap-4 text-center">
          <BookCover media={book.cover ?? null} title={book.title} className="w-32" />
          <h1 className="text-2xl font-bold">{book.title}</h1>
          {book.author && <p className="text-sm text-gray-600">{book.author}</p>}
          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-700">
              This book is private. You need explicit access to read it.
            </p>
          </div>
          {autherSignInUrl && (
            <a href={autherSignInUrl}
              className="rounded bg-blue px-4 py-2 text-sm text-white hover:opacity-90">
              Sign in to check access
            </a>
          )}
        </div>
      </Container>
    </Layout>
  )
}
```

**Add to `next-blog/.env.local.example`:**

```
AUTHER_BASE_URL=https://auth.quanghuy.dev
PAYLOAD_CLIENT_ID=<PAYLOAD_CLIENT_ID>
NEXT_PUBLIC_AUTHER_SIGN_IN_URL=https://auth.quanghuy.dev/sign-in
```

---

# Feature B: Chapter Password Lock

---

### B.1 payloadcms — Password Hash Storage

**Goal:** never store a chapter password in plaintext.

- Keep the editor-facing value as a password input, but persist only a slow one-way hash in the database.
- Add `hasPassword` as a derived boolean, and add a version marker such as `passwordVersion` or `passwordUpdatedAt` so password changes can revoke old unlock proofs.
- A `beforeChange` hook should hash new input before save, preserve the existing hash when the field is omitted, and remove the hash when the editor explicitly clears the password.
- An `afterRead` hook should expose `hasPassword` only and never return the stored hash.
- This needs a migration and regenerated types.

### B.2 payloadcms — GraphQL Unlock and Content Gate

**Goal:** use GraphQL for unlocking, but protect chapter content itself so list pages do not require one password per chapter.

- Replace the HTTP unlock/validate route idea with a GraphQL mutation such as `unlockChapterPassword`.
- The mutation should accept `chapterId` and `password`, verify the password against the stored hash server-side, and return a short-lived unlock proof.
- Do not gate the whole chapter collection on password. Chapter lists and detail metadata should still be readable without unlocking every chapter.
- Gate the `content` field itself. If the request does not carry a valid unlock proof for that chapter, return `null` or omit the field.
- If the generated GraphQL access layer cannot express that cleanly, add a thin custom query/resolver wrapper, but keep the actual gate logic in shared access helpers.
- Include a password version or last-updated timestamp in the proof so changing or removing the password invalidates old unlocks.

---

### B.3 payloadcms — Admin UI for Set / Change / Clear

**Goal:** give editors an explicit way to manage the chapter password.

- Add a custom admin control or field widget for password management.
- It should support set, change, and clear, and it should never display the hash back to the user.
- A plain default field only works if it can reliably distinguish untouched, replaced, and removed values; verify that before relying on it.
- Prefer an explicit custom component if the default edit form might accidentally wipe the password on save.

### B.4 next-blog — Password Gate Flow

**Goal:** the blog should not ask for a password on every chapter in a list.

- Chapter list pages should request metadata only and show the lock state from `hasPassword`.
- Chapter detail pages should request `content`; if `content` is missing and `hasPassword` is true, render the password gate.
- On submit, call the GraphQL unlock mutation and store the unlock proof briefly.
- On later requests, send the proof back so the same chapter stays unlocked for that session.
- Prefer a signed cookie over sessionStorage if the deployment can support it; otherwise keep the proof short-lived and chapter-scoped.

### B.5 edge cases and invariants

- Changing or clearing a password must invalidate prior unlock proofs.
- Any preview, excerpt, or alternate chapter resolver must use the same content gate.
- The server-side gate must protect GraphQL selection sets too; the frontend query shape alone is not enough.
- Do not accidentally wipe the password when unrelated chapter fields are edited.
- Do not introduce per-chapter prompts in chapter list views.

---

## 4. Environment Variables

| Variable | Repo | Required in | Notes |
|---|---|---|---|
| `AUTHER_BASE_URL` | payloadcms | `.env`, Dockerfile | URL of Auther deployment, e.g. `https://auth.quanghuy.dev` |
| `AUTHER_API_KEY` | payloadcms | `.env`, Dockerfile | = Auther's `INTERNAL_API_KEY`; service-to-service only |
| `PAYLOAD_CLIENT_ID` | payloadcms | `.env`, Dockerfile | Better Auth OAuth client ID; reused to scope Auther entity type |
| `AUTHER_BASE_URL` | next-blog | `.env.local`, Vercel | Same URL |
| `PAYLOAD_CLIENT_ID` | next-blog | `.env.local`, Vercel | Better Auth OAuth client ID; used for login/session sync |
| `NEXT_PUBLIC_AUTHER_SIGN_IN_URL` | next-blog | `.env.local`, Vercel | e.g. `https://auth.quanghuy.dev/sign-in` |
| `INTERNAL_API_KEY` | auther | `.env`, Fly secrets | Min 32 chars; `openssl rand -hex 32` |
| `PAYLOAD_CLIENT_ID` | auther | `.env` | Existing OAuth client ID, reused as scope guard in A.6 |
| `PAYLOAD_CMS_URL` | next-blog | `.env.local`, Vercel | e.g. `https://payload.quanghuy.dev` |

**payloadcms — add to `src/lib/env.ts`** (following existing cached-getter pattern):

```ts
// getAutherBaseUrl, getAutherApiKey, getAutherClientId — see A.4 above
```

**auther — add to `src/env.ts` Zod schema:**

```ts
INTERNAL_API_KEY: z.string().min(32),
```

---

## 5. Deployment Order

To avoid downtime or broken states, deploy in this order:

1. **auther** — register `client_<PAYLOAD_CLIENT_ID>:book` entity type in auth model + deploy new `src/app/api/internal/clients/[clientId]/grants/` routes + `INTERNAL_API_KEY` secret
2. **payloadcms** — deploy `visibility` field + token-aware read access + chapter password hash storage + GraphQL unlock mutation + admin password control + `AUTHER_BASE_URL`/`AUTHER_API_KEY`/`PAYLOAD_CLIENT_ID` env vars; run migration
3. **next-blog** — deploy token-forwarding fetches + locked state UI + chapter password gate flow + auth env vars; run the updated book-list and book-detail flows against Payload

**Why this order:** The Auther check-permission endpoint must be ready before payloadcms or next-blog tries to call it. The Payload migration must run before the blog goes live with any gating logic.

---

## 6. Checklists per Repo

### payloadcms (this repo)

**Feature A:**
- [ ] Add `visibility` field to `src/collections/Books.ts`
- [ ] Add `publicBooksReadAccess` to `src/utils/access.ts`; wire to `Books.access.read`
- [ ] Add `chaptersReadAccess` to `src/utils/access.ts`; wire to `Chapters.access.read`
- [ ] Add `getAutherBaseUrl`, `getAutherApiKey`, and `getAutherClientId` to `src/lib/env.ts`
- [ ] Create `src/app/api/books/[id]/access/route.ts` (GET / POST / DELETE)
- [ ] Create `src/components/admin/books/BookAccessPanel.tsx`; register in `Books.ts`
- [ ] `pnpm payload migrate:create` — commit both `.ts` and `.json`
- [ ] `pnpm generate:types`
- [ ] `pnpm tsc --noEmit`
- [ ] `pnpm test:int`

**Feature B:**
- [ ] Add hashed password storage, `hasPassword`, and a version marker to `src/collections/Chapters.ts`
- [ ] Add `beforeChange` / `afterRead` hooks to hash new passwords and hide the stored hash
- [ ] Add a GraphQL unlock mutation and a content-gating helper for chapter reads
- [ ] Add a custom admin password control or field widget for set / change / clear
- [ ] `pnpm payload migrate:create` — commit both `.ts` and `.json`
- [ ] `pnpm generate:types`
- [ ] `pnpm tsc --noEmit`

### auther

**Feature A:**
- [ ] Register `client_<PAYLOAD_CLIENT_ID>:book` entity type in authorization models (admin UI or migration script)
- [ ] Add `INTERNAL_API_KEY` to `src/env.ts` Zod schema
- [ ] Create `src/app/api/internal/clients/[clientId]/grants/route.ts` (GET / POST)
- [ ] Create `src/app/api/internal/clients/[clientId]/grants/[tupleId]/route.ts` (DELETE)
- [ ] Add `INTERNAL_API_KEY` secret to deployment (Fly.io / `.env`)
- [ ] Verify cookie domain is `.quanghuy.dev` for cross-subdomain session sharing

### next-blog

**Feature A:**
- [ ] Add `visibility?: 'public' | 'private'` to `Book` interface in `types/cms.ts`
- [ ] Add `visibility` to `BOOK_FIELDS` in `common/apis/books.ts`
- [ ] Forward the viewer token to Payload in `pages/books/index.tsx` `getServerSideProps`
- [ ] Proxy the viewer token to Payload in `pages/api/books.ts`
- [ ] Update `pages/books/[slug].tsx` `getServerSideProps` to render locked state from Payload responses
- [ ] Create `components/pages/books/book-locked-state.tsx`
- [ ] Update `pages/books/[slug]/chapters/[chapterSlug].tsx` `getServerSideProps` to redirect when Payload denies access
- [ ] Add `AUTHER_BASE_URL`, `PAYLOAD_CLIENT_ID`, and `NEXT_PUBLIC_AUTHER_SIGN_IN_URL` to `.env.local` and Vercel
- [ ] Verify `PAYLOAD_API_KEY` user has `role: admin` in Payload

**Feature B:**
- [ ] Add `hasPassword?: boolean` to `Chapter` interface in `types/cms.ts`
- [ ] Add `hasPassword` to `CHAPTER_FIELDS` in `common/apis/chapters.ts`
- [ ] Create `components/pages/books/chapter-password-gate.tsx`
- [ ] Update `pages/books/[slug]/chapters/[chapterSlug].tsx` component (locked state + proof restore)
- [ ] Update chapter fetches to use the GraphQL unlock proof instead of HTTP proxy routes
- [ ] Update `getServerSideProps` to pass `locked: chapter.hasPassword === true`
- [ ] Add `PAYLOAD_CMS_URL` to `.env.local` and Vercel
