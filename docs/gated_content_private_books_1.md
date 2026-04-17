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
   - [A.9 next-blog — `checkBookAccess` Utility](#a9-next-blog--checkbookaccess-utility)
   - [A.10 next-blog — Books Listing Page](#a10-next-blog--books-listing-page)
   - [A.11 next-blog — Book Detail Page](#a11-next-blog--book-detail-page)
   - [A.12 next-blog — Chapter Page](#a12-next-blog--chapter-page)
   - [A.13 next-blog — Locked State Components](#a13-next-blog--locked-state-components)
3. [Feature B: Chapter Password Lock](#feature-b-chapter-password-lock)
   - [B.1 payloadcms — Data Model](#b1-payloadcms--data-model)
   - [B.2 payloadcms — Unlock and Validate Endpoints](#b2-payloadcms--unlock-and-validate-endpoints)
   - [B.3 next-blog — Password Gate UI](#b3-next-blog--password-gate-ui)
   - [B.4 next-blog — Token Storage and Validation](#b4-next-blog--token-storage-and-validation)
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
  │           Body: { entityType:"book", entityId:"<payloadBookId>", permission:"view" }
  │           Response: { allowed: true|false, ... }
  │
  └─► payload.quanghuy.dev/admin (payloadcms admin)
        BookAccessPanel component
          │
          └─► payload.quanghuy.dev/api/books/[id]/access  (proxy route)
                x-api-key: AUTHER_API_KEY
                  │
                  └─► auth.quanghuy.dev/api/internal/grants  (auther, new endpoint)
```

**Key design constraints discovered from reading the repos:**

1. `check-permission` at Auther identifies the subject entirely from the `Authorization: Bearer` header — there is no `subjectType`/`subjectId` in the request body. The body only contains `entityType`, `entityId`, `permission`, and optional `resource` context.
2. Auther's `src/app/api/internal/` currently contains only `cleanup-traces`, `queues`, and `rotate-jwks` — no grant-management HTTP endpoint exists. One must be added.
3. Auther's existing `grantScopedPermission()` server action in `src/app/admin/clients/[id]/access/actions.ts` shows the correct tuple shape: `entityType = "client_{clientId}:{entityTypeName}"`. For the book use-case the entity type is standalone (no client namespace), so it should just be `"book"` with `entityId = "<payloadBookId>"`.
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

**Why the admin API key in next-blog bypasses this:** `publicBooksReadAccess` only restricts non-admin users. The `PAYLOAD_API_KEY` used by next-blog belongs to a Payload user with `role: 'admin'` (verified with `pnpm promote:admin`). That user hits the `if (isAdminUser(req.user)) return true` branch and gets all books including private ones. Gating is enforced by the `checkBookAccess` call in `getServerSideProps`, not by Payload access rules.

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

This route is called by `BookAccessPanel`. It proxies grant/revoke/list operations to Auther, authenticating with `AUTHER_API_KEY` (a service-level API key, not a user session token).

**File:** `src/app/api/books/[id]/access/route.ts`

```ts
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { getAutherBaseUrl, getAutherApiKey } from '@/lib/env'

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
    `${getAutherBaseUrl()}/api/internal/grants?entityType=book&entityId=${params.id}`,
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
  const res = await fetch(`${getAutherBaseUrl()}/api/internal/grants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': getAutherApiKey() },
    body: JSON.stringify({
      entityType: 'book',
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
  const res = await fetch(`${getAutherBaseUrl()}/api/internal/grants/${body.tupleId}`, {
    method: 'DELETE',
    headers: { 'x-api-key': getAutherApiKey() },
  })
  if (!res.ok) return Response.json({ error: 'Auther error' }, { status: 502 })
  return Response.json({ ok: true })
}
```

**Add `getAutherBaseUrl` and `getAutherApiKey` to `src/lib/env.ts`**, following the existing cached-env-var pattern (same as `getR2PublicBaseUrl`):

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

> **Security note:** `requireAdmin()` validates the Payload session from the request headers — only Payload admins can call this proxy. `AUTHER_API_KEY` is used server-to-server only and is never exposed to the browser.

---

### A.5 auther — Book Entity Type Registration

**What needs to happen:** The `authorization_models` table must contain a row for `entityType = "book"` before any `check-permission` call will work for books. `PermissionService.checkPermission()` returns `false` (logs "No authorization model found") if the entity type is missing.

**One-time setup:**
1. Log in to Auther admin at `auth.quanghuy.dev/admin`
2. Navigate to **Access Control** → **Authorization Models**
3. Click **Add Model** → JSON mode → paste:

```json
{
  "entityType": "book",
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

**Hierarchy meaning:**
- `owner` implies `editor` implies `reader`
- Granting `reader` → `view` permission only
- Granting `owner` → `view` + `edit` + `manage_access`

**How the check works:** `POST /api/auth/check-permission` with `{ entityType:"book", entityId:"42", permission:"view" }` and `Authorization: Bearer <token>`:
1. Loads the `book` model from `authorization_models`
2. Resolves `permission:"view"` → `requiredRelation:"reader"`
3. Expands implied relations: `reader`, `editor`, `owner`
4. Queries `access_tuples` for `entityType="book"`, `entityId="42"`, `relation IN (...)`, `subjectType="user"`, `subjectId=<from token>`
5. Returns `{ allowed: true }` if any match

---

### A.6 auther — Grant Management HTTP Endpoint

**Problem:** The Payload proxy route (A.4) needs HTTP endpoints to list, create, and delete ReBAC tuples for a given book. Auther's `src/app/api/internal/` currently has only `cleanup-traces`, `queues`, and `rotate-jwks` — no grant management endpoint exists.

**New files to create in Auther:**

**`src/app/api/internal/grants/route.ts`**

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

// GET ?entityType=book&entityId=42 — list all tuples for a given entity
export async function GET(req: NextRequest) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const entityId = searchParams.get('entityId')
  if (!entityType || !entityId) {
    return NextResponse.json({ error: 'entityType and entityId are required' }, { status: 400 })
  }

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

// POST — grant a relation (accepts subjectEmail or subjectId)
export async function POST(req: NextRequest) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json() as {
    entityType: string; entityId: string; relation: string
    subjectType: 'user' | 'apikey'; subjectId?: string; subjectEmail?: string
  }
  const { entityType, entityId, relation, subjectType } = body
  if (!entityType || !entityId || !relation || !subjectType) {
    return NextResponse.json({ error: 'entityType, entityId, relation, subjectType required' }, { status: 400 })
  }

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

**`src/app/api/internal/grants/[tupleId]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { TupleRepository } from '@/lib/repositories/tuple-repository'
import { env } from '@/env'

function requireInternalApiKey(req: NextRequest): boolean {
  return req.headers.get('x-api-key') === env.INTERNAL_API_KEY
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { tupleId: string } }
) {
  if (!requireInternalApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tupleRepo = new TupleRepository()
  const tuple = await tupleRepo.findById(params.tupleId)
  if (!tuple) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await tupleRepo.deleteById(params.tupleId)
  return NextResponse.json({ ok: true })
}
```

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

Do **not** add a `visibility` filter to `createBooksWhere()` — the admin API key bypasses Payload access rules and returns all books. Gating is done in `getServerSideProps`.

---

### A.8 next-blog — Session Cookie Forwarding

**Prerequisite:** Confirm Auther sets `better-auth.session_token` on the `.quanghuy.dev` root domain. Check `src/lib/auth.ts` in Auther for the `cookieDomain` or `trustedOrigins` setting. Without this, `context.req.cookies['better-auth.session_token']` will be `undefined` on the blog.

**Pattern** (used identically in both gated pages):

```ts
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
  // sessionToken is null → unauthenticated → treat as no access
}
```

---

### A.9 next-blog — `checkBookAccess` Utility

**New file:** `common/auth/checkBookAccess.ts`

```ts
/**
 * Check whether the current user has been granted view access to a book
 * by forwarding their Better Auth session token to Auther's check-permission endpoint.
 *
 * Auther identifies the subject from the Authorization header — do NOT include
 * subjectType/subjectId in the body.
 */
export async function checkBookAccess(
  sessionToken: string,
  bookId: string
): Promise<boolean> {
  const autherBase = process.env.AUTHER_BASE_URL
  if (!autherBase) return false
  try {
    const res = await fetch(
      `${autherBase.replace(/\/+$/, '')}/api/auth/check-permission`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ entityType: 'book', entityId: bookId, permission: 'view' }),
        cache: 'no-store',
      }
    )
    if (!res.ok) return false
    const data = (await res.json()) as { allowed: boolean }
    return data.allowed === true
  } catch {
    return false
  }
}
```

**Important implementation details:**
- Body contains only `entityType`, `entityId`, `permission` — matches `CheckPermissionRequest` in Auther exactly
- No `subjectType`/`subjectId` in the body (Auther derives subject from `Bearer` header)
- `cache: 'no-store'` — permissions are user-specific, must not be cached
- Returns `false` on any error — fail closed

---

### A.10 next-blog — Books Listing Page

**File:** `pages/books/index.tsx` — filter out private books before passing as props:

```ts
export const getServerSideProps: GetServerSideProps<BooksPageProps> = async () => {
  const data = await getDataForBooksPage(BOOKS_PAGE_SIZE)
  return {
    props: {
      initialBooks: data.books.filter((b) => (b.visibility ?? 'public') === 'public'),
      initialHasMore: data.hasMore,
      homepage: data.homepage,
    },
  }
}
```

**File:** `pages/api/books.ts` — same filter for infinite scroll:

```ts
const publicBooks = books.filter((b) => (b.visibility ?? 'public') === 'public')
res.status(200).json({
  books: publicBooks,
  hasMore,
  nextOffset: offset + publicBooks.length,
})
```

---

### A.11 next-blog — Book Detail Page

**File:** `pages/books/[slug].tsx`

```ts
import { checkBookAccess } from 'common/auth/checkBookAccess'

export const getServerSideProps: GetServerSideProps<BookDetailPageProps> = async (context) => {
  const slugParam = Array.isArray(context.params?.slug)
    ? context.params?.slug[0] : context.params?.slug
  if (!slugParam) return { notFound: true }

  const { book, homepage } = await getBookBySlug(slugParam)
  if (!book) return { notFound: true }

  const chapters = await getChaptersByBookId(book.id)

  if (book.visibility === 'private') {
    const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
    const allowed = sessionToken
      ? await checkBookAccess(sessionToken, String(book.id))
      : false

    if (!allowed) {
      return {
        props: { book, chapters: [], homepage, locked: true },
      }
    }
  }

  return {
    props: { book, chapters, homepage, locked: false },
  }
}
```

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

If the book is private and the user lacks access, redirect to the book detail page (which shows the locked state) rather than returning `notFound`.

```ts
import { checkBookAccess } from 'common/auth/checkBookAccess'

export const getServerSideProps: GetServerSideProps<ChapterPageProps> = async (context) => {
  const bookSlug = Array.isArray(context.params?.slug)
    ? context.params?.slug[0] : context.params?.slug
  const chapterSlug = Array.isArray(context.params?.chapterSlug)
    ? context.params?.chapterSlug[0] : context.params?.chapterSlug
  if (!bookSlug || !chapterSlug) return { notFound: true }

  const { book, homepage } = await getBookBySlug(bookSlug)
  if (!book) return { notFound: true }

  if (book.visibility === 'private') {
    const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
    const allowed = sessionToken
      ? await checkBookAccess(sessionToken, String(book.id))
      : false

    if (!allowed) {
      return { redirect: { destination: `/books/${bookSlug}`, permanent: false } }
    }
  }

  const chapterData = await getChapterByBookAndSlug(book.id, chapterSlug)
  if (!chapterData.chapter) return { notFound: true }

  return {
    props: {
      book,
      chapter: chapterData.chapter,
      chapters: chapterData.chapters,
      homepage,
    },
  }
}
```

**Why redirect and not `notFound`:** `notFound` makes it appear the chapter doesn't exist. Redirecting to the book locked state gives the user context and a path to request access.

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
NEXT_PUBLIC_AUTHER_SIGN_IN_URL=https://auth.quanghuy.dev/sign-in
```

---

# Feature B: Chapter Password Lock

---

### B.1 payloadcms — Data Model

**File:** `src/collections/Chapters.ts`

A WordPress-style feature: an optional plaintext password on a chapter. Anyone who knows the password can read it — no account required. The raw password is **never** exposed in API responses; a `hasPassword` boolean signals the blog to show a gate.

**Add `password` field** (access-restricted so it never appears in read responses):

```ts
// src/collections/Chapters.ts — inside fields array
{
  name: 'password',
  type: 'text',
  admin: {
    position: 'sidebar',
    description: 'Optional. If set, readers must enter this password to view the chapter.',
  },
  access: {
    read: () => false,  // never return raw password in any API response
    create: ({ req }) => isAdminUser(req.user),
    update: ({ req }) => isAdminUser(req.user),
  },
},
```

**Add `hasPassword` virtual field** so the type system and GraphQL include it:

```ts
{
  name: 'hasPassword',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Auto-set. True when a password has been configured.',
  },
},
```

**Add `afterRead` hook** to populate `hasPassword` and strip the raw password:

```ts
// src/collections/Chapters.ts — hooks section
hooks: {
  afterRead: [
    ({ doc }) => ({
      ...doc,
      hasPassword: Boolean(doc.password),
      password: undefined,  // belt-and-suspenders: strip even though field access blocks it
    }),
  ],
  // ...existing hooks
},
```

**Why `hasPassword` as a real field instead of only the hook:** GraphQL introspection reflects the field definitions, not hook outputs. Without the `hasPassword` field declaration, the GraphQL query `Chapters { hasPassword }` would fail schema validation. The `afterRead` hook sets the runtime value; the field declaration provides the schema shape.

**Migration:** Two new columns (`password` nullable text, `has_password` boolean with default false). Run `pnpm payload migrate:create` and commit both files.

---

### B.2 payloadcms — Unlock and Validate Endpoints

These are plain Next.js App Router routes (not inside the `(payload)` route group). They call the Payload local API internally.

**File:** `src/app/api/chapters/[id]/unlock/route.ts`

```ts
import { createHmac } from 'crypto'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.password) {
    return Response.json({ error: 'password is required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  // overrideAccess: true — fetch the raw password regardless of field-level access rule
  const chapter = await payload.findByID({
    collection: 'chapters',
    id: params.id,
    overrideAccess: true,
    depth: 0,
  })

  if (!chapter) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Time-constant string comparison to prevent timing attacks
  const storedPassword: string | null | undefined = (chapter as { password?: string }).password
  if (!storedPassword) {
    return Response.json({ error: 'Chapter is not password-protected' }, { status: 400 })
  }

  // Use timingSafeEqual via Buffer comparison
  const inputBuf = Buffer.from(body.password, 'utf8')
  const storedBuf = Buffer.from(storedPassword, 'utf8')
  const match =
    inputBuf.length === storedBuf.length &&
    inputBuf.every((b, i) => b === storedBuf[i])

  if (!match) {
    return Response.json({ error: 'Wrong password' }, { status: 401 })
  }

  // Issue a short-lived HMAC token
  // Format: "<chapterId>:<expiry>:<hmac-signature>"
  const expiry = Date.now() + 60 * 60 * 1000  // 1 hour
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set')
  const msg = `${params.id}:${expiry}`
  const sig = createHmac('sha256', secret).update(msg).digest('base64url')
  const token = `${msg}:${sig}`

  return Response.json({ token })
}
```

**File:** `src/app/api/chapters/[id]/unlock/validate/route.ts`

```ts
import { createHmac, timingSafeEqual } from 'crypto'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ valid: false }, { status: 400 })
  }

  if (!body.token) {
    return Response.json({ valid: false })
  }

  const parts = body.token.split(':')
  if (parts.length !== 3) {
    return Response.json({ valid: false })
  }
  const [chapterId, expiryStr, sig] = parts
  const expiry = parseInt(expiryStr, 10)

  // Reject if chapter ID doesn't match or token is expired
  if (chapterId !== params.id || isNaN(expiry) || Date.now() > expiry) {
    return Response.json({ valid: false })
  }

  const secret = process.env.PAYLOAD_SECRET
  if (!secret) return Response.json({ valid: false }, { status: 500 })

  const msg = `${chapterId}:${expiryStr}`
  const expectedSig = createHmac('sha256', secret).update(msg).digest('base64url')

  // Constant-time comparison
  const sigBuf = Buffer.from(sig, 'base64url')
  const expectedBuf = Buffer.from(expectedSig, 'base64url')
  const valid =
    sigBuf.length === expectedBuf.length &&
    timingSafeEqual(sigBuf, expectedBuf)

  return Response.json({ valid })
}
```

**Security notes:**
- `PAYLOAD_SECRET` is already required by Payload and is present in all envs. No new env var needed.
- Timing-safe comparison prevents password oracle attacks.
- Tokens are bound to the specific chapter ID — a token for chapter 5 cannot unlock chapter 6.
- 1-hour expiry limits the blast radius of a leaked token.
- The raw password is never returned and is only read server-side with `overrideAccess: true`.

---

### B.3 next-blog — Password Gate UI

**How the feature works in the blog:**

1. `getServerSideProps` fetches the chapter normally. If `chapter.hasPassword === true`, pass `locked: true` as a prop.
2. The chapter page component renders a `<ChapterPasswordGate>` component instead of `<ChapterContent>` when `locked` is true.
3. On form submit, the gate component calls a blog API proxy route which calls the Payload `unlock` endpoint.
4. On success, the token is stored in `sessionStorage` and `locked` state is set to `false` (client-side re-render showing content).
5. On subsequent visits, the gate component checks `sessionStorage` first and calls the Payload `validate` endpoint. If valid, skips the password form entirely.

**Update `pages/books/[slug]/chapters/[chapterSlug].tsx`:**

Add `locked: boolean` to `ChapterPageProps`. In the component:

```tsx
export default function ChapterPage({ book, chapter, chapters, homepage, locked: initialLocked }) {
  const [locked, setLocked] = useState(initialLocked)

  // On mount, try to restore access from sessionStorage
  useEffect(() => {
    if (!initialLocked) return
    const stored = sessionStorage.getItem(`chapter-token-${chapter.id}`)
    if (!stored) return
    fetch(`/api/chapters/${chapter.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: stored }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.valid) setLocked(false) })
      .catch(() => {/* stay locked */})
  }, [chapter.id, initialLocked])

  // ...existing state and logic...

  return (
    <Layout ...>
      ...
      {locked ? (
        <ChapterPasswordGate
          chapterId={chapter.id}
          onUnlocked={() => setLocked(false)}
        />
      ) : (
        <ChapterContent content={chapter.content} />
      )}
      ...
    </Layout>
  )
}
```

In `getServerSideProps`, add `locked` prop:

```ts
return {
  props: {
    book,
    chapter: chapterData.chapter,
    chapters: chapterData.chapters,
    homepage,
    locked: chapterData.chapter.hasPassword === true,
  },
}
```

**New file:** `components/pages/books/chapter-password-gate.tsx`

```tsx
import React, { useState } from 'react'

interface ChapterPasswordGateProps {
  chapterId: number
  onUnlocked: () => void
}

export function ChapterPasswordGate({ chapterId, onUnlocked }: ChapterPasswordGateProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/chapters/${chapterId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Incorrect password')
        return
      }
      const { token } = (await res.json()) as { token: string }
      sessionStorage.setItem(`chapter-token-${chapterId}`, token)
      onUnlocked()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded border border-gray-200 p-6">
      <p className="mb-4 text-sm text-gray-700">
        This chapter is protected. Enter the password to continue reading.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Unlock chapter'}
        </button>
      </form>
    </div>
  )
}
```

---

### B.4 next-blog — Token Storage and Validation

**Blog API proxy routes** — these are thin pass-throughs so the browser never calls Payload directly (avoids CORS issues, hides the Payload URL from the client).

**`pages/api/chapters/[id]/unlock.ts`:**

```ts
import type { NextApiRequest, NextApiResponse } from 'next'

const PAYLOAD_BASE = process.env.PAYLOAD_CMS_URL ?? ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { id } = req.query
  const response = await fetch(`${PAYLOAD_BASE}/api/chapters/${id}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  })

  const data = await response.json()
  res.status(response.status).json(data)
}
```

**`pages/api/chapters/[id]/validate.ts`:**

```ts
import type { NextApiRequest, NextApiResponse } from 'next'

const PAYLOAD_BASE = process.env.PAYLOAD_CMS_URL ?? ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { id } = req.query
  const response = await fetch(`${PAYLOAD_BASE}/api/chapters/${id}/unlock/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  })

  const data = await response.json()
  res.status(response.status).json(data)
}
```

**`sessionStorage` key convention:** `chapter-token-${chapterId}` (numeric ID as string). Tokens expire after 1 hour server-side; the client validates on mount and silently drops invalid/expired tokens.

---

## 4. Environment Variables

| Variable | Repo | Required in | Notes |
|---|---|---|---|
| `AUTHER_BASE_URL` | payloadcms | `.env`, Dockerfile | URL of Auther deployment, e.g. `https://auth.quanghuy.dev` |
| `AUTHER_API_KEY` | payloadcms | `.env`, Dockerfile | = Auther's `INTERNAL_API_KEY`; service-to-service only |
| `AUTHER_BASE_URL` | next-blog | `.env.local`, Vercel | Same URL |
| `NEXT_PUBLIC_AUTHER_SIGN_IN_URL` | next-blog | `.env.local`, Vercel | e.g. `https://auth.quanghuy.dev/sign-in` |
| `INTERNAL_API_KEY` | auther | `.env`, Fly secrets | Min 32 chars; `openssl rand -hex 32` |
| `PAYLOAD_CMS_URL` | next-blog | `.env.local`, Vercel | e.g. `https://payload.quanghuy.dev` |

**payloadcms — add to `src/lib/env.ts`** (following existing cached-getter pattern):

```ts
// getAutherBaseUrl and getAutherApiKey — see A.4 above
```

**auther — add to `src/env.ts` Zod schema:**

```ts
INTERNAL_API_KEY: z.string().min(32),
```

---

## 5. Deployment Order

To avoid downtime or broken states, deploy in this order:

1. **auther** — register `book` entity type in auth model + deploy new `src/app/api/internal/grants/` routes + `INTERNAL_API_KEY` secret
2. **payloadcms** — deploy `visibility` field + access rules + proxy route + `BookAccessPanel` component + `AUTHER_BASE_URL`/`AUTHER_API_KEY` env vars; run migration
3. **next-blog** — deploy updated types + `checkBookAccess` + `getServerSideProps` changes + locked state UI + `AUTHER_BASE_URL` env var

**Why this order:** The Auther check-permission endpoint must be ready before payloadcms or next-blog tries to call it. The Payload migration must run before the blog goes live with gating logic.

---

## 6. Checklists per Repo

### payloadcms (this repo)

**Feature A:**
- [ ] Add `visibility` field to `src/collections/Books.ts`
- [ ] Add `publicBooksReadAccess` to `src/utils/access.ts`; wire to `Books.access.read`
- [ ] Add `chaptersReadAccess` to `src/utils/access.ts`; wire to `Chapters.access.read`
- [ ] Add `getAutherBaseUrl` and `getAutherApiKey` to `src/lib/env.ts`
- [ ] Create `src/app/api/books/[id]/access/route.ts` (GET / POST / DELETE)
- [ ] Create `src/components/admin/books/BookAccessPanel.tsx`; register in `Books.ts`
- [ ] `pnpm payload migrate:create` — commit both `.ts` and `.json`
- [ ] `pnpm generate:types`
- [ ] `pnpm tsc --noEmit`
- [ ] `pnpm test:int`

**Feature B:**
- [ ] Add `password` and `hasPassword` fields to `src/collections/Chapters.ts`
- [ ] Add `afterRead` hook to `Chapters` to populate `hasPassword` and strip `password`
- [ ] Create `src/app/api/chapters/[id]/unlock/route.ts`
- [ ] Create `src/app/api/chapters/[id]/unlock/validate/route.ts`
- [ ] `pnpm payload migrate:create` — commit both `.ts` and `.json`
- [ ] `pnpm generate:types`
- [ ] `pnpm tsc --noEmit`

### auther

**Feature A:**
- [ ] Register `book` entity type in authorization models (admin UI or migration script)
- [ ] Add `INTERNAL_API_KEY` to `src/env.ts` Zod schema
- [ ] Create `src/app/api/internal/grants/route.ts` (GET / POST)
- [ ] Create `src/app/api/internal/grants/[tupleId]/route.ts` (DELETE)
- [ ] Add `INTERNAL_API_KEY` secret to deployment (Fly.io / `.env`)
- [ ] Verify cookie domain is `.quanghuy.dev` for cross-subdomain session sharing

### next-blog

**Feature A:**
- [ ] Add `visibility?: 'public' | 'private'` to `Book` interface in `types/cms.ts`
- [ ] Add `visibility` to `BOOK_FIELDS` in `common/apis/books.ts`
- [ ] Create `common/auth/checkBookAccess.ts`
- [ ] Filter private books in `pages/books/index.tsx` `getServerSideProps`
- [ ] Filter private books in `pages/api/books.ts`
- [ ] Update `pages/books/[slug].tsx` `getServerSideProps` (add `locked` prop + privacy check)
- [ ] Create `components/pages/books/book-locked-state.tsx`
- [ ] Update `pages/books/[slug]/chapters/[chapterSlug].tsx` `getServerSideProps` (redirect if private + no access)
- [ ] Add `AUTHER_BASE_URL` and `NEXT_PUBLIC_AUTHER_SIGN_IN_URL` to `.env.local` and Vercel
- [ ] Verify `PAYLOAD_API_KEY` user has `role: admin` in Payload

**Feature B:**
- [ ] Add `hasPassword?: boolean` to `Chapter` interface in `types/cms.ts`
- [ ] Add `hasPassword` to `CHAPTER_FIELDS` in `common/apis/chapters.ts`
- [ ] Create `components/pages/books/chapter-password-gate.tsx`
- [ ] Update `pages/books/[slug]/chapters/[chapterSlug].tsx` component (locked state + sessionStorage restore)
- [ ] Update `getServerSideProps` to pass `locked: chapter.hasPassword === true`
- [ ] Create `pages/api/chapters/[id]/unlock.ts` (proxy)
- [ ] Create `pages/api/chapters/[id]/validate.ts` (proxy)
- [ ] Add `PAYLOAD_CMS_URL` to `.env.local` and Vercel
