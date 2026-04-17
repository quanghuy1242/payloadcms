# Gated Content - Private Books and Chapter Lock (Phase 1)

Two distinct features in this phase:

- **A. Private books** - whole book and all its chapters are hidden unless the reader has been explicitly granted access, coordinated through Auther's ReBAC engine.
- **B. Chapter password lock** - a specific chapter is hidden behind a static password set by the author. No user account required. Similar to WordPress protected posts.

---

## A. Private Books

### Overview

The blog currently shows all `published` books to any user who has a Payload session token (via `authenticatedAccess`). Private books should be invisible on the blog and inaccessible at the chapter level unless the user has been granted a `reader` (or higher) relation on that specific book in Auther.

Admin users (role = admin) always bypass access checks and see everything.

---

### 1. Data Model Changes - This Repo

**`src/collections/Books.ts`** - add `visibility` field

```ts
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
    description: 'Private books are only visible to users with explicit access granted in Auther.',
  },
},
```

**Migration needed**: yes, run `pnpm payload migrate:create` after adding this field. The default `'public'` ensures all existing books remain unchanged.

No changes to `Chapters.ts` for this feature - chapter access is derived entirely from the parent book's visibility.

---

### 2. Access Rule Changes - This Repo

Currently both `Books` and `Chapters` use `authenticatedAccess` for `read`, which means any logged-in user can read any book/chapter. This needs to become visibility-aware.

**New access helper in `src/utils/access.ts`**

```ts
export const publicBooksReadAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true

  // Unauthenticated: only public published books
  if (!req.user) {
    return {
      and: [
        { visibility: { equals: 'public' } },
        { _status: { equals: 'published' } },
      ],
    }
  }

  // Authenticated: public published books + their own books (any status)
  // Private books are filtered OUT here; the blog handles per-book Auther check
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

The Payload access layer does not call Auther inline (that would be too slow for list queries). Instead:
- The list query on the blog filters to public books only.
- The individual book or chapter page for a private book does the Auther check.

For the chapter read access, add a similar rule that checks the parent book's visibility:

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

Note: Payload SQLite adapter supports nested relationship filters. If the `book.visibility` filter causes issues, use a `beforeOperation` hook on Chapters to resolve book IDs that are private and exclude them.

Wire up:
- `Books.ts`: `read: publicBooksReadAccess`
- `Chapters.ts`: `read: chaptersReadAccess`

---

### 3. Auther Integration

Auther (`auth.quanghuy.dev` or wherever deployed) already has a full ReBAC engine with entity types, relations, and a `POST /api/auth/check-permission` endpoint.

**Step 1: Register a `book` entity type in Auther**

In Auther admin, go to Access Control > Authorization Models and create a new entity type:

```json
{
  "entityType": "book",
  "description": "Reader-level book access for gated content",
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
```

This only needs to be done once in the Auther admin UI. After this, the `POST /api/auth/check-permission` endpoint will accept `entityType: "book"` checks.

**Step 2: Granting access**

When a book is created or made private, the admin grants reader access via Auther's admin UI:
- Go to Access Control in Auther
- Find or create the user
- Add permission: `entityType=book`, `entityId=<payloadBookId>`, `relation=reader`

Later this can be wrapped in a custom Payload admin component (see section 5).

**Step 3: Blog Authentication Prerequisites**

The next-blog currently authenticates all Payload API calls with a static `PAYLOAD_API_KEY`. For gated content, the blog also needs to identify the current *user* to check their Auther permissions. Users authenticate through Auther (Better Auth), which sets a session cookie named `better-auth.session_token` on the `auth.quanghuy.dev` domain. For this cookie to be readable by `blog.quanghuy.dev`, it must be set on the shared root domain `.quanghuy.dev` — verify that Auther's `BETTER_AUTH_URL` (or equivalent cookie domain config) is configured as `.quanghuy.dev`.

In `getServerSideProps`, read the cookie from the incoming request:

```ts
// In getServerSideProps for /books/[slug] and /books/[slug]/chapters/[chapterSlug]
export const getServerSideProps: GetServerSideProps = async (context) => {
  const sessionToken = context.req.cookies['better-auth.session_token'] ?? null
  // Pass to checkBookAccess if the book turns out to be private
}
```

If `sessionToken` is null, the user is unauthenticated — treat them the same as having no access.

**Step 4: Checking access in the blog**

The blog forwards the user's Better Auth session token directly to Auther's `check-permission` endpoint. Auther authenticates the token server-side and derives the user identity from it. No intermediate call to `/api/users/me` is needed.

```
Browser → blog server (getServerSideProps)
  → Extract `better-auth.session_token` from context.req.cookies
  → POST auth.quanghuy.dev/api/auth/check-permission
      headers: { Authorization: "Bearer <sessionToken>", Content-Type: "application/json" }
      body: { entityType: "book", entityId: payloadBookId, permission: "view" }
  → { allowed: true | false }
```

Note: The `check-permission` endpoint does NOT accept `subjectType` or `subjectId` in the request body. Subject identity is derived entirely from the `Authorization: Bearer` header (or `x-api-key` header for service-to-service calls).

**Where to put this in the blog:**

A shared utility `common/auth/checkBookAccess.ts`:

```ts
export async function checkBookAccess(
  sessionToken: string,
  entityId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.AUTHER_BASE_URL}/api/auth/check-permission`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          entityType: 'book',
          entityId,
          permission: 'view',
        }),
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

Call this from `getServerSideProps` for book detail and chapter pages when the book is private. If `!allowed`, return a locked-state page rather than `notFound` (so the URL is still visible, enabling access request). If `sessionToken` is null, skip the Auther call and treat as not allowed.

---

### 4. Blog-side Gating

**Book listing page (`/books`)**: only query public books. No change needed if the Payload access rule is updated correctly - the GraphQL query will just return public books.

**Book detail page (`/books/[slug]`)**: after fetching the book, if `book.visibility === 'private'`, call `checkBookAccess(sessionToken, book.id.toString())`. If not allowed, render a locked state:
- Book cover + title visible (teaser)
- "This book is private" message
- "Request access" button (see section 6)

**Chapter page (`/books/[slug]/chapters/[chapterSlug]`)**: same check. If not allowed, redirect to the book detail page at `{ redirect: { destination: /books/${bookSlug}, permanent: false } }` so the user sees the locked state there rather than a blank page. Do not return `notFound` here.

**Edge case — book fetch uses static API key**: The `getBookBySlug()` and `getChapterByBookAndSlug()` calls use the static `PAYLOAD_API_KEY`. After the Payload access rule changes (section 2), these calls will only return public books. You must also query private books for the gating flow. Options:
1. Add `visibility` to the `Book_where` query in `common/apis/books.ts` and use a separate API call that includes private books (requires the blog to also have a user-scoped Payload session, which adds complexity).
2. Simpler: fetch the book using the static API key (which only returns public books). If not found, do a second fetch without the `_status: published` filter but with the book slug, using a separate admin API call from the backend. OR just configure the Payload read access so admin API key always returns all books.

**Recommended approach**: Keep the blog's `PAYLOAD_API_KEY` with admin-level access (it already is, since it's a user API key). The `publicBooksReadAccess` restriction only applies to *user* tokens. The admin API key should bypass it. This means the blog's server-side fetches via API key will always find both public and private books, and the gating is enforced by the `checkBookAccess` layer. Verify that the API key used in next-blog belongs to a user with `role: admin` in Payload.

**Environment variable needed in the blog**: `AUTHER_BASE_URL=https://auth.quanghuy.dev`

---

### 5. Admin UI: Access Panel on Book Document

A custom component in Payload admin to view and manage who has access to a private book. This avoids having to go to Auther's admin separately for common operations.

Location: `src/components/admin/books/BookAccessPanel.tsx` (browser-only React component)

Register it in `Books.ts`:
```ts
admin: {
  components: {
    edit: {
      beforeDocumentControls: [
        '/components/admin/books/DeleteBookButton',
        '/components/admin/books/ChapterListButton',
        '/components/admin/books/BookAccessPanel', // only renders when visibility === 'private'
      ],
    },
  },
}
```

The component:
- Reads the current book's `id` from the document context via `useDocumentInfo()`
- Calls a Payload API route at `src/app/api/books/[id]/access/route.ts` which proxies to Auther
- Displays a table of granted users with a revoke button
- Includes an "Add user" form (email lookup → grant reader relation in Auther)

**Important: Auther's HTTP API for ReBAC grant management.** Auther does not expose a public HTTP endpoint for listing or creating ReBAC tuples (the admin UI at `admin.quanghuy.dev` performs these actions directly via Auther's internal repository layer, not via an HTTP API). Before building the proxy, check the Auther `src/app/api/internal/` directory for any internal grant management routes, or add one. If none exists, the simplest path is: the Payload proxy route calls a new `POST /api/internal/grants` endpoint in Auther (protected by `AUTHER_API_KEY`) that wraps the `PermissionService.grantRelation()` method. This requires a small addition to Auther.

The Payload proxy route (`src/app/api/books/[id]/access/route.ts`) must:
- Validate the Payload admin session (only admins can manage access)
- Use `x-api-key: ${process.env.AUTHER_API_KEY}` when calling Auther (not the user's token)

The `AUTHER_API_KEY` is a service account API key created in Auther's admin panel. It bypasses ReBAC rules and is only for trusted server-to-server calls.

---

### 6. Access Request Flow

On the locked book page in the blog, a "Request access" button:
- Calls a small blog API route that sends an email to the site admin with the requester's email and the book title
- Or: opens a mailto link as the simplest possible version
- Later: could integrate with Auther's invite system (send a platform invite that auto-grants reader on this book)

No Payload changes needed for the simplest version.

---

### 7. Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `AUTHER_BASE_URL` | Payload (this repo) | URL of Auther deployment |
| `AUTHER_API_KEY` | Payload (this repo) | Service API key for admin operations in Auther |
| `AUTHER_BASE_URL` | blog (next-blog) | Same value |

Add these to `src/lib/env.ts` with Zod validation following the existing pattern.

---

### 8. Migration Checklist

- [ ] Add `visibility` field to Books collection
- [ ] Run `pnpm payload migrate:create` and commit both `.ts` and `.json` files
- [ ] Add `publicBooksReadAccess` and `chaptersReadAccess` to `src/utils/access.ts`
- [ ] Wire new access helpers to Books and Chapters collections
- [ ] Register `book` entity type in Auther admin
- [ ] Add `AUTHER_BASE_URL` and `AUTHER_API_KEY` to env and `src/lib/env.ts`
- [ ] Build `BookAccessPanel` admin component
- [ ] Check Auther `src/app/api/internal/` for grant management endpoint; add one if absent
- [ ] Run `pnpm generate:types` after collection changes
- [ ] Run `pnpm tsc --noEmit` to verify
- [ ] Blog: add `AUTHER_BASE_URL` to `.env.local` and Vercel env
- [ ] Blog: verify `better-auth.session_token` cookie domain is `.quanghuy.dev` in Auther config
- [ ] Blog: add `checkBookAccess` utility at `common/auth/checkBookAccess.ts`
- [ ] Blog: update `getServerSideProps` in `pages/books/[slug].tsx` to read `better-auth.session_token` cookie and call `checkBookAccess`
- [ ] Blog: update `getServerSideProps` in `pages/books/[slug]/chapters/[chapterSlug].tsx` for same
- [ ] Blog: build locked state UI component for book/chapter pages
- [ ] Blog: verify `PAYLOAD_API_KEY` belongs to an admin user so private books are returned by GraphQL

---

## B. Chapter Password Lock

### Overview

A simple WordPress-style feature: an optional plaintext password on a chapter. Anyone who knows the password can read it - no account required. The password is never exposed in API responses; instead a `hasPassword` boolean signals the blog to show a gate.

---

### 1. Data Model Changes

**`src/collections/Chapters.ts`** - add `password` field

```ts
{
  name: 'password',
  type: 'text',
  admin: {
    position: 'sidebar',
    description: 'Optional. If set, readers must enter this password to view the chapter.',
  },
  access: {
    // Never expose password in read responses - admin can write it, nobody reads it
    read: () => false,
    update: ({ req }) => isAdminUser(req.user) || ownerAccess('createdBy')({ req }),
  },
},
```

**Migration needed**: yes, a new nullable text column.

**`afterRead` hook on Chapters** to inject `hasPassword`:

```ts
hooks: {
  afterRead: [
    ({ doc }) => {
      return {
        ...doc,
        hasPassword: Boolean(doc.password),
        password: undefined, // belt-and-suspenders strip
      }
    },
  ],
}
```

Add `hasPassword` as a virtual field so Payload types include it:

```ts
{
  name: 'hasPassword',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    readOnly: true,
    position: 'sidebar',
  },
},
```

---

### 2. Payload Unlock Endpoint

New route: `src/app/(payload)/api/chapters/[id]/unlock/route.ts`

```ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const payload = await getPayload({ config: configPromise })
  const { password } = await req.json()

  // Use local API with admin override to fetch the raw password
  const chapter = await payload.findByID({
    collection: 'chapters',
    id: params.id,
    overrideAccess: true,
    depth: 0,
  })

  if (!chapter?.password || chapter.password !== password) {
    return Response.json({ error: 'Wrong password' }, { status: 401 })
  }

  // Issue a short-lived HMAC token: base64(chapterId + ":" + expiry + ":" + signature)
  const expiry = Date.now() + 1000 * 60 * 60 // 1 hour
  const secret = process.env.PAYLOAD_SECRET!
  const msg = `${params.id}:${expiry}`
  const sig = createHmac('sha256', secret).update(msg).digest('base64url')
  const token = `${msg}:${sig}`

  return Response.json({ token })
}
```

A second endpoint (or the same one via GET) validates the token to allow server-side rendering of protected chapters:

`src/app/(payload)/api/chapters/[id]/unlock/validate/route.ts` - returns `{ valid: true }` if token signature checks out and is not expired.

The chapter content fetch itself does not need to include the token - the unlock token is just a proof that the visitor knows the password. Store it in the blog's session storage under key `chapter-token-${chapterId}`.

---

### 3. Blog Side

**Chapter page** (`/books/[slug]/chapters/[chapterSlug].tsx`):

1. On page load, check `sessionStorage.getItem(`chapter-token-${chapter.id}`)`.
2. If token exists, POST it to the blog's own API route which calls the Payload validate endpoint. If valid, render content normally.
3. If no token or invalid token, and `chapter.hasPassword === true`, render a password gate form instead of content.
4. On form submit, POST `{ password }` to the blog API route → calls `payload.quanghuy.dev/api/chapters/[id]/unlock` with CORS credentials.
5. On success, store the returned token in sessionStorage and re-render.

The blog API route is a thin proxy. CORS handles it since `blog.quanghuy.dev` is already in the Payload `cors` allowlist.

---

### 4. Checklist

- [ ] Add `password` and `hasPassword` fields to Chapters
- [ ] Add `afterRead` hook to strip `password` and populate `hasPassword`
- [ ] Create unlock endpoint `src/app/(payload)/api/chapters/[id]/unlock/route.ts`
- [ ] Create validate endpoint
- [ ] Run `pnpm payload migrate:create`, commit migration files
- [ ] Run `pnpm generate:types`
- [ ] Blog: password gate component on chapter page
- [ ] Blog: sessionStorage token management
- [ ] Run `pnpm tsc --noEmit`
