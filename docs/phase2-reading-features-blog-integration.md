# Phase 2 Reading Features - Blog Integration Implementation Plan

> Status: this document covers only the missing `next-blog` work. The `payloadcms` backend surface for reading progress, bookmarks, preview tokens, and comments already exists. EPUB export already exists too, but only as a Payload-admin flow and is intentionally out of scope for `next-blog` in this phase.
>
> Goal: make this plan executable without having to rediscover architecture, GraphQL contracts, or route behavior during implementation.

---

## 1. Scope and Source of Truth

### In scope

- `next-blog` integration for:
  - A. Reading progress
  - B. Bookmarks
  - D. Draft preview mode
  - E. Comments

### Out of scope

- new `payloadcms` schema or resolver work unless a concrete implementation bug is found
- public-reader EPUB download from `next-blog`
- App Router migration
- new `auther` permission model for commenting

### Source docs reviewed

- [docs/reader_experience_reading_features_2.md](./reader_experience_reading_features_2.md)
- [docs/phase2-review-features-a-d.md](./phase2-review-features-a-d.md)
- [docs/comments_feature_phase2_plan.md](./comments_feature_phase2_plan.md)
- [docs/comment-improvements.md](./comment-improvements.md)

### Source code reviewed

`payloadcms`

- `schema.graphql`
- `src/graphql/queries/**`
- `src/graphql/mutations/**`
- `src/components/admin/PreviewOnBlogButton.tsx`

`next-blog`

- `common/apis/base.ts`
- `common/apis/books.ts`
- `common/apis/chapters.ts`
- `common/apis/posts.slug.ts`
- `common/utils/auth.ts`
- `common/utils/chapter-password-proof.ts`
- `pages/books/[slug].tsx`
- `pages/books/[slug]/chapters/[chapterSlug].tsx`
- `pages/posts/[slug].tsx`
- `pages/api/books.ts`
- `pages/api/chapters/unlock.ts`
- `components/core/layout.tsx`
- `components/pages/books/chapter-list.tsx`
- `components/pages/books/chapter-toc.tsx`

---

## 2. What Was Wrong in the Earlier Plan

The previous draft was not implementation-safe. These were the main problems:

1. It treated EPUB export as a pending blog feature even though the real implementation is already an admin-only Payload flow.
2. It documented preview mode partly like App Router and partly like Pages Router.
3. It described the preview token signature incorrectly.
4. It used the wrong `saveReadingProgress` return shape.
5. It invented bookmark response fields that do not exist in the current GraphQL schema.
6. It used stale comments assumptions from older docs.
7. It did not account for the fact that book/chapter preview in `next-blog` currently uses auth-token-based helpers, while preview mode has only a signed draft token and no Payload bearer token.

This version fixes those issues and adds the missing file-level implementation detail.

---

## 3. Cross-Repo Current State

### `payloadcms`

Already implemented:

- `readingProgress(bookId: ID!)`
- `saveReadingProgress(chapterId: ID!, bookId: ID!, progress: Float!)`
- `bookmarks(contentType: String, contentId: ID, limit: Int = 50, page: Int = 1)`
- `createBookmark(contentType: String!, chapterId: ID, bookId: ID)`
- `deleteBookmark(id: ID!)`
- `previewToken(docType: String!, docId: ID!)`
- `comments(chapterId: ID, postId: ID)`
- `createComment(...)`
- `updateComment(...)`
- `deleteComment(...)`
- `updateCommentStatus(...)`
- `generateEpub(bookId: ID!)`

### `next-blog`

Already implemented:

- server-side Payload GraphQL fetch layer
- server-side Better Auth token extraction
- chapter password proof cookie utilities
- SSR book page
- SSR chapter page
- ISR/static post detail page
- same-origin API route pattern for browser-triggered server calls

Missing:

- no reading progress UI or API route
- no bookmark UI or API routes
- no preview routes or banner
- no comments UI or API routes

### `auther`

No required changes for this phase.

---

## 4. Architectural Rules

These are the boundaries the implementation should follow.

### Rule 1: Server-rendered page data goes through `common/apis/*`

Use direct server-to-Payload GraphQL calls from page data functions:

- `getServerSideProps`
- `getStaticProps`

Examples:

- book page loading reading progress
- post page loading draft content during preview

Do not proxy server-rendered page data through same-origin API routes unless there is a real need.

### Rule 2: Browser-triggered work goes through same-origin `pages/api/*`

Use API routes for:

- save progress writes
- bookmark toggle
- comment reads from client components
- comment create/edit/delete

Why:

- the browser cannot access `httpOnly` auth cookies directly
- chapter password proof must be read server-side from cookies
- same-origin routes allow consistent error mapping and stable client contracts

### Rule 3: Draft preview is not the same as reader auth

Important distinction:

- Better Auth session token => reader/authenticated site behavior
- Preview token => only tells `next-blog` to enable draft mode

The preview token does **not** let `next-blog` call Payload as the editor.

Consequence:

- `common/apis/books.ts` and `common/apis/chapters.ts` need a trusted server-side preview fetch path for draft mode
- `common/apis/posts.slug.ts` already uses `fetchAPI`, which defaults to API key and is easier to adapt

### Rule 4: Do not expose raw session tokens to client components

Client components may receive:

- `isAuthenticated: boolean`
- resource IDs
- initial state

They should not receive:

- the raw Better Auth token

---

## 5. Exact GraphQL Contracts to Use

These must match the existing `payloadcms/schema.graphql`.

### Reading progress

Query:

```graphql
query ReadingProgress($bookId: ID!) {
  readingProgress(bookId: $bookId) {
    records {
      chapterId
      progress
      completedAt
      updatedAt
    }
  }
}
```

Mutation:

```graphql
mutation SaveReadingProgress($chapterId: ID!, $bookId: ID!, $progress: Float!) {
  saveReadingProgress(chapterId: $chapterId, bookId: $bookId, progress: $progress) {
    ok
    progress {
      id
      progress
      completedAt
      updatedAt
    }
  }
}
```

### Bookmarks

Query:

```graphql
query Bookmarks($contentType: String, $contentId: ID, $limit: Int, $page: Int) {
  bookmarks(contentType: $contentType, contentId: $contentId, limit: $limit, page: $page) {
    docs {
      id
      contentType
      chapter {
        ... on Chapter {
          id
          title
          slug
          book {
            ... on Book {
              id
              title
              slug
            }
          }
        }
      }
      book {
        ... on Book {
          id
          title
          slug
        }
      }
    }
    totalDocs
  }
}
```

Mutation:

```graphql
mutation CreateBookmark($contentType: String!, $chapterId: ID, $bookId: ID) {
  createBookmark(contentType: $contentType, chapterId: $chapterId, bookId: $bookId) {
    created
    bookmark {
      id
      contentType
      chapter {
        ... on Chapter { id title slug }
      }
      book {
        ... on Book { id title slug }
      }
    }
  }
}
```

Mutation:

```graphql
mutation DeleteBookmark($id: ID!) {
  deleteBookmark(id: $id) {
    ok
  }
}
```

### Preview token

Query:

```graphql
query PreviewToken($docType: String!, $docId: ID!) {
  previewToken(docType: $docType, docId: $docId) {
    token
    slug
  }
}
```

### Comments

Query:

```graphql
query Comments($chapterId: ID, $postId: ID) {
  comments(chapterId: $chapterId, postId: $postId) {
    docs {
      id
      content
      status
      createdAt
      updatedAt
      parentCommentId
      chapterId
      postId
      isOwnPending
      isDeleted
      viewerCanEdit
      viewerCanDelete
      editWindowEndsAt
      author {
        id
        fullName
        avatar {
          id
          url
          thumbnailURL
          optimizedUrl
          lowResUrl
          alt
        }
      }
    }
    totalDocs
    viewerCanComment
  }
}
```

Mutations:

```graphql
mutation CreateComment($chapterId: ID, $postId: ID, $content: String!, $parentCommentId: ID) {
  createComment(chapterId: $chapterId, postId: $postId, content: $content, parentCommentId: $parentCommentId) {
    comment {
      id
      content
      status
      createdAt
      updatedAt
      parentCommentId
      chapterId
      postId
      isOwnPending
      isDeleted
      viewerCanEdit
      viewerCanDelete
      editWindowEndsAt
      author {
        id
        fullName
        avatar {
          id
          url
          thumbnailURL
          optimizedUrl
          lowResUrl
          alt
        }
      }
    }
  }
}
```

```graphql
mutation UpdateComment($commentId: ID!, $content: String!) {
  updateComment(commentId: $commentId, content: $content) {
    comment {
      id
      content
      status
      createdAt
      updatedAt
      parentCommentId
      chapterId
      postId
      isOwnPending
      isDeleted
      viewerCanEdit
      viewerCanDelete
      editWindowEndsAt
      author {
        id
        fullName
      }
    }
  }
}
```

```graphql
mutation DeleteComment($commentId: ID!) {
  deleteComment(commentId: $commentId) {
    comment {
      id
      isDeleted
      status
      parentCommentId
      chapterId
      postId
      viewerCanEdit
      viewerCanDelete
      author {
        id
        fullName
      }
    }
  }
}
```

---

## 6. Types to Add in `next-blog`

File:

- `/home/quanghuy1242/pjs/next-blog/types/cms.ts`

Add these blog-facing types.

```ts
export interface ReadingProgressRecord {
  chapterId: number | null;
  progress: number | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface ReadingProgressResult {
  records: ReadingProgressRecord[];
}

export interface BookmarkRecord {
  id: string;
  contentType: 'chapter' | 'book';
  chapter?: {
    id: number;
    title: string;
    slug: string;
    book?: {
      id: number;
      title: string;
      slug: string;
    } | null;
  } | null;
  book?: {
    id: number;
    title: string;
    slug: string;
  } | null;
}

export interface BookmarksResult {
  docs: BookmarkRecord[];
  totalDocs: number;
}

export type CommentStatus = 'pending' | 'approved' | 'rejected';

export interface CommentAuthor {
  id: number;
  fullName: string;
  avatar?: Media | null;
}

export interface PublicComment {
  id: string;
  content: string;
  status: CommentStatus;
  createdAt: string | null;
  updatedAt: string | null;
  parentCommentId: string | null;
  chapterId: string | null;
  postId: string | null;
  isOwnPending: boolean;
  isDeleted: boolean;
  viewerCanEdit: boolean;
  viewerCanDelete: boolean;
  editWindowEndsAt: string | null;
  author: CommentAuthor;
}

export interface CommentsResult {
  docs: PublicComment[];
  totalDocs: number;
  viewerCanComment: boolean;
}
```

Notes:

- use `string` for GraphQL `ID` fields returned by custom operations unless there is a strong reason to coerce them at the edge
- keep collection model types and custom-operation result types separate

---

## 7. Environment Changes

### `payloadcms`

Already present in `.env.example`:

- `NEXT_PUBLIC_BLOG_URL`

No additional change required for this plan.

### `next-blog`

Add to `.env.example`:

```bash
PAYLOAD_PREVIEW_SECRET=your_payload_secret_here
```

Existing vars already used:

- `PAYLOAD_BASE_URL`
- `PAYLOAD_API_KEY`

Meaning:

- `PAYLOAD_PREVIEW_SECRET` is for verifying preview tokens from Payload
- `PAYLOAD_API_KEY` is for trusted server-side preview data fetches when draft mode is enabled and no reader token is present

---

## 8. Feature A - Reading Progress

### Files to create

- `/home/quanghuy1242/pjs/next-blog/common/apis/reading-progress.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/reading-progress.ts`
- `/home/quanghuy1242/pjs/next-blog/hooks/useReadingProgress.ts`
- `/home/quanghuy1242/pjs/next-blog/components/shared/reading-progress-bar.tsx`

### Files to update

- `/home/quanghuy1242/pjs/next-blog/pages/books/[slug].tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`
- `/home/quanghuy1242/pjs/next-blog/components/pages/books/chapter-toc.tsx`
- optionally `/home/quanghuy1242/pjs/next-blog/components/pages/books/chapter-list.tsx`

### API helper contract

`common/apis/reading-progress.ts` should export:

- `getReadingProgress(bookId, { authToken })`
- `saveReadingProgress(chapterId, bookId, progress, { authToken })`

Behavior:

- if no auth token for `getReadingProgress`, return `[]`
- `saveReadingProgress` should require auth and throw if missing

### Same-origin API route

`pages/api/reading-progress.ts`

- method: `POST`
- body:

```ts
{
  chapterId: number | string;
  bookId: number | string;
  progress: number;
}
```

- response success:

```ts
{ ok: true }
```

- response error mapping:
  - `401` when auth token missing
  - `400` when body invalid
  - `404` when chapter/book mismatch or not found
  - `500` fallback

Always set:

```ts
Cache-Control: no-store, max-age=0
```

### Client hook behavior

`hooks/useReadingProgress.ts`

Inputs:

- `chapterId`
- `bookId`
- `enabled`

Behavior:

- attach passive scroll listener only when enabled
- compute scroll percentage from document height
- clamp to `0..100`
- skip writes if progress does not exceed last sent progress
- throttle writes
  - recommended minimum write interval: `5s`
- flush once on unmount
  - `navigator.sendBeacon` is acceptable if route can parse it
  - otherwise a final normal `fetch` in cleanup is acceptable if kept fire-and-forget

Do not:

- store auth token in the hook
- throw UI-breaking errors on write failure

### Book page integration

`pages/books/[slug].tsx`

Changes:

1. extract `sessionToken` with existing helper
2. fetch book detail as today
3. if authenticated and book exists, fetch reading progress
4. sort progress records by `updatedAt` descending
5. derive latest incomplete chapter:
   - `progress < 95`
   - matching chapter still exists in the current chapter list
6. pass a precomputed lookup map or normalized array to the page component

Recommended prop shape:

```ts
readingProgress: ReadingProgressRecord[];
continueReadingChapterSlug: string | null;
```

### Chapter page integration

`pages/books/[slug]/chapters/[chapterSlug].tsx`

Changes:

1. keep current SSR data flow
2. derive:
   - `isAuthenticated`
   - `isChapterLocked`
3. mount `useReadingProgress` only when:
   - authenticated
   - chapter content is actually visible
4. render progress bar near the top of the reader

Do not save progress when:

- user is anonymous
- chapter content is locked and password gate is shown

### ToC integration

`components/pages/books/chapter-toc.tsx`

Add optional prop:

```ts
readingProgressByChapterId?: Record<number, number>;
```

UI behavior:

- if chapter has progress > 0, show a subtle inline progress strip
- if chapter is current chapter, keep current emphasis styles
- do not let progress UI break chapter lock badge layout

### Acceptance criteria

- authenticated reader scrolling a visible chapter sends progress writes
- anonymous reader sends none
- book page shows "Continue reading" for the newest incomplete chapter
- progress UI does not appear for locked-content gate state

---

## 9. Feature B - Bookmarks

### Files to create

- `/home/quanghuy1242/pjs/next-blog/common/apis/bookmarks.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/bookmarks.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/bookmarks/[bookmarkId].ts`
- `/home/quanghuy1242/pjs/next-blog/hooks/useBookmark.ts`
- `/home/quanghuy1242/pjs/next-blog/components/shared/bookmark-button.tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/shelf.tsx`

### API helper contract

Exports:

- `getBookmarks({ authToken, contentType?, contentId?, limit?, page? })`
- `createBookmark(input, { authToken })`
- `deleteBookmark(bookmarkId, { authToken })`

Rules:

- for single-item lookup, pass both `contentType` and `contentId`
- for shelf listing, pass neither filter
- if no auth token on lookup/list, return empty result and let UI hide itself

### Same-origin routes

`pages/api/bookmarks.ts`

- `GET`
  - optional query:
    - `contentType`
    - `contentId`
    - `page`
    - `limit`
  - requires auth for useful response
- `POST`
  - requires auth
  - body:

```ts
{
  contentType: 'book' | 'chapter';
  chapterId?: number | string;
  bookId?: number | string;
}
```

`pages/api/bookmarks/[bookmarkId].ts`

- `DELETE`
- requires auth

### Hook behavior

`hooks/useBookmark.ts`

Inputs:

- `contentType`
- `contentId`
- `enabled`

State:

- `bookmark`
- `isBookmarked`
- `isLoading`
- `isMutating`

Behavior:

- initial load only when enabled and `contentId` exists
- optimistic toggle is fine
- revert optimistic state on failure

### Button placement

Add to:

- book detail page
- chapter page

Anonymous behavior:

- hide button entirely or render disabled sign-in CTA
- do not do client polling for bookmark state when anonymous

### Shelf page

`pages/shelf.tsx`

Implementation:

1. `getServerSideProps`
2. extract auth token
3. if missing, redirect to sign-in or return a gated empty state
4. fetch bookmarks list
5. group by:
   - books
   - chapters

Render details:

- bookmarked books link to book page
- bookmarked chapters link directly to chapter page
- if chapter bookmark includes nested book info, use it to build the route

### Acceptance criteria

- book/chapter page reflects existing bookmark state
- toggle is idempotent with current backend behavior
- shelf page renders both item kinds
- anonymous users cannot create/delete bookmarks

---

## 10. Feature D - Draft Preview Mode

### Files to create

- `/home/quanghuy1242/pjs/next-blog/pages/api/draft.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/draft-exit.ts`
- `/home/quanghuy1242/pjs/next-blog/components/shared/draft-banner.tsx`

### Files to update

- `/home/quanghuy1242/pjs/next-blog/components/core/layout.tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/books/[slug].tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/posts/[slug].tsx`
- `/home/quanghuy1242/pjs/next-blog/common/apis/books.ts`
- `/home/quanghuy1242/pjs/next-blog/common/apis/chapters.ts`
- `/home/quanghuy1242/pjs/next-blog/common/apis/posts.slug.ts`

### Exact preview token verification behavior

Payload currently builds the token as:

1. JSON stringify payload
2. `signature = HMAC_SHA256(payloadJson, PAYLOAD_SECRET).base64url()`
3. `token = base64url(payloadJson) + "." + signature`

`pages/api/draft.ts` must verify that exact format.

Expected payload fields:

- `docType`
- `docId`
- `slug`
- `expiresAt`

### `pages/api/draft.ts`

Responsibilities:

1. parse `token`
2. verify signature with `PAYLOAD_PREVIEW_SECRET`
3. parse payload JSON
4. ensure `expiresAt > Date.now()`
5. validate `redirect`
   - must start with `/`
6. enable draft mode
7. redirect

Use:

```ts
res.setDraftMode({ enable: true })
```

Do not manually set draft cookies.

Error responses:

- `400` malformed token
- `401` invalid signature
- `401` expired token
- `400` invalid redirect

### `pages/api/draft-exit.ts`

Responsibilities:

1. disable draft mode
2. redirect to `/`

Use:

```ts
res.setDraftMode({ enable: false })
```

### Layout integration

Update `components/core/layout.tsx` to accept:

```ts
isDraftMode?: boolean;
draftExitHref?: string;
```

Render `DraftBanner` above normal page content when draft mode is on.

### Data helper changes

#### Post detail

`common/apis/posts.slug.ts`

Current advantage:

- already uses `fetchAPI`, which can use the server API key

Change:

- add `draftMode?: boolean`
- when `draftMode` is true, allow `_status in [published, draft]`
- keep public behavior unchanged when false

#### Books and chapters

`common/apis/books.ts` and `common/apis/chapters.ts`

Current issue:

- these use `fetchAPIWithAuthToken`
- if no reader auth token exists, the call becomes anonymous
- anonymous cannot see draft books/chapters

Required change:

- add an option like:

```ts
draftMode?: boolean;
trustedPreview?: boolean;
```

Implementation rule:

- normal reader path:
  - keep existing `fetchAPIWithAuthToken`
- draft preview path:
  - when `draftMode === true`, use `fetchAPI` instead so the server API key can authenticate the request

Important safety rule:

- only allow trusted preview path from server-side page functions
- never expose that path to browser code or client components

### Page-level integration

#### `pages/books/[slug].tsx`

- read `context.draftMode`
- pass draft option into book detail fetch helper
- pass `isDraftMode` into component/layout

#### `pages/books/[slug]/chapters/[chapterSlug].tsx`

- read `context.draftMode`
- pass draft option into chapter detail fetch helper
- keep chapter password flow intact for normal readers
- preview mode should be allowed to see draft data without needing a reader unlock cookie

#### `pages/posts/[slug].tsx`

- keep `getStaticProps`
- use `context.draftMode`
- when true, fetch draft-aware post data
- keep `revalidate` for public path

### Acceptance criteria

- Preview button from Payload opens draft book page
- Preview button from Payload opens draft post page
- Preview mode banner is visible
- Exiting draft mode clears the state
- Public non-preview traffic still sees only published content

---

## 11. Feature E - Comments

### Files to create

- `/home/quanghuy1242/pjs/next-blog/common/apis/comments.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/comments.ts`
- `/home/quanghuy1242/pjs/next-blog/pages/api/comments/[commentId].ts`
- `/home/quanghuy1242/pjs/next-blog/hooks/useComments.ts`
- `/home/quanghuy1242/pjs/next-blog/components/shared/comments/CommentsSection.tsx`
- `/home/quanghuy1242/pjs/next-blog/components/shared/comments/CommentComposer.tsx`
- `/home/quanghuy1242/pjs/next-blog/components/shared/comments/CommentThread.tsx`
- `/home/quanghuy1242/pjs/next-blog/components/shared/comments/CommentItem.tsx`

### Files to update

- `/home/quanghuy1242/pjs/next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`
- `/home/quanghuy1242/pjs/next-blog/pages/posts/[slug].tsx`

### API helper behavior

`common/apis/comments.ts`

Exports:

- `getComments(target, options)`
- `createComment(input, options)`
- `updateComment(commentId, content, options)`
- `deleteComment(commentId, options)`

Options:

- `authToken?: string | null`
- `chapterPasswordProof?: string | null`

Rules:

- forward `x-chapter-password-proof` only when present
- comments query may be anonymous
- mutations require auth

### Same-origin comments routes

#### `pages/api/comments.ts`

Methods:

- `GET`
- `POST`

For `GET`:

- accept either `chapterId` or `postId`
- reject both or neither
- read auth token with `getBetterAuthTokenFromRequest(req)`
- read password proof with `getChapterPasswordProofCookieValueFromRequest(req)`
- forward proof as `x-chapter-password-proof`

For `POST`:

- require auth token
- validate non-empty content
- accept optional `parentCommentId`
- forward password proof the same way for chapter targets

#### `pages/api/comments/[commentId].ts`

Methods:

- `PATCH`
- `DELETE`

Behavior:

- require auth token
- validate `commentId`
- on `PATCH`, validate non-empty content

### Client hook

`hooks/useComments.ts`

State:

- `data`
- `loading`
- `error`
- `isSubmitting`

Methods:

- `reload()`
- `createComment(...)`
- `updateComment(...)`
- `deleteComment(...)`

Design choice:

- simplest correct version is to reload after each mutation
- optimistic patching is optional and can be added later

### UI rules

#### `CommentsSection`

Responsibilities:

- fetch on mount
- render heading and count
- render composer only when `viewerCanComment`
- pass comments to thread renderer

#### `CommentThread`

Responsibilities:

- split top-level comments from replies
- group replies by `parentCommentId`
- render only two levels

#### `CommentItem`

Render rules:

- deleted comment => tombstone UI
- own pending comment => "Awaiting moderation"
- edit button only when `viewerCanEdit`
- delete button only when `viewerCanDelete`
- reply button only for approved top-level comments
- plain text only

#### `CommentComposer`

Behavior:

- trim input
- disable submit while pending
- support optional reply mode
- clear after successful submit

### Page mounting

Add below content on:

- chapter page
- post page

Chapter detail:

- client fetch should rely on same-origin route reading the proof cookie server-side
- do not ask the browser to manually copy proof headers

### Acceptance criteria

- approved comments render for anonymous users when backend allows
- authenticated user can create a top-level comment
- authenticated user can reply to an approved top-level comment
- authenticated user can edit within backend constraints
- delete shows tombstone behavior, not hard removal

---

## 12. Recommended Delivery Sequence

This order reduces cross-feature blocking.

### Step 1: Draft preview

Why first:

- smallest isolated feature
- highest editorial value
- exposes helper changes needed for server-side trusted preview fetch

### Step 2: Reading progress

Why second:

- only touches book/chapter pages
- introduces the first browser write route

### Step 3: Bookmarks

Why third:

- similar same-origin write pattern
- relatively low UI complexity

### Step 4: Comments

Why fourth:

- most component-heavy and stateful feature
- benefits from API-route patterns already established in previous steps

---

## 13. Verification Plan

### `payloadcms`

Run:

```bash
pnpm tsc --noEmit
pnpm generate:graphQLSchema
```

### `next-blog`

Run:

```bash
pnpm lint
pnpm test
pnpm build
```

### Manual verification matrix

#### Preview

1. Open draft book from Payload admin.
2. Open draft post from Payload admin.
3. Verify draft banner appears.
4. Exit draft mode and verify published view returns.

#### Reading progress

1. Logged-in reader opens a readable chapter.
2. Scroll partway down.
3. Reload page and verify backend progress was saved.
4. Open book page and verify continue-reading target is correct.
5. Open locked chapter gate and verify no progress writes occur until content is actually visible.

#### Bookmarks

1. Logged-in reader bookmarks a book.
2. Logged-in reader bookmarks a chapter.
3. Reload and verify state restores.
4. Open shelf page and verify both entries render.
5. Logged-out reader cannot toggle bookmarks.

#### Comments

1. Anonymous reader sees allowed comments only.
2. Authenticated reader submits a top-level comment.
3. Authenticated reader replies to an approved top-level comment.
4. Authenticated reader edits within allowed window.
5. Authenticated reader deletes comment and sees tombstone behavior.
6. Chapter with password proof still loads comments after unlock.

---

## 14. Risks and Implementation Traps

1. **Book/chapter preview can silently fail if helpers stay on `fetchAPIWithAuthToken`.**
   - This is the biggest implementation trap in the whole plan.

2. **Bookmark UI can be built against the wrong shape if it assumes flat `bookId` / `chapterId` fields in the GraphQL response.**

3. **Comments route can break locked chapters if it reads proof from request headers instead of the normalized cookie helper.**

4. **Reading progress can send writes while the password gate is shown unless the hook is mounted only when content is visible.**

5. **Draft-mode implementation can regress public caching if it unnecessarily converts post detail to SSR.**

---

## 15. Definition of Done

This phase is done when:

- preview mode works for books and posts from the existing Payload admin button
- reading progress saves and drives continue-reading UI
- bookmarks work on book/chapter pages and shelf page
- comments work on chapter and post pages with current backend behavior
- public published traffic remains unchanged outside preview mode
- no new backend planning is required to finish the `next-blog` implementation
