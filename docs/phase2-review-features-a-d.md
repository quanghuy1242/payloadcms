# Phase 2 Review (Features A-D) — Environment Variables & Code Review

> Reviewed against `docs/reader_experience_reading_features_2.md`  
> Commits: `fee1f0c` → `3cba32d` (last 4 commits)  
> Date: 2026-04-29

---

## 1. New Environment Variables Required

The last 4 commits introduced **two new environment variables** that are **not yet in `.env.example`** or `src/lib/env.ts`.

| Variable | Required? | Used By | Purpose |
|----------|-----------|---------|---------|
| `NEXT_PUBLIC_BLOG_URL` | **Yes** | `PreviewOnBlogButton.tsx` | Base URL of the Next.js blog (e.g. `https://blog.quanghuy.dev`). The admin button throws at runtime if this is missing. |
| `NEXT_PUBLIC_SITE_URL` | No (fallback exists) | `epubExport.ts` → `getEpubExportBaseURL()` | Public URL of this PayloadCMS instance. Used to build absolute EPUB download URLs and resolve media URLs when the request origin is unavailable. Falls back to `VERCEL_URL` → `http://localhost:3000`. |

### Recommended `.env.example` additions

```bash
# Required for "Preview on blog" admin button (Feature D)
NEXT_PUBLIC_BLOG_URL=https://blog.quanghuy.dev

# Optional: canonical public URL of this CMS (Feature C EPUB export fallback)
NEXT_PUBLIC_SITE_URL=https://cms.quanghuy.dev
```

> **Build-time note:** Both are `NEXT_PUBLIC_` prefixed, so they must be available at **build time** to be inlined into the client bundle.

---

## 2. Feature-by-Feature Review

### Feature A — Reading Progress

| Plan Item | Status | Notes |
|-----------|--------|-------|
| `ReadingProgress` collection | ✅ | All fields present (`user`, `book`, `chapter`, `progress`, `completedAt`). Access uses `ownerAccess('user')` + `authenticatedAccess`. Hidden from admin nav. |
| `enforceOwnershipHook('user')` | ✅ | Prevents non-admin users from setting `user` to someone else. |
| `beforeChange` upsert hook | ✅ | `readingProgressBeforeChangeHook` queries existing `(user, chapter)` and injects `id` on create to prevent duplicates. |
| `saveReadingProgress` mutation | ✅ | Args, return type, auth, progress non-regression (`> storedProgress`), `completedAt` at `>= 95`, chapter/book integrity check all match spec. |
| `readingProgress` query | ✅ | Returns `{ records: [{ chapterId, progress, completedAt, updatedAt }] }` filtered by `user + book`. |
| Migration | ✅ | `20260428_153110.ts` creates table + indexes. |
| `payload-types.ts` | ✅ | `ReadingProgress` interface generated. |

**Minor observations (not bugs):**
- The `readingProgress` query does **not apply a `sort`**. Results come back in database order. The blog will need to sort client-side (e.g. by `updatedAt` desc) to derive the "continue reading" chapter.
- The `beforeChange` hook only upserts on `create` operations. The GraphQL resolver handles upserts manually for its own `create`/`update` paths, so this is only relevant for direct REST/GraphQL collection API usage.

---

### Feature B — Bookmarks

| Plan Item | Status | Notes |
|-----------|--------|-------|
| `Bookmarks` collection | ✅ | Fields, access, hidden admin nav, hooks all present. |
| `createBookmark` mutation | ✅ | Validates `contentType`, mutual exclusivity of `chapterId`/`bookId`, checks existence, returns `{ bookmark, created }` with idempotency. |
| `deleteBookmark` mutation | ✅ | Owner/admin check, returns `{ ok }`. |
| `bookmarks` query | ⚠️ | Returns `{ docs, totalDocs }` with pagination. **See Bug #2 below.** |
| Migration | ✅ | Same migration as ReadingProgress. |
| `payload-types.ts` | ✅ | `Bookmark` interface generated. |

**Bug #2 — `bookmarks` query filter is too strict**

The resolver treats `contentType` and `contentId` as an all-or-nothing filter:

```ts
const hasContentFilter = args.contentType != null || args.contentId != null
if (hasContentFilter) {
  if (!isReaderContentType(args.contentType)) {
    throw new Error('Invalid contentType')
  }
  const contentId = normalizeEntityId(args.contentId)
  if (contentId == null) {
    throw new Error('Invalid contentId')
  }
```

**Impact:** A client that sends `{ contentId: '7' }` without `contentType` gets `Error: Invalid contentType`. A client that sends `{ contentType: 'chapter' }` without `contentId` gets `Error: Invalid contentId`.

The spec says both args are optional. The implementation effectively requires **both** when either is present. This prevents queries like "all my chapter bookmarks".

**Suggested fix:** Make the filter independent:
- If `contentType` is provided, filter by `contentType`.
- If `contentId` is provided, require `contentType` and filter by both.
- If neither is provided, return paginated results for the user.

**Security consideration — `depth: 1` leaks private book data**

The `bookmarks` resolver uses `depth: 1`:

```ts
const result = await payload.find({
  collection: 'bookmarks',
  where: { and: conditions },
  depth: 1,
  ...
})
```

This populates the full `book` and `chapter` documents in the response. If a user bookmarked a book while it was public, and the book later becomes private, the user still receives the full book payload through their bookmark. Since the bookmark belongs to the user, this is low-risk, but it bypasses the book's current `read` access control.

**Suggested fix:** Use `depth: 0` and let the blog fetch book/chapter details separately via its own authenticated queries.

---

### Feature C — EPUB Export from Admin

| Plan Item | Status | Notes |
|-----------|--------|-------|
| `generateEpub` mutation | ⚠️ | Returns signed URL. **See Bug #1 below.** |
| `epub-download/[token]/route.ts` | ✅ | Stateless token validation, owner check, chapter fetch, Lexical→HTML, EPUB generation, proper response headers. |
| `DownloadEpubButton` | ✅ | Follows admin UI patterns, disabled when unsaved, calls mutation, navigates to download URL. |
| `lexicalToHtml.ts` | ✅ | Handles paragraphs, headings, lists, links, quotes, tables, code blocks, callouts, footnotes, uploads, YouTube, horizontal rules, line breaks. |
| `epub-gen-memory` dependency | ✅ | Added to `package.json`. |
| Admin button registration | ✅ | Registered in `Books.ts` `beforeDocumentControls`. |

**Bug #1 — `generateEpubResolver` calls `findByID` without `req`, breaking access control for private books**

```ts
const book = await payload.findByID({
  collection: 'books',
  id: bookId,
  overrideAccess: false,  // <-- access check enabled
})
```

`findByID` is called on the `payload` instance without passing `req`. The `Books` collection `read` access function is `publicBooksReadAccess`, which needs `req.user` to determine if the user owns the book or has a private grant. When `req` is missing, `req.user` is undefined, so the access function falls back to the **anonymous** path (`public` + `published` only).

**Impact:** A non-admin user who owns a **private** book will see `Book not found` when clicking "Download as EPUB", even though they can see the book in the admin.

**Fix:** Pass the request context:

```ts
const book = await payload.findByID({
  collection: 'books',
  id: bookId,
  overrideAccess: false,
  req: context.req,  // <-- add this
})
```

**Deviation from plan — fully stateless EPUB generation**

The plan says:
> 6. Packages chapters into an EPUB Buffer using `epub-gen-memory`  
> 7. Stores the Buffer as a temporary file (e.g., in local `.payload/temp/` or uploads to R2 with a short-lived key)

The implementation skips temporary storage entirely. The GraphQL mutation generates a signed token and returns a URL; the actual EPUB is built on-the-fly inside `GET /api/epub-download/[token]`. **This is an improvement** — it avoids storage cleanup, race conditions, and R2 temp-key complexity. The deviation is noted but not a bug.

**Minor observations:**
- The download route fetches chapters with `limit: 1000`. A book with more than 1000 chapters would be truncated. Extremely unlikely for real books.
- The EPUB does not include the book's `cover` image. Nice-to-have, not required by the spec.
- `lexicalToHtml` does not handle Lexical `autolink` nodes explicitly. They fall through to the default case and render as plain text (content is preserved, link styling is lost). Minor.

---

### Feature D — Editor Preview Mode

| Plan Item | Status | Notes |
|-----------|--------|-------|
| `previewToken` GraphQL query | ✅ | Args, return type, HMAC token with 15-min expiry, admin + owner access control all correct. |
| `PreviewOnBlogButton` | ✅ | Shared component for Books and Posts, handles both collections, encodes token and redirect URL properly. |
| Admin button registration | ✅ | Registered in `Books.ts` and `Posts.ts`. |

**Minor observations:**
- The preview token contains `{ docType, docId, slug, expiresAt }` but **not `userId`**. The blog cannot verify which user generated the token. This is acceptable because the token is signed and short-lived, but it means a leaked token can be used by anyone for 15 minutes.
- The resolver allows previewing **published** documents too. Harmless — it just enables draft mode unnecessarily.
- `ownerFieldForDocType` correctly maps `books` → `createdBy` and `posts` → `author`.

---

## 3. Missing Implementation (Expected)

| Plan Item | Status | Reason |
|-----------|--------|--------|
| Feature E (Comments) | ❌ Not implemented | Per instruction, only A-D were implemented. |
| `Comments` collection | ❌ Absent | Planned for future phase. |
| `createComment` / `updateCommentStatus` mutations | ❌ Absent | Planned for future phase. |
| Blog-side routes (`/api/draft`, `/api/draft-exit`) | ❌ Not in this repo | Belongs to `next-blog` repo. |

---

## 4. Test Results

| Test File | Status |
|-----------|--------|
| `tests/int/reading-progress-and-bookmarks.int.spec.ts` | ✅ Pass |
| `tests/int/generate-epub-resolver.int.spec.ts` | ✅ Pass |
| `tests/int/preview-token.int.spec.ts` | ✅ Pass |
| `tests/int/lexical-to-html.int.spec.ts` | ✅ Pass |
| `tests/int/download-epub-button.int.spec.ts` | ✅ Pass |
| `tests/int/preview-on-blog-button.int.spec.ts` | ✅ Pass |
| `tests/int/books-admin-config.int.spec.ts` | ✅ Pass |
| `pnpm tsc --noEmit` | ✅ Pass |

> Note: Two unrelated test failures were observed (`api.int.spec.ts` — Turso network error; `auther-webhook-route.int.spec.ts` — pre-existing 400/200 mismatch). These are **not** caused by the Phase 2 changes.

---

## 5. Summary of Action Items

### Must Fix

1. **Bug #1** — Add `req: context.req` to `findByID` in `generateEpubResolver` so private book owners can export EPUBs.
2. **Env vars** — Add `NEXT_PUBLIC_BLOG_URL` (and optionally `NEXT_PUBLIC_SITE_URL`) to `.env.example`.

### Should Fix

3. **Bug #2** — Relax `bookmarks` resolver filter logic so `contentType` and `contentId` can be used independently, or at least provide a clearer error when only one is supplied.
4. **Security** — Consider changing `bookmarks` query `depth` from `1` to `0` to avoid embedding full book/chapter documents in bookmark responses.

### Nice to Have

5. Add `NEXT_PUBLIC_SITE_URL` getter to `src/lib/env.ts` for consistency with other env accessors.
6. Sort `readingProgress` query results by `updatedAt` desc to make "continue reading" derivation easier for the blog.
7. Include book `cover` image in the generated EPUB.
8. Add `req` passthrough audit for other `overrideAccess: false` operations in GraphQL resolvers (future hygiene task).
