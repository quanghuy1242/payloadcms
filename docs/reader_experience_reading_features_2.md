# Reader Experience - Reading Features (Phase 2)

Five features in this phase:

- **A. Reading progress** - track how far a reader has gotten in a chapter and across a book.
- **B. Bookmarks** - save chapters and books to a personal shelf.
- **C. EPUB export from admin** - download a book as EPUB from the Payload admin Book document.
- **D. Editor preview mode** - preview an unpublished book or post on the blog exactly as it will appear, via a signed draft token.
- **E. Comments** - in-house comment system on chapters and posts, with up to 2-level threading and moderation.

Features A, B, and E require a logged-in user (Payload session). C is owner-only. D is for editors (admin or owner).

> **Verified against current codebase (Payload 3.60).** This document reflects what already exists (Phase 1: private books, grant mirror, chapter password lock) and what must be built. It reuses existing utilities and patterns rather than inventing new ones.

> **Critical architectural note:** This repository does not expose custom REST endpoints for application logic. All custom operations — reads, writes, auth checks, token generation — are exposed through **Payload's GraphQL layer** as custom queries and mutations. The blog (next-blog) consumes everything via `POST /api/graphql`. Do not create custom route handlers under `src/app/api/` for these features.

---

## What Already Exists (Phase 1)

Before implementing Phase 2, confirm these are already in place and should be treated as foundational:

| Feature | Location |
|---|---|
| `visibility` field on Books (`public` / `private`) | `src/collections/Books.ts` |
| `publicBooksReadAccess` / `chaptersReadAccess` | `src/utils/access.ts` |
| Better Auth token resolution into `req.user` | `src/lib/betterAuth/strategy.ts` |
| GrantMirror collection with `entityType: 'book'` / `'chapter'` / `'comment'` | `src/collections/GrantMirror.ts` |
| BookAccessPanel admin UI (Drawer + `useModal` pattern) | `src/components/admin/books/BookAccessPanel.tsx` |
| `/api/books/[id]/access` proxy route | `src/app/api/books/[id]/access/route.ts` |
| Chapter password lock (`password`, `hasPassword`, `passwordVersion`) | `src/collections/Chapters.ts` |
| `unlockChapterPassword` GraphQL mutation | `src/graphql/mutations/UnlockChapterPassword/` |
| CORS configured for blog | `payload.config.ts`: `cors: ['https://blog.quanghuy.dev']` |
| GraphQL custom query/mutation registration | `src/graphql/queries/`, `src/graphql/mutations/` |

These should not be rebuilt. Phase 2 collections and resolvers should follow the same patterns.

---

## GraphQL Scaffold Pattern

All custom queries and mutations follow this exact directory convention:

```
src/graphql/queries/{QueryName}/
  index.ts    -- GraphQLFieldConfig: args, return type, resolve binding
  resolver.ts -- async resolver function

src/graphql/mutations/{MutationName}/
  index.ts    -- GraphQLFieldConfig: args, return type, resolve binding
  resolver.ts -- async resolver function
```

Registration happens in:
- `src/graphql/queries/index.ts` -- imports each query and exposes it in the returned object
- `src/graphql/mutations/index.ts` -- imports each mutation and exposes it in the returned object

The `payload` object passed into the factory function provides access to `payload.collections['slug'].graphQL?.type` if you need to return Payload-generated GraphQL types.

Resolvers receive `(parent, args, context)` where `context.req` is the Payload request. Use `context.req.payload` to access the Payload instance, and `context.req.user` to access the authenticated user (populated by the Better Auth strategy).

---

## A. Reading Progress

### Goal

Show a "Continue reading" CTA on the book detail page pointing to the last chapter the user was reading, and show a progress indicator per chapter in the table of contents. Save progress automatically as the user scrolls.

### 1. New Payload Collection: `ReadingProgress`

**File:** `src/collections/ReadingProgress.ts`

Fields:

| Field | Type | Notes |
|---|---|---|
| `user` | relationship → users | required, index |
| `book` | relationship → books | required, index |
| `chapter` | relationship → chapters | required, index |
| `progress` | number | 0-100, represents scroll % through the chapter |
| `completedAt` | date | set when progress reaches ~95% |
| `updatedAt` | date | auto-managed by Payload |

**Access pattern:** This is a user-scoped collection. Reuse the existing access utilities:

- `create`: `authenticatedAccess` (any logged-in user)
- `read`: user-scoped filter — `user equals req.user.id`, or admin
- `update`: same as read
- `delete`: same as read

**Uniqueness constraint:** There must be exactly one progress record per user per chapter. Payload's SQLite adapter does not reliably enforce composite unique constraints at the database level. Use a `beforeChange` hook to upsert: query for existing `(user, chapter)` and update in place instead of creating a duplicate. This is the same hook pattern already used in `Chapters.ts` for password state syncing.

**Ownership enforcement:** Use `enforceOwnershipHook('user')` in `beforeValidate` so non-admin users can only set `user` to themselves.

**Migration needed:** yes. After adding to `payload.config.ts`, run `pnpm payload migrate:create`.

### 2. GraphQL Mutations and Queries

**Mutation:** `saveReadingProgress`

**Files:**
- `src/graphql/mutations/SaveReadingProgress/index.ts`
- `src/graphql/mutations/SaveReadingProgress/resolver.ts`

Args: `{ chapterId: ID!, bookId: ID!, progress: Float! }`

Return type: a simple object `{ ok: Boolean!, progress: ReadingProgress }` where `ReadingProgress` can reuse the Payload-generated type or be a thin custom type.

The resolver:
1. Authenticates the user from `context.req.user`
2. Looks up existing `ReadingProgress` for `(user.id, chapterId)` via `context.req.payload.find`
3. If found: `payload.update(...)` only if `newProgress > storedProgress` (never regress)
4. If not found: `payload.create(...)`
5. When `progress >= 95`, set `completedAt` to now
6. Returns the saved record

**Query:** `readingProgress`

**Files:**
- `src/graphql/queries/ReadingProgress/index.ts`
- `src/graphql/queries/ReadingProgress/resolver.ts`

Args: `{ bookId: ID! }`

Return type: `{ records: [ReadingProgressRecord!]! }` where each record exposes `chapterId`, `progress`, `completedAt`, and `updatedAt`.

The resolver:
1. Authenticates the user from `context.req.user`
2. Queries `reading-progress` collection where `user = currentUser AND book = bookId`
3. Returns the matching records

**Why GraphQL instead of REST:** The blog already POSTs to `/api/graphql` for all data operations. Adding a custom query keeps the blog's data layer uniform. The blog sends the Better Auth session token in the `Authorization: Bearer <token>` header on the GraphQL POST, and Payload's Better Auth strategy resolves it to `req.user` just as it does for collection access functions.

### 3. Blog Side

**Chapter page** (`/books/[slug]/chapters/[chapterSlug].tsx`):
- On mount, optionally restore last known scroll position from localStorage or the progress query
- Attach a debounced `scroll` listener (300ms debounce, cap at 1 call per 5 seconds)
- Calculate `scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100`
- Call the `saveReadingProgress` mutation via the blog's GraphQL client (e.g., `fetchAPI` in `common/apis/base.ts`), including the session token in the `Authorization` header

**Book detail page** (`/books/[slug].tsx`):
- In `getServerSideProps`, call the `readingProgress(bookId: xxx)` query with the session token forwarded in the `Authorization` header
- Map returned records to `{ [chapterId]: progress }`
- Derive `continueChapterId` = the chapter with highest `updatedAt` where progress < 95%
- Render a "Continue reading" button linking to that chapter

**Anonymous users:** Skip all progress tracking silently. Optional localStorage fallback keyed by `chapter-progress-${chapterId}`; syncing to server on login is a future enhancement.

---

## B. Bookmarks

### Goal

A bookmark button on chapter and book pages. A "Your shelf" page showing all saved items.

### 1. New Payload Collection: `Bookmarks`

**File:** `src/collections/Bookmarks.ts`

Fields:

| Field | Type | Notes |
|---|---|---|
| `user` | relationship → users | required, index |
| `contentType` | select: `chapter`, `book` | required |
| `chapter` | relationship → chapters | conditional on `contentType === 'chapter'` |
| `book` | relationship → books | conditional on `contentType === 'book'` |
| `createdAt` | date | auto-managed |

**Access:** Same user-scoped pattern as `ReadingProgress` — reads and writes filtered to `req.user.id`, admin sees all.

**Uniqueness:** Exactly one bookmark per user per content item. Use a `beforeChange` hook upsert: query `(user, chapter)` or `(user, book)` and return the existing document ID if found. Do not rely on database-level composite unique constraints.

**Migration needed:** yes.

### 2. GraphQL Mutations and Queries

**Mutation:** `createBookmark`

**Files:**
- `src/graphql/mutations/CreateBookmark/index.ts`
- `src/graphql/mutations/CreateBookmark/resolver.ts`

Args: `{ contentType: String!, chapterId: ID, bookId: ID }`

Return type: `{ bookmark: Bookmark, created: Boolean! }` — `created` is `false` if an existing bookmark was returned.

The resolver:
1. Authenticates the user
2. Validates that exactly one of `chapterId` or `bookId` is provided, matching `contentType`
3. Queries for existing bookmark by `(user, chapter)` or `(user, book)`
4. Returns existing if found; otherwise creates new
5. Returns the bookmark record so the client has the `id` for deletion

**Mutation:** `deleteBookmark`

**Files:**
- `src/graphql/mutations/DeleteBookmark/index.ts`
- `src/graphql/mutations/DeleteBookmark/resolver.ts`

Args: `{ id: ID! }`

Return type: `{ ok: Boolean! }`

The resolver:
1. Authenticates the user
2. Loads the bookmark by ID
3. Verifies `bookmark.user === req.user.id` (or admin)
4. Deletes via `payload.delete`
5. Returns `{ ok: true }`

**Query:** `bookmarks`

**Files:**
- `src/graphql/queries/Bookmarks/index.ts`
- `src/graphql/queries/Bookmarks/resolver.ts`

Args: `{ contentType: String, contentId: ID }` — both optional

Return type: `{ docs: [Bookmark!]!, totalDocs: Int! }`

The resolver:
1. Authenticates the user
2. If `contentType` and `contentId` are provided: returns at most one matching bookmark (used to initialize button state)
3. Otherwise: returns paginated bookmarks for the current user
4. Admin can pass `userId` to query another user's bookmarks (optional future enhancement)

### 3. Blog Side

**Bookmark button component** (`components/shared/bookmark-button.tsx`):
- On mount: call `bookmarks(contentType: "chapter", contentId: xxx)` GraphQL query → initializes filled/empty state
- On click: toggle. If bookmarked → `deleteBookmark(id)` mutation; else → `createBookmark(...)` mutation
- Optimistic UI: flip state immediately, revert on error
- Hidden for anonymous users

**"Your shelf" page** (`/shelf`):
- `getServerSideProps`: call `bookmarks` query with forwarded session token
- Render grouped lists: bookmarked books first, then bookmarked chapters

---

## C. EPUB Export from Admin

### Goal

A "Download as EPUB" button on the Book document in Payload admin. Generates an EPUB from the current chapter content. **Only the book uploader (owner) can export.**

### 1. Access Rule

The export is restricted to the book owner only (the user whose ID matches the book's `createdBy` field). Admin can view the book but cannot export it unless they are the owner. Reuse the existing `ownerAccess('createdBy')` logic.

### 2. GraphQL Mutation + Download Flow

GraphQL returns JSON, not binary files. The export flow is therefore split into two steps:

1. **GraphQL mutation** generates the EPUB, stores it temporarily, and returns a signed download URL.
2. **Browser** navigates to the download URL to receive the binary file.

**Mutation:** `generateEpub`

**Files:**
- `src/graphql/mutations/GenerateEpub/index.ts`
- `src/graphql/mutations/GenerateEpub/resolver.ts`

Args: `{ bookId: ID! }`

Return type: `{ downloadUrl: String!, filename: String!, expiresAt: String! }`

The resolver:
1. Authenticates the user from `context.req.user`
2. Fetches the book by ID via `payload.findByID` with `overrideAccess: false`
3. Verifies `req.user.id === book.createdBy`
4. Fetches all chapters for this book, ordered by `order`
5. Converts each chapter's Lexical JSON content to HTML
6. Packages chapters into an EPUB Buffer using `epub-gen-memory`
7. Stores the Buffer as a temporary file (e.g., in local `.payload/temp/` or uploads to R2 with a short-lived key)
8. Generates a temporary signed download URL (or a short random path served by a lightweight Next.js route)
9. Returns `{ downloadUrl, filename: "<book-slug>.epub", expiresAt }`

**Lexical to HTML:** Check `src/utils/epubLexical.ts` first — it may already contain serialization helpers. If not, implement a recursive walker that handles the node types actually used in chapters: paragraphs, headings, bold/italic/underline inline, links, images, horizontal rules. Custom features from `src/features/` (callouts, footnotes, YouTube) may need custom serializers.

**Temporary download route:** `src/app/api/epub-download/[token]/route.ts`

This is a minimal, stateless HTTP GET route that:
1. Validates the temporary token from the URL
2. Streams the generated EPUB file from storage
3. Sets `Content-Type: application/epub+zip` and `Content-Disposition: attachment; filename="..."`
4. The token can be a signed JWT or HMAC containing `{ bookId, timestamp }`, validated against `PAYLOAD_SECRET`

> **Why this split is necessary:** GraphQL is a JSON-over-HTTP protocol. It cannot efficiently transfer binary file downloads. The mutation handles auth, generation, and business logic; the download route handles only the binary transfer. This is analogous to how signed URL patterns work in S3/R2.

### 3. Admin UI Button

**File:** `src/components/admin/books/DownloadEpubButton.tsx`

Follow the existing admin component patterns:
- Use `'use client'`
- Use `useDocumentInfo` from `@payloadcms/ui` to get the current book ID
- Use `Button` from `@payloadcms/ui`
- Disable the button when `bookId` is null (unsaved document)
- On click:
  1. Call the `generateEpub(bookId: xxx)` GraphQL mutation via `requestJSON` or a GraphQL client
  2. Receive `{ downloadUrl }`
  3. Set `window.location.href = downloadUrl`

Register in `Books.ts` under `admin.components.edit.beforeDocumentControls` alongside the existing controls (`DeleteBookButton`, `ChapterListButton`, `BookAccessPanel`, `ReconcileGrantsButton`).

### 4. Notes

- For very large books (100+ chapters), synchronous generation may hit serverless timeouts. The MVP uses synchronous generation; a future enhancement could queue the job and poll for completion.
- The existing `scripts/epub-probe.ts` demonstrates the EPUB-to-Payload pipeline. Export is the reverse direction.
- Add `epub-gen-memory` to `package.json`.

---

## D. Editor Preview Mode

### Goal

An editor working on a draft chapter or post can click "Preview on blog" and see exactly how the content will appear on `blog.quanghuy.dev` without publishing it.

This uses Next.js Draft Mode (the successor to Preview Mode). The blog uses **Pages Router** (`pages/` directory), so the implementation must use `res.setDraftMode({ enable: true })` in API routes and `context.draftMode?.isEnabled` in `getServerSideProps`. The `draftMode()` function from `next/headers` is App Router only and must not be used.

### 1. Mechanism Overview

```
1. Editor clicks "Preview on blog" in Payload admin
2. Payload issues a signed, short-lived preview token via GraphQL query
3. Blog receives the token at /api/draft?token=...&redirect=...
4. Blog validates the token, enables Next.js Draft Mode for this browser session
5. Next.js Draft Mode tells the GraphQL client to include draft content
6. Blog renders the draft with a "Preview mode" banner
7. Visiting /api/draft-exit disables Draft Mode
```

### 2. Preview Token GraphQL Query

**Query:** `previewToken`

**Files:**
- `src/graphql/queries/PreviewToken/index.ts`
- `src/graphql/queries/PreviewToken/resolver.ts`

Args: `{ docType: String!, docId: ID! }` where `docType` is `"books"` or `"posts"`

Return type: `{ token: String!, slug: String! }`

The resolver:
1. Authenticates the user from `context.req.user`
2. Fetches the document by `docType` and `docId`
3. Verifies admin or owner access (`isAdminUser` or `ownerAccess` check against `createdBy`/`author`)
4. Generates a signed token:
   ```ts
   const payload = JSON.stringify({ docType, docId, slug, expiresAt: Date.now() + 15 * 60 * 1000 })
   const sig = createHmac('sha256', process.env.PAYLOAD_SECRET!).update(payload).digest('base64url')
   const token = Buffer.from(payload).toString('base64url') + '.' + sig
   ```
5. Returns `{ token, slug }`

Expiry: 15 minutes. Short enough that leaked tokens expire quickly.

### 3. Blog Draft Mode Route

**In next-blog repo:**

`pages/api/draft.ts`:
- Parse `token` and `redirect` from query
- Split token on last `.` into payload and signature
- Recompute HMAC using `process.env.PREVIEW_SECRET` (same value as Payload's `PAYLOAD_SECRET`)
- Use `timingSafeEqual` for constant-time comparison
- Parse payload JSON, check `expiresAt`
- Call `res.setDraftMode({ enable: true })`
- Redirect to the requested path

`pages/api/draft-exit.ts`:
- Call `res.setDraftMode({ enable: false })`
- Redirect to `/`

### 4. Blog GraphQL Client Change

In `getServerSideProps` for book/chapter/post pages:

```ts
const isDraft = context.draftMode?.isEnabled ?? false
```

When `isDraft` is true, the GraphQL query should include `_status: { in: ['published', 'draft'] }` in the `where` filter. This tells Payload to return draft versions alongside published ones.

### 5. Admin UI Button

**File:** `src/components/admin/books/PreviewOnBlogButton.tsx` (and a similar one for Posts)

The component:
1. Calls the `previewToken(docType: "books", docId: bookId)` GraphQL query via the existing admin fetch pattern
2. Receives `{ token, slug }`
3. Opens a new tab: `${NEXT_PUBLIC_BLOG_URL}/api/draft?token=${token}&redirect=${encodeURIComponent(`/books/${slug}`)}`

`NEXT_PUBLIC_BLOG_URL` should be an env var (e.g., `https://blog.quanghuy.dev`).

Register in `Books.ts` and `Posts.ts` under `admin.components.edit.beforeDocumentControls`.

### 6. Draft Banner

In the blog's Layout component, receive an `isDraftMode` boolean prop from `getServerSideProps` (derived from `context.draftMode?.isEnabled`). Render a sticky top banner:

```
[Draft preview mode] This is unpublished content. [Exit preview]
```

"Exit preview" links to `/api/draft-exit`.

### 7. Checklist

- [ ] `previewToken` GraphQL query in payloadcms
- [ ] `PreviewOnBlogButton` admin component, registered on Books and Posts
- [ ] Blog: `pages/api/draft.ts` and `pages/api/draft-exit.ts`
- [ ] Blog: `PREVIEW_SECRET` env var (same value as Payload `PAYLOAD_SECRET`)
- [ ] Blog: check `context.draftMode?.isEnabled` in `getServerSideProps`
- [ ] Blog: draft banner in Layout
- [ ] Blog: pass draft flag to GraphQL queries

---

## E. Comments

### Goal

An in-house comment system on chapters and posts. Up to 2 levels of threading (a top-level comment and one layer of replies). Admin moderation via `status` field in Payload admin. Comments on private book chapters inherit book visibility from the grant mirror — no separate Auther entity type needed.

> **Important:** This feature was planned in `feature-brainstorm.md` (section 1c) but was accidentally omitted from the original Phase 2 document. It is restored here.

> **Write permission note:** For Phase 2, the rule is **"can read = can comment."** Any authenticated user who can view a chapter or post can post a comment on it. This is the simplest correct default given the existing access infrastructure. A future iteration may add a separate `commenter` relation in Auther if write permission needs to differ from read permission.

### 1. New Payload Collection: `Comments`

**File:** `src/collections/Comments.ts`

Fields:

| Field | Type | Notes |
|---|---|---|
| `chapter` | relationship → chapters | required if `post` is empty |
| `post` | relationship → posts | required if `chapter` is empty |
| `author` | relationship → users | required, the comment writer |
| `content` | textarea | required, the comment text |
| `status` | select: `pending`, `approved`, `rejected` | required, default `pending` |
| `parentComment` | relationship → comments | optional, for threaded replies |
| `createdAt` | date | auto-managed |

Exactly one of `chapter` or `post` must be set. A `beforeValidate` hook should enforce this mutual exclusivity.

**Access control:**

- `create`: `authenticatedAccess` — any logged-in user can submit a comment
- `read`: This is the most important access rule. Comments on **public** chapters/posts are readable by anyone. Comments on **private book chapters** are only readable by users who have access to the parent book.

  The implementation reuses the existing grant mirror lookup from `src/utils/access.ts`:
  1. If the requester is admin → return `true`
  2. If anonymous → return only comments on public content
  3. If authenticated → call `getGrantedPrivateBookIds(req, sessionToken, userId)` (already in `access.ts`)
  4. Build a query: comments where `chapter.book.visibility = public` OR `chapter.book IN [grantedPrivateBookIds]`

  If Payload's SQLite adapter cannot express `chapter.book.visibility` cleanly in an access function, use a `beforeOperation` hook on the `comments` collection to query private book IDs and append a `chapter: { not_in: [...lockedChapterIds] }` filter. The `beforeOperation` hook pattern is already used as a fallback in Phase 1 for chapter access.

  For **posts**, the rule is simpler: `postsReadAccess` already handles post visibility. Comments on posts inherit from the post's existing access rules.

- `update`: Admin can update any comment (to moderate). The author can update their own pending comment, but not once it is approved (to prevent editing after publication). Reuse `adminOrSelfAccess` with an additional status check.
- `delete`: Admin only for now.

**Do NOT add a `comment` entity type in Auther.** Comments derive visibility from their parent book. The grant mirror's generic `entityType` field (`book`, `chapter`, `comment`) was designed to support this without schema changes. See `docs/authz-local-projection-plan_detail.md` section 12 item 3.

**Migration needed:** yes.

### 2. GraphQL Queries and Mutations

**Query:** `comments`

**Files:**
- `src/graphql/queries/Comments/index.ts`
- `src/graphql/queries/Comments/resolver.ts`

Args: `{ chapterId: ID, postId: ID, status: String }` — at least one of `chapterId` or `postId` is required

Return type: `{ docs: [Comment!]!, totalDocs: Int! }`

The resolver:
1. Validates that exactly one of `chapterId` or `postId` is provided
2. Queries the `comments` collection with the appropriate filter
3. For non-admin users, implicitly filters by `status: 'approved'` unless the user is the author
4. Returns comments ordered by `createdAt` ascending

> **Note on access inheritance:** Because the `comments` collection already has a `read` access function that derives visibility from the parent book, the GraphQL resolver does not need to duplicate this logic. The collection-level access function is invoked automatically by Payload when `overrideAccess: false` is used (the default). The resolver should trust the collection access function and not apply additional visibility filters.

**Mutation:** `createComment`

**Files:**
- `src/graphql/mutations/CreateComment/index.ts`
- `src/graphql/mutations/CreateComment/resolver.ts`

Args: `{ chapterId: ID, postId: ID, content: String!, parentCommentId: ID }`

Return type: `{ comment: Comment! }`

The resolver:
1. Authenticates the user
2. Validates mutual exclusivity of `chapterId` and `postId`
3. Verifies the parent content (chapter or post) exists and is readable by this user
4. If `parentCommentId` is provided, verifies it belongs to the same chapter/post
5. Creates the comment with `status: 'pending'` and `author: req.user.id`
6. Returns the created comment

**Mutation:** `updateCommentStatus`

**Files:**
- `src/graphql/mutations/UpdateCommentStatus/index.ts`
- `src/graphql/mutations/UpdateCommentStatus/resolver.ts`

Args: `{ id: ID!, status: String! }` where status is `approved` or `rejected`

Return type: `{ comment: Comment! }`

The resolver:
1. Authenticates the user
2. Verifies admin role
3. Updates the comment status
4. Returns the updated comment

> **Why no `deleteComment` mutation in Phase 2:** Admin deletes comments directly from the Payload admin UI. A GraphQL mutation for deletion can be added later if the blog needs a "delete my comment" feature.

### 3. Blog Side

**Comment rendering** (`components/shared/comments-section.tsx`):
- Fetch comments via the `comments(chapterId: xxx)` or `comments(postId: xxx)` GraphQL query
- Filter to `status: 'approved'` on the client side (the server already filters for non-admins, but double-checking is harmless)
- Render top-level comments first (where `parentComment` is null)
- For each top-level comment, render up to one level of replies (where `parentComment.id` equals the top-level comment ID)
- Do not render deeper nesting — the UI should flatten anything beyond 2 levels

**Comment submission**:
- Authenticated users see a textarea + submit button
- Call the `createComment(...)` GraphQL mutation via the blog's GraphQL client, with the session token in the `Authorization` header
- New comments default to `status: 'pending'` and appear only after admin approval
- Show a "Your comment is awaiting moderation" message after submission

**Anonymous users:** Hide the comment form entirely. Show existing approved comments.

### 4. Admin Moderation

In Payload admin:
- The `Comments` collection list view shows `author`, `chapter`/`post`, `status`, and `createdAt`
- Admin can edit a comment to change `status` from `pending` → `approved` or `rejected`
- Admin can delete spam comments

A future enhancement could add an email notification or webhook when a new pending comment is submitted.

---

## Combined Migration Checklist

### payloadcms
- [ ] Create `src/collections/ReadingProgress.ts`, register in `payload.config.ts`
- [ ] Create `src/collections/Bookmarks.ts`, register in `payload.config.ts`
- [ ] Create `src/collections/Comments.ts`, register in `payload.config.ts`
- [ ] `pnpm payload migrate:create` for each schema change (3 migrations total)
- [ ] `pnpm generate:types`
- [ ] Build GraphQL mutation `SaveReadingProgress` (`src/graphql/mutations/SaveReadingProgress/`)
- [ ] Build GraphQL query `ReadingProgress` (`src/graphql/queries/ReadingProgress/`)
- [ ] Build GraphQL mutation `CreateBookmark` (`src/graphql/mutations/CreateBookmark/`)
- [ ] Build GraphQL mutation `DeleteBookmark` (`src/graphql/mutations/DeleteBookmark/`)
- [ ] Build GraphQL query `Bookmarks` (`src/graphql/queries/Bookmarks/`)
- [ ] Build GraphQL mutation `GenerateEpub` (`src/graphql/mutations/GenerateEpub/`)
- [ ] Build temporary download route `src/app/api/epub-download/[token]/route.ts`
- [ ] Build GraphQL query `PreviewToken` (`src/graphql/queries/PreviewToken/`)
- [ ] Build GraphQL query `Comments` (`src/graphql/queries/Comments/`)
- [ ] Build GraphQL mutation `CreateComment` (`src/graphql/mutations/CreateComment/`)
- [ ] Build GraphQL mutation `UpdateCommentStatus` (`src/graphql/mutations/UpdateCommentStatus/`)
- [ ] Register all new queries/mutations in `src/graphql/queries/index.ts` and `src/graphql/mutations/index.ts`
- [ ] Build admin components: `DownloadEpubButton.tsx`, `PreviewOnBlogButton.tsx` (Books + Posts variants)
- [ ] Register admin buttons in `Books.ts` and `Posts.ts` `admin.components.edit.beforeDocumentControls`
- [ ] `pnpm tsc --noEmit`
- [ ] `pnpm test:int`

### next-blog
- [ ] Reading progress: debounced scroll save, restore position, "Continue reading" CTA
- [ ] Bookmark button component + shelf page
- [ ] `pages/api/draft.ts` + `pages/api/draft-exit.ts`
- [ ] Draft mode banner in Layout
- [ ] Pass `context.draftMode?.isEnabled` to GraphQL queries (`_status: { in: ['published', 'draft'] }`)
- [ ] Comments section component (fetch via `comments` query, render 2-level threading, submit via `createComment` mutation)
- [ ] `PREVIEW_SECRET` env var (same value as Payload `PAYLOAD_SECRET`)

---

## Appendix: Reusable Utilities and Patterns

When implementing Phase 2, always check `src/utils/` before writing new logic:

| Utility | Purpose |
|---|---|
| `isAdminUser`, `getUserId`, `authenticatedAccess`, `ownerAccess`, `adminOrSelfAccess` | Access control building blocks |
| `enforceOwnershipHook` | `beforeValidate` hook ensuring users can only set relationship fields to themselves |
| `normalizeEntityId` | Converts string IDs to numbers for SQLite compatibility |
| `requestJSON`, `requestJSONWithRetry` | Typed fetch wrappers with retry logic |
| `getAutherBaseUrl`, `getAutherApiKey`, `getAutherClientId` | Env var getters for Auther integration |
| `extractTokenFromHeaders` | Pulls Bearer token from request headers |
| `getGrantedPrivateBookIds` / `resolveBooksReadAccess` / `resolveChaptersReadAccess` | Grant mirror read path — reuse for Comments access |

**Hard rules from AGENTS.md:**
1. Never remove `// @ts-ignore` comments.
2. Never manually edit generated files (`payload-types.ts`, `importMap.js`, `(payload)/layout.tsx`). Regenerate them.
3. Centralize shared logic in `src/utils/`.
4. Use the Context7 MCP for library-specific details rather than guessing.
