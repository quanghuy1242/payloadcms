# Reader Experience - Reading Features (Phase 2)

Four features in this phase:

- **A. Reading progress** - track how far a reader has gotten in a chapter and across a book.
- **B. Bookmarks** - save chapters and posts to a personal shelf.
- **C. EPUB export from admin** - download a book as EPUB from the Payload admin Book document.
- **D. Editor preview mode** - preview an unpublished book or post on the blog exactly as it will appear, via a signed draft token.

Features A and B require a logged-in user (Payload session). C is admin-only. D is for editors (admin or owner).

---

## A. Reading Progress

### Goal

Show a "Continue reading" CTA on the book detail page pointing to the last chapter the user was reading, and show a progress indicator per chapter in the ToC. Save progress automatically as the user scrolls.

### 1. New Payload Collection: `ReadingProgress`

```
src/collections/ReadingProgress.ts
```

Fields:

| Field | Type | Notes |
|---|---|---|
| `user` | relationship → users | required, index |
| `book` | relationship → books | required, index |
| `chapter` | relationship → chapters | required, index |
| `progress` | number | 0-100, represents scroll % through the chapter |
| `completedAt` | date | set when progress reaches ~95% |
| `updatedAt` | date | auto-managed |

Access:
- `create`: authenticated, and `data.user === req.user.id` (enforced in `beforeValidate`)
- `read`: `user equals req.user.id` filter, or admin
- `update`: same as read
- `delete`: same as read

This is a user-scoped collection. Use a compound unique constraint on `(user, chapter)` so there is always exactly one progress record per user per chapter. Enforce this with a `beforeChange` hook: attempt to find an existing record for `(user, chapter)` and upsert instead of creating a duplicate.

**Migration needed**: yes.

### 2. Payload API Route for Upsert

Reading progress needs to be updated frequently (on scroll), so make it a lightweight custom endpoint rather than going through Payload's full REST layer.

**Route location**: `src/app/api/reading-progress/route.ts` (NOT inside `src/app/(payload)/api/` — that route group is reserved for Payload's own catch-all handler; custom routes placed there will conflict with `[...slug]`).

```
**Authentication in these routes**: The routes use `payload.auth({ headers: req.headers })` to authenticate the request. Payload's `betterAuthStrategy` allows the Better Auth session token issued by Auther to be validated here, so if the user has a valid `Authorization: Bearer <token>` header, Payload treats them as authenticated. The blog calls these routes from the browser with `credentials: 'include'`, which sends the `better-auth.session_token` cookie. For this to work cross-origin (`blog.quanghuy.dev` → `payload.quanghuy.dev`), the cookie must be set on the shared parent domain `.quanghuy.dev` (see Auther's cookie domain config). Verify Payload's CORS config in `payload.config.ts` already allows `blog.quanghuy.dev`.

**Server-side calls in `getServerSideProps`**: For the book detail page's `GET /api/reading-progress?bookId=xxx`, since this call originates from the server (not the browser), you must manually extract and forward the cookie:

```ts
// In getServerSideProps for /books/[slug]:
const sessionToken = context.req.cookies['better-auth.session_token']
if (sessionToken) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL}/api/reading-progress?bookId=${book.id}`,
    { headers: { Authorization: `Bearer ${sessionToken}` } }
  )
  // ...
}
```

`POST /api/reading-progress`
Body: `{ chapterId, bookId, progress }`
Auth: `Authorization: Bearer <token>` (forwarded by browser via `credentials: 'include'`)
```

The route:
1. Authenticates the request via `payload.auth({ headers: req.headers })`
2. Looks up existing `ReadingProgress` record for `(user.id, chapterId)`
3. If found: `payload.update(...)` only if new progress > stored progress (never go backwards)
4. If not found: `payload.create(...)`
5. Returns `{ ok: true }`

Keep it small - no depth expansion, no extra fields in the response.

`GET /api/reading-progress?bookId=xxx` - returns all progress records for the current user for a given book. Used by the book detail page to populate the ToC progress bars.

### 3. Blog Side

**Chapter page** (`/books/[slug]/chapters/[chapterSlug].tsx`):

- On mount, fetch `GET /api/reading-progress?bookId=xxx` to restore last known position (optional, could just start from top).
- Attach a debounced `scroll` listener (300ms). Calculate `scrollPercent = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100`.
- On change, POST to `payload.quanghuy.dev/api/reading-progress` with credentials.
- Debounce to at most once every 5 seconds in practice to avoid hammering the API.

**Book detail page** (`/books/[slug].tsx`):

- On `getServerSideProps`, call `GET payload.quanghuy.dev/api/reading-progress?bookId=xxx` with the user's cookie forwarded.
- Map returned records to a `{ [chapterId]: progress }` lookup.
- Pass to the chapter list component to render a small progress bar or checkmark per chapter.
- Also derive `continueChapterId` = the chapter with highest `updatedAt` where progress is < 95%.
- Render a "Continue reading" button linking to that chapter.

**Anonymous users**: skip all of the above silently. Progress is lost on page navigation unless stored in localStorage as a fallback. To add localStorage: store `{ chapterId, progress, updatedAt }` keyed by `chapter-progress-${chapterId}` and sync to server on login (future enhancement, not required in this phase).

---

## B. Bookmarks

### Goal

A bookmark button on chapter and post pages. A "Your shelf" page or section in the blog showing all saved items.

### 1. New Payload Collection: `Bookmarks`

Fields:

| Field | Type | Notes |
|---|---|---|
| `user` | relationship → users | required, index |
| `contentType` | select: `chapter`, `post` | required |
| `chapter` | relationship → chapters | conditional on contentType |
| `post` | relationship → posts | conditional on contentType |
| `createdAt` | date | auto |

Access: same pattern as ReadingProgress - user-scoped reads and writes.

Enforce uniqueness: `(user, chapter)` or `(user, post)` - beforeChange hook to prevent duplicate bookmarks.

**Migration needed**: yes.

### 2. Payload API Routes

`POST /api/bookmarks` - body `{ contentType, chapterId | postId }` - create or return existing.

`DELETE /api/bookmarks/:id` - user can only delete their own bookmarks (verified in the handler).

`GET /api/bookmarks?contentType=chapter&contentId=xxx` - returns the bookmark record for the current user + this content, or null. Used to initialize the bookmark button state.

`GET /api/bookmarks` - returns all bookmarks for the current user (paginated). Used by the shelf page.

These can all be one route file at `src/app/api/bookmarks/route.ts` (GET/POST) and `src/app/api/bookmarks/[id]/route.ts` (DELETE).

### 3. Blog Side

**Bookmark button component** (`components/shared/bookmark-button.tsx`):
- On mount: `GET /api/bookmarks?contentType=chapter&contentId=xxx` with credentials → initializes filled/empty state.
- On click: toggle. If currently bookmarked → `DELETE /api/bookmarks/:id`. Else → `POST /api/bookmarks`.
- Optimistic UI: flip state immediately, revert on error.
- Hidden (or greyed out) for anonymous users.

**"Your shelf" page** (`/shelf` or a section on the books page):
- `getServerSideProps`: call `GET payload.quanghuy.dev/api/bookmarks` with forwarded cookie.
- Render a mixed list of bookmarked chapters and posts grouped by type.

---

## C. EPUB Export from Admin

### Goal

A "Download as EPUB" button on the Book document in Payload admin. Generates an EPUB from the current chapter content and serves it as a download. Admin and owner only.

### 1. Payload API Route

`GET /api/books/[id]/export-epub`

**Route location**: `src/app/api/books/[id]/export-epub/route.ts`

Auth: Payload cookie or API key, admin or owner of the book.

The handler:
1. Fetches the book + all chapters (ordered by `order`) using `payload.find` with `overrideAccess: false` (respect existing ownership checks).
2. For each chapter, converts the Lexical JSON content to HTML. This is the inverse of the EPUB import pipeline.
3. Packages the HTML chapters into an EPUB file using a server-side library.

**Lexical to HTML**: Payload's `@payloadcms/richtext-lexical` package exports a `convertLexicalToHTML` utility (or similar - check the exact export in the installed version). If not available, a recursive Lexical node walker that converts common node types (paragraphs, headings, text, images, links) to HTML strings is enough for basic export.

**EPUB packaging**: use `epub-gen-memory` npm package (pure JS, no native deps, works in Node.js serverless). It accepts an array of `{ title, content }` chapters and produces a Buffer.

Response: set `Content-Type: application/epub+zip` and `Content-Disposition: attachment; filename="<book-title>.epub"`, return the buffer.

### 2. Admin UI Button

`src/components/admin/books/DownloadEpubButton.tsx` (browser-only component):

```tsx
'use client'
export function DownloadEpubButton({ bookId }: { bookId: string }) {
  const handleDownload = () => {
    window.location.href = `/api/books/${bookId}/export-epub`
  }
  return <Button onClick={handleDownload}>Download EPUB</Button>
}
```

Register in `Books.ts` under `admin.components.edit.beforeDocumentControls`.

### 3. Notes

- Lexical to HTML conversion only needs to handle node types actually used in chapter content: headings, paragraphs, bold/italic/underline inline, links, images, horizontal rules. The epub callout and footnote features from `src/features/` may need custom serializers.
- For very large books (100+ chapters), streaming the response or generating asynchronously with a progress indicator would be better. For an MVP, synchronous is fine.
- The existing `scripts/epub-probe.ts` script demonstrates the EPUB-to-Payload pipeline. The export is the reverse path. Check `src/utils/` for any existing Lexical serialization helpers before writing new ones.

---

## D. Editor Preview Mode

### Goal

An editor working on a draft chapter or post can click "Preview on blog" and see exactly how the content will appear on `blog.quanghuy.dev` without publishing it.

This uses Next.js Draft Mode (the successor to Preview Mode).

### 1. Mechanism Overview

```
1. Editor clicks "Preview on blog" in Payload admin
2. Payload issues a signed, short-lived preview token
3. Blog receives the token at /api/draft?token=...&redirect=...
4. Blog validates the token, enables Next.js Draft Mode for this browser session
5. Next.js Draft Mode tells the GraphQL client to include draft content
6. Blog renders the draft with a "Preview mode" banner
7. Visiting /api/draft-exit disables Draft Mode
```

**Pages Router note**: next-blog uses the Next.js Pages Router (`pages/` directory). Draft Mode in the Pages Router uses `res.setDraftMode({ enable: true })` in API routes (available in Next.js 13.4+), and `context.draftMode?.isEnabled` in `getServerSideProps`. The `draftMode()` function from `next/headers` is App Router only and must not be used here.

### 2. Preview Token

Payload route: `GET /api/preview-token?docType=books|posts&docId=xxx`

**Route location**: `src/app/api/preview-token/route.ts`

Auth: admin or owner of the document only.

Token format: `base64url(JSON.stringify({ docType, docId, slug, expiresAt }))` with an HMAC appended.

```ts
const payload = JSON.stringify({ docType, docId, slug, expiresAt: Date.now() + 15 * 60 * 1000 })
const sig = createHmac('sha256', process.env.PAYLOAD_SECRET!).update(payload).digest('base64url')
const token = Buffer.from(payload).toString('base64url') + '.' + sig
```

Expiry: 15 minutes. Short enough that leaked tokens expire quickly.

### 3. Blog Draft Mode Route

`pages/api/draft.ts` (Next.js Pages Router API route):

```ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac, timingSafeEqual } from 'crypto'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token, redirect } = req.query as { token?: string; redirect?: string }
  if (!token || !redirect) return res.status(400).end()

  // 1. Split token into payload + sig
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return res.status(401).end()
  const payloadB64 = token.slice(0, lastDot)
  const sigReceived = token.slice(lastDot + 1)

  // 2. Recompute HMAC
  const secret = process.env.PREVIEW_SECRET!
  const sigExpected = createHmac('sha256', secret)
    .update(Buffer.from(payloadB64, 'base64url'))
    .digest('base64url')

  // 3. Constant-time comparison to prevent timing attacks
  try {
    if (!timingSafeEqual(Buffer.from(sigReceived), Buffer.from(sigExpected))) {
      return res.status(401).end()
    }
  } catch {
    return res.status(401).end()
  }

  // 4. Check expiry
  const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
  if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
    return res.status(401).json({ error: 'Token expired' })
  }

  // 5. Enable Draft Mode (Pages Router API)
  res.setDraftMode({ enable: true })
  res.redirect(Array.isArray(redirect) ? redirect[0] : redirect)
}
```

`pages/api/draft-exit.ts`:
```ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setDraftMode({ enable: false })
  res.redirect('/')
}
```

### 4. Blog GraphQL Client Change

In `common/apis/base.ts`, the `fetchAPI` function needs to pass a draft flag when draft mode is active. Since the book/chapter pages use `getServerSideProps` (Pages Router), check the draft mode flag from the context object:

```ts
// In getServerSideProps (Pages Router):
const isDraft = context.draftMode?.isEnabled ?? false

// Pass isDraft to the API call which adds `?draft=true` or includes `_status: draft` in the where filter
```

Payload GraphQL accepts `_status` filters. When `isDraft` is true, query with `_status: { in: ["published", "draft"] }` and select the draft version.

### 5. Admin UI Button

`src/components/admin/books/PreviewOnBlogButton.tsx`:

```tsx
'use client'
export function PreviewOnBlogButton({ bookId, blogBaseUrl }: { bookId: string; blogBaseUrl: string }) {
  const handlePreview = async () => {
    const res = await fetch(`/api/preview-token?docType=books&docId=${bookId}`, { credentials: 'include' })
    const { token, slug } = await res.json()
    const redirect = `/books/${slug}`
    window.open(`${blogBaseUrl}/api/draft?token=${token}&redirect=${encodeURIComponent(redirect)}`, '_blank')
  }
  return <Button onClick={handlePreview}>Preview on blog</Button>
}
```

The `blogBaseUrl` could be hardcoded as an env var accessible from the client (`NEXT_PUBLIC_BLOG_URL`).

Register in `Books.ts` under `admin.components.edit.beforeDocumentControls`. Same for `Posts.ts`.

### 6. Draft Banner

In the blog's `Layout` component, pass an `isDraftMode` boolean prop from `getServerSideProps`. The `draftMode()` function from `next/headers` is App Router only; in the Pages Router, check the draft mode state from `context.draftMode?.isEnabled ?? false` and pass it as a page prop. Render a sticky top banner when active:

```
[Draft preview mode] This is unpublished content. [Exit preview]
```

"Exit preview" links to `/api/draft-exit`.

### 7. Checklist

- [ ] `GET /api/preview-token` route in this repo
- [ ] `PreviewOnBlogButton` admin component, registered on Books and Posts
- [ ] Blog: `pages/api/draft.ts` and `pages/api/draft-exit.ts`
- [ ] Blog: `PREVIEW_SECRET` env var
- [ ] Blog: check `context.draftMode?.isEnabled` in `getServerSideProps` for book/chapter/post pages (Pages Router)
- [ ] Blog: draft banner in Layout
- [ ] Blog: pass draft flag to GraphQL client when draft mode is active

---

## Combined Migration Checklist

- [ ] Create `ReadingProgress` collection and migration
- [ ] Create `Bookmarks` collection and migration
- [ ] `pnpm generate:types` after both collections added
- [ ] `pnpm payload migrate:create` for each schema change, commit `.ts` and `.json`
- [ ] Build custom API routes: reading-progress, bookmarks, export-epub, preview-token
- [ ] Build admin components: DownloadEpubButton, PreviewOnBlogButton
- [ ] `pnpm tsc --noEmit` clean
- [ ] Blog: implement reading progress hooks, bookmark button, shelf page, draft mode
