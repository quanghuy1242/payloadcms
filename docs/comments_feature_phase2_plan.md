# Comments Feature Phase 2 Implementation Plan

## Scope

This document covers only section E from [docs/reader_experience_reading_features_2.md](./reader_experience_reading_features_2.md): in-house comments on:

- chapter detail pages in `next-blog`
- post detail pages in `next-blog`

Phase 2 scope:

- authenticated readers can create comments
- comments are plain-text only
- up to 2 levels of threading: top-level + one reply level
- admin moderates in Payload admin through `status`
- comments on private chapters inherit chapter/book access
- comments on password-locked chapters stay hidden until the chapter itself is readable

Out of scope for this phase:

- reactions, likes, votes
- email notifications
- spam scoring / rate limiting beyond basic validation
- editing or deleting comments from the public site
- separate commenter permissions in Auther
- comments on draft posts or draft chapters shown in preview mode

## Current-State Findings

These findings matter because the original section E is directionally right but does not fully match the current codebase.

1. PayloadCMS already has A, B, C, and D implemented. This repo already contains:
   - [src/collections/ReadingProgress.ts](../src/collections/ReadingProgress.ts)
   - [src/collections/Bookmarks.ts](../src/collections/Bookmarks.ts)
   - [src/graphql/queries/ReadingProgress/](../src/graphql/queries/ReadingProgress)
   - [src/graphql/queries/Bookmarks/](../src/graphql/queries/Bookmarks)
   - [src/graphql/queries/PreviewToken/](../src/graphql/queries/PreviewToken)
   - [src/graphql/mutations/GenerateEpub/](../src/graphql/mutations/GenerateEpub)

2. `next-blog` chapter pages are already auth-aware SSR pages, but post detail is still static:
   - `../next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx` uses `getServerSideProps`
   - `../next-blog/pages/posts/[slug].tsx` uses `getStaticProps`

3. `postsReadAccess` in [src/utils/access.ts](../src/utils/access.ts) is authenticated-only. That means the original section E assumption that comment visibility can simply inherit post visibility is not safe for anonymous readers.

4. The blog already uses same-origin Next API routes as an adapter layer:
   - `../next-blog/pages/api/books.ts`
   - `../next-blog/pages/api/chapters/unlock.ts`

5. Password-locked chapters need special handling. Chapter collection read access allows the chapter shell through, while actual chapter content is protected at field level by:
   - [src/utils/chapterPasswords.ts](../src/utils/chapterPasswords.ts)
   - [src/utils/access.ts](../src/utils/access.ts)

   Comments must follow the real chapter readability contract, not just collection visibility.

6. Auther already recognizes `comment` in mirror/webhook enums:
   - [src/collections/GrantMirror.ts](../src/collections/GrantMirror.ts)
   - [src/utils/grantMirror.ts](../src/utils/grantMirror.ts)

   But no new Auther entity type or grant flow is needed for this phase.

## Architecture Decision

### Recommended shape

Use a hybrid of:

- PayloadCMS custom GraphQL operations for comment business logic
- `next-blog` same-origin API route proxy for browser GET/POST

Do not have browser components call Payload GraphQL directly for comments.

### Why this is the right fit here

1. It matches the existing `next-blog` pattern for auth-aware browser actions.
2. It avoids pushing Better Auth bearer-token handling into client React components.
3. It keeps the post page static. Converting `pages/posts/[slug].tsx` to SSR only for comment hydration is unnecessary and would be a regression in cacheability.
4. It gives one consistent browser contract for both books/chapters and posts.
5. It allows the API route to forward chapter password proof headers for locked chapters.

### Important correction to section E

Do not rely on generic public collection read access for the `comments` collection.

Reason:

- the feature only needs comments for one specific chapter or one specific post at a time
- chapter visibility has extra password-proof rules
- post visibility for public readers does not line up with current `postsReadAccess`

Instead:

- keep `Comments` collection admin-facing
- enforce public-site visibility rules inside dedicated GraphQL resolvers
- keep public-site browser access going through `next-blog/pages/api/comments.ts`

## Non-Negotiables

These are hard rules. A weaker implementation model is likely to drift here unless they are written explicitly.

1. Do not expose public comment reads through generic Payload collection access.
2. Do not let browser components call Payload GraphQL directly for comment reads or writes.
3. Do not convert `../next-blog/pages/posts/[slug].tsx` from SSG to SSR just to support comments.
4. Do not support reply-to-reply in Phase 2.
5. Do not make comments rich text or HTML-rendered in Phase 2.
6. Do not add any new Auther entity type for comments.
7. Do not rely on `postsReadAccess` for anonymous post comment visibility. Handle published-post visibility explicitly in the comment resolver.
8. Do not forget chapter password-proof forwarding in the blog API route.
9. Do not skip the planned compound indexes.
10. Do not manually edit generated files such as `src/payload-types.ts`.
11. Do not add custom REST route handlers under `payloadcms/src/app/api/` for comment business logic. The comment business logic stays in Payload GraphQL.
12. Do not use raw collection GraphQL return types for public comment payloads. Use custom public types.
13. Do not expose rejected comments on the public site.
14. Do not expose other users’ pending comments to authenticated readers.
15. Do not allow admin users to post comments through the public-site flow in Phase 2 unless product explicitly changes the rule.

## Cross-Repo Responsibility Split

### `payloadcms`

Owns:

- comment storage
- moderation state
- content-target validation
- threading rules
- chapter/private-book/password access checks
- GraphQL query and mutations

### `next-blog`

Owns:

- same-origin browser API route
- rendering thread UI
- reply form UI
- pending-state UX after submit
- forwarding Better Auth token and chapter password proof to Payload

### `auther`

No required code changes for Phase 2.

Recommendation only:

- if future requirements split “can read” from “can comment,” add a relation on the book model such as `commenter`
- do not create a separate `comment` resource type for this phase

## Data Model Plan in `payloadcms`

### New collection

Create [src/collections/Comments.ts](../src/collections/Comments.ts).

### Fields

Required fields:

- `chapter`: relationship to `chapters`, nullable, indexed
- `post`: relationship to `posts`, nullable, indexed
- `author`: relationship to `users`, required, indexed
- `content`: textarea, required
- `status`: select `pending | approved | rejected`, required, default `pending`, indexed
- `parentComment`: relationship to `comments`, nullable, indexed
- `moderatedAt`: date, nullable
- `moderatedBy`: relationship to `users`, nullable

Auto fields from Payload:

- `createdAt`
- `updatedAt`

### Collection admin config

Recommended admin behavior:

- `useAsTitle: 'content'`
- `defaultColumns: ['status', 'author', 'chapter', 'post', 'parentComment', 'createdAt', 'updatedAt']`
- keep the collection visible in admin navigation
- do not add a custom admin component in this phase

### Collection access

Recommended collection-level access:

- `create`: `adminAccess`
- `read`: `adminAccess`
- `update`: `adminAccess`
- `delete`: `adminAccess`

Why:

- public-site flows go through custom GraphQL only
- admin moderation remains available in Payload admin
- this prevents accidental exposure through generated collection queries or generic endpoints

### Collection invariants

Put comment-specific invariant logic in a new utility:

- [src/utils/comments.ts](../src/utils/comments.ts)

Functions that should live there:

- `normalizeCommentContent(input): string`
- `assertExclusiveCommentTarget({ chapter, post }): void`
- `assertCommentCreateRole(user): void`
- `assertCommentTargetReadable(args): Promise<CommentTarget>`
- `assertParentCommentIsValid(args): Promise<ParentCommentRecord | null>`
- `commentsBeforeValidateHook`
- `commentsBeforeChangeHook`
- `mapCommentDocToPublicComment`

Do not put this logic inline in collection or resolver files.

### Invariants that must be enforced

1. Exactly one of `chapter` or `post` must be set.
2. `author` is immutable after create.
3. `chapter`, `post`, and `parentComment` are immutable after create.
4. `content` must be trimmed and non-empty after trim.
5. Add a max length cap. Recommended: `2000` characters after trim.
6. `parentComment` must belong to the same target as the new comment.
7. `parentComment` must itself be top-level. Reject reply-to-reply.
8. `parentComment` must be `approved`. Do not allow replying to pending or rejected comments.
9. If target is a password-locked chapter, the requester must have valid password proof before comments are read or created.
10. If target readability is lost later, comments should no longer be visible to that requester.

## Database and Performance Plan for Turso / SQLite

This feature does not need complex infrastructure, but it does need deliberate index and query-shape choices because Turso and SQLite get expensive fast when a hot-path query devolves into a table scan.

Guiding rules:

1. Add required indexes in the initial schema, not after the table has grown.
2. Keep every public-site comment query scoped to a single `chapter` or a single `post`.
3. Prefer equality filters plus `createdAt` ordering so SQLite can search and sort from one compound index.
4. Avoid one broad OR-heavy query when two narrow indexed queries are cleaner.
5. Verify representative comment queries with `EXPLAIN QUERY PLAN` before sign-off.

### Field indexes

Set `index: true` on:

- `chapter`
- `post`
- `author`
- `status`
- `parentComment`
- `moderatedBy`

Notes:

- Payload already indexes `id`, `createdAt`, and `updatedAt` by default.
- Do not duplicate those defaults manually.

### Compound indexes

Add `indexes` in the `Comments` collection config for:

1. `['chapter', 'status', 'createdAt']`
2. `['post', 'status', 'createdAt']`
3. `['chapter', 'author', 'status', 'createdAt']`
4. `['post', 'author', 'status', 'createdAt']`
5. `['status', 'createdAt']`

Why these are worth it:

1. Public reads mostly do `target + approved + createdAt ASC`.
2. Authenticated readers also need `target + own pending + createdAt ASC`.
3. Admin moderation queues naturally do `status + createdAt`.

Do not add speculative indexes beyond these in Phase 2. Every index increases write cost on create and update.

### Preferred query shape

Do not implement the authenticated public read as one giant WHERE clause shaped like:

```text
target = X AND (status = approved OR (status = pending AND author = currentUser))
```

That may still work, but it is less predictable for SQLite planning and easier to regress.

Preferred resolver strategy:

1. Query approved comments for the target.
2. Query own pending comments for the same target.
3. Merge by `id` in memory.
4. Sort once by `createdAt ASC`.

Anonymous strategy:

1. One query for approved comments only.

This lines up directly with the compound indexes above.

### Pagination and row-count guidance

For Phase 2:

- use hard cap `200`
- do not build full pagination yet
- do not add “load more” yet

Reason:

- expected thread sizes are modest
- bounded results keep reads, memory, and sort cost predictable
- the UI stays much simpler

For the response payload:

- `totalDocs` may be set from the returned doc array length for Phase 2
- do not add a second exact-count query unless product explicitly needs it

This matters on Turso because aggregate-style counting still scans the considered rows.

### Admin performance guidance

Admin traffic is lower, but moderation still needs an efficient default path.

Recommended admin assumptions:

- default moderation view sorted by newest `createdAt`
- saved filter on `status = pending`

The `['status', 'createdAt']` compound index above is specifically there for this workflow.

### Threading cost control

Keep the thread model shallow:

- top-level comment: `parentComment = null`
- one reply level: `parentComment = topLevelCommentId`

Do not support recursive nesting in Phase 2.

Why:

- validation stays simpler
- query assembly stays predictable
- UI rendering stays cheap

### Response-shape cost control

Use custom public GraphQL types instead of the raw Payload-generated `comments` type.

Recommended shape rules:

- include author once
- do not recursively expand `parentComment`
- expose `parentCommentId` only
- keep relationship depth minimal

This prevents over-fetching and keeps comment payloads stable.

### Storage guidance

Keep comments as plain text only.

Do not add:

- rich-text comment bodies
- rendered HTML storage
- per-comment version history

Why:

- smaller rows
- simpler moderation
- cheaper transport

### Migration discipline

Turso’s docs note that adding indexes to existing populated tables triggers a scan of existing rows. Ship the comments migration with the final planned Phase 2 indexes instead of treating indexes as a follow-up optimization.

That means:

1. finalize field indexes
2. finalize compound indexes
3. generate the migration once
4. avoid “we’ll add indexes later” unless the table is still essentially empty

### Query-plan verification

Before sign-off, run `EXPLAIN QUERY PLAN` for the representative comment reads.

At minimum verify:

1. chapter approved-comments query
2. chapter own-pending-comments query
3. post approved-comments query
4. post own-pending-comments query
5. admin pending-moderation query

Success criteria:

- hot-path comment queries show `SEARCH` instead of broad `SCAN`
- avoid `USE TEMP B-TREE FOR ORDER BY` on the main public read path where practical

## GraphQL Plan in `payloadcms`

### Query: `comments`

Create:

- [src/graphql/queries/Comments/index.ts](../src/graphql/queries/Comments/index.ts)
- [src/graphql/queries/Comments/resolver.ts](../src/graphql/queries/Comments/resolver.ts)

Args:

- `chapterId: ID`
- `postId: ID`

Exactly one is required.

Recommended return shape:

```graphql
type CommentsResult {
  docs: [PublicComment!]!
  totalDocs: Int!
  viewerCanComment: Boolean!
}

type PublicComment {
  id: ID!
  content: String!
  status: String!
  createdAt: String
  updatedAt: String
  parentCommentId: ID
  chapterId: ID
  postId: ID
  isOwnPending: Boolean!
  author: PublicCommentAuthor!
}

type PublicCommentAuthor {
  id: ID!
  fullName: String!
  avatar: Media
}
```

Use a custom GraphQL object type instead of returning the raw Payload `comments` graphQL type. That keeps the contract small and avoids depth / relationship-shape ambiguity in the blog.

Resolver algorithm:

1. Validate mutual exclusivity of `chapterId` and `postId`.
2. Resolve viewer:
   - anonymous: `viewerCanComment = false`
   - authenticated `role === 'user'`: `viewerCanComment = true`
   - authenticated `role === 'admin'`: `viewerCanComment = false` for public-site UX
3. Validate target readability:
   - chapter: reuse `loadReadableChapter` from [src/utils/readingFeatures.ts](../src/utils/readingFeatures.ts), then enforce password proof with `canReadChapterContentForRequest`
   - post: load by ID with `overrideAccess: true`, require `_status === 'published'`
4. Query `comments` with `overrideAccess: true`
5. Apply status rules using index-friendly query shapes:
   - anonymous: one query for `approved` only
   - authenticated reader: one query for `approved` plus one query for own `pending`
   - do not include rejected comments in public-site responses
6. Merge and dedupe if two queries were used
7. Sort by `createdAt` ascending
8. Limit hard cap: `200`
9. Map result docs to the custom public shape

### Mutation: `createComment`

Create:

- [src/graphql/mutations/CreateComment/index.ts](../src/graphql/mutations/CreateComment/index.ts)
- [src/graphql/mutations/CreateComment/resolver.ts](../src/graphql/mutations/CreateComment/resolver.ts)

Args:

- `chapterId: ID`
- `postId: ID`
- `content: String!`
- `parentCommentId: ID`

Return:

- `{ comment: PublicComment! }`

Resolver algorithm:

1. Require authenticated user.
2. Enforce commenter role. Recommended rule for this phase:
   - only `req.user.role === 'user'` may create comments
   - admin moderates through admin UI, not through the public-site flow
3. Validate exactly one target.
4. Validate target readability:
   - chapter/private-book access
   - chapter password-proof access
   - post must be published
5. Normalize and validate content.
6. If `parentCommentId` is provided:
   - load parent with `overrideAccess: true`
   - require same target
   - require `status === 'approved'`
   - require `parentComment` empty
7. Create with:
   - `author = req.user.id`
   - `status = 'pending'`
   - `moderatedAt = null`
   - `moderatedBy = null`
8. Return mapped public comment shape

### Mutation: `updateCommentStatus`

Create:

- [src/graphql/mutations/UpdateCommentStatus/index.ts](../src/graphql/mutations/UpdateCommentStatus/index.ts)
- [src/graphql/mutations/UpdateCommentStatus/resolver.ts](../src/graphql/mutations/UpdateCommentStatus/resolver.ts)

Args:

- `commentId: ID!`
- `status: String!`

Allowed statuses from mutation:

- `approved`
- `rejected`

Return:

- `{ comment: PublicComment! }`

Resolver algorithm:

1. Require `req.user.role === 'admin'`.
2. Load comment by ID with `overrideAccess: true`.
3. Validate target status.
4. Update:
   - `status`
   - `moderatedAt = now`
   - `moderatedBy = req.user.id`
5. Return mapped public comment shape.

### GraphQL registration work

Update:

- [src/graphql/queries/index.ts](../src/graphql/queries/index.ts)
- [src/graphql/mutations/index.ts](../src/graphql/mutations/index.ts)

Add:

- `comments`
- `createComment`
- `updateCommentStatus`

## Exact File Checklist

This section is intentionally mechanical. The goal is to reduce freedom for a weak implementer.

### `payloadcms` exact file checklist

#### 1. `src/collections/Comments.ts`

Must do:

- export `Comments: CollectionConfig`
- set `slug: 'comments'`
- set collection-level admin visibility on
- define all planned fields
- define field indexes
- define compound `indexes`
- import and use `adminAccess`
- import and use hooks from `src/utils/comments.ts`

Must not do:

- inline large validation logic
- inline access logic beyond imported helpers
- expose browser-specific code

#### 2. `src/utils/comments.ts`

Must export at minimum:

- `COMMENT_STATUSES`
- `CommentStatus`
- `normalizeCommentContent`
- `assertExclusiveCommentTarget`
- `assertCommentCreateRole`
- `loadCommentTarget`
- `assertCommentTargetReadable`
- `assertParentCommentIsValid`
- `commentsBeforeValidateHook`
- `commentsBeforeChangeHook`
- `mapCommentDocToPublicComment`

Must do:

- centralize content normalization
- centralize target validation
- centralize parent-comment validation
- centralize public payload mapping

Must not do:

- import React or browser APIs
- duplicate generic helpers already living in `strings.ts`, `identifiers.ts`, or `access.ts`

#### 3. `src/payload.config.ts`

Must do:

- import `Comments`
- append `Comments` to `collections`

Must not do:

- reorder unrelated collections without reason

#### 4. `src/graphql/queries/Comments/index.ts`

Must do:

- define custom GraphQL object types for author, comment, and result
- declare args `chapterId` and `postId`
- bind to `commentsResolver`

Must not do:

- use `payload.collections['comments']?.graphQL?.type` as the public result type

#### 5. `src/graphql/queries/Comments/resolver.ts`

Must do:

- validate exact-one target arg
- load target readability
- run one-query or two-query indexed strategy depending on viewer
- map docs to public payload

Must not do:

- trust collection `read` access for public site behavior
- return rejected comments

#### 6. `src/graphql/mutations/CreateComment/index.ts`

Must do:

- define custom return type `{ comment }`
- declare args `chapterId`, `postId`, `content`, `parentCommentId`
- bind to `createCommentResolver`

#### 7. `src/graphql/mutations/CreateComment/resolver.ts`

Must do:

- require auth
- enforce `role === 'user'`
- validate target readability
- validate parent
- normalize content
- create pending comment
- return mapped public payload

Must not do:

- create approved comments directly
- use browser-layer assumptions

#### 8. `src/graphql/mutations/UpdateCommentStatus/index.ts`

Must do:

- define custom return type `{ comment }`
- declare args `commentId`, `status`
- bind to `updateCommentStatusResolver`

#### 9. `src/graphql/mutations/UpdateCommentStatus/resolver.ts`

Must do:

- require admin
- restrict status input to `approved` or `rejected`
- set `moderatedAt`
- set `moderatedBy`

#### 10. `src/graphql/queries/index.ts`

Must do:

- register `comments`

#### 11. `src/graphql/mutations/index.ts`

Must do:

- register `createComment`
- register `updateCommentStatus`

#### 12. `tests/int/comments.int.spec.ts`

Must cover:

- collection config
- hooks
- comment query resolver
- create mutation resolver
- moderation mutation resolver

### `next-blog` exact file checklist

#### 13. `../next-blog/pages/api/comments.ts`

Must do:

- support only `GET` and `POST`
- set `Allow` header for unsupported methods
- set `Cache-Control: no-store`
- forward Better Auth token
- forward chapter password proof when present
- call Payload GraphQL, not collection REST
- map GraphQL errors to HTTP errors

Must not do:

- call Auther directly
- trust client-submitted auth state flags

#### 14. `../next-blog/common/apis/comments.ts`

Must export:

- `getComments`
- `createComment`

Must do:

- talk only to `/api/comments`
- keep request/response typing local

#### 15. `../next-blog/types/cms.ts`

Must add:

- `CommentStatus`
- `CommentAuthor`
- `Comment`
- optional `CommentsResult`

#### 16. `../next-blog/components/shared/comments-section.tsx`

Must do:

- fetch on mount
- render two-level thread
- support top-level submit
- support reply submit
- show moderation-pending state
- render content as plain text

Must not do:

- use `dangerouslySetInnerHTML`
- read Better Auth token directly in the browser
- assume comments are server-rendered

#### 17. `../next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`

Must do:

- mount comments section with `chapterId`
- keep existing SSR behavior unchanged

Must not do:

- move comment fetching into `getServerSideProps`

#### 18. `../next-blog/pages/posts/[slug].tsx`

Must do:

- mount comments section with `postId`
- keep existing SSG behavior

Must not do:

- convert page to SSR

#### 19. `../next-blog/tests/api/comments.test.ts`

Must cover:

- GET behavior
- POST behavior
- token forwarding
- password-proof forwarding
- error mapping

#### 20. `../next-blog/tests/components/comments-section.test.tsx`

Must cover:

- render grouping
- hidden form state
- submit success path
- pending comment UI
- reply UI

## `payloadcms` File-Level Work Breakdown

### Phase 1: schema and utilities

Files:

- `src/collections/Comments.ts`
- `src/utils/comments.ts`
- `src/payload.config.ts`

Tasks:

1. Add the collection.
2. Register it in `payload.config.ts`.
3. Add utility helpers and hooks.
4. Keep collection file thin; import hooks/helpers from `src/utils/comments.ts`.

Acceptance criteria:

- collection compiles
- collection is admin-visible
- invariants are centralized in `src/utils/comments.ts`

### Phase 2: GraphQL surface

Files:

- `src/graphql/queries/Comments/index.ts`
- `src/graphql/queries/Comments/resolver.ts`
- `src/graphql/mutations/CreateComment/index.ts`
- `src/graphql/mutations/CreateComment/resolver.ts`
- `src/graphql/mutations/UpdateCommentStatus/index.ts`
- `src/graphql/mutations/UpdateCommentStatus/resolver.ts`
- `src/graphql/queries/index.ts`
- `src/graphql/mutations/index.ts`

Tasks:

1. Create custom GraphQL types for public comment payloads.
2. Implement query resolver with target readability rules.
3. Implement create mutation with role, content, parent-thread, and target checks.
4. Implement admin status mutation.

Acceptance criteria:

- anonymous approved-only reads work
- authenticated reader gets approved + own pending
- private chapter access respects grant mirror
- password-locked chapter access respects proof
- admin-only moderation mutation works

### Phase 3: migration and generated files

Files:

- `src/migrations/<timestamp>_comments.ts`
- `src/migrations/<timestamp>_comments.json`
- `src/payload-types.ts`

Tasks:

1. Run `pnpm generate:types`
2. Run `pnpm payload migrate:create`
3. Commit both migration files

Important:

- do not edit `src/payload-types.ts` manually
- no `generate:importmap` run is needed unless a new admin component path is added

### Phase 3.5: query-plan verification

Files:

- no permanent source files required
- record findings in PR notes or implementation notes

Tasks:

1. Inspect the generated migration to confirm indexes exist.
2. Run representative reads with `EXPLAIN QUERY PLAN`.
3. Confirm indexed `SEARCH` plans for the hot paths.

Acceptance criteria:

- no broad table scan on primary read path
- no accidental sort temp b-tree on primary read path when an index should satisfy order

## `next-blog` Plan

### API route strategy

Add same-origin route:

- `../next-blog/pages/api/comments.ts`

Support:

- `GET /api/comments?chapterId=...`
- `GET /api/comments?postId=...`
- `POST /api/comments`

Why one route is enough:

- public site only needs fetch-list and create
- admin moderation stays in Payload admin

### Forwarded auth and password-proof inputs

The API route must forward:

- Better Auth session token from `getBetterAuthTokenFromRequest`
- chapter password proof from `getChapterPasswordProofCookieValueFromRequest`

Use the same password-proof forwarding pattern already used in:

- `../next-blog/common/apis/chapters.ts`

### `next-blog` response contract

Recommended route response for `GET`:

```ts
{
  docs: PublicComment[];
  totalDocs: number;
  viewerCanComment: boolean;
}
```

Recommended route response for `POST`:

```ts
{
  comment: PublicComment;
}
```

Always return `Cache-Control: no-store`.

### `next-blog` type work

Update:

- `../next-blog/types/cms.ts`

Add:

- `CommentStatus`
- `CommentAuthor`
- `Comment`

### `next-blog` API helper

Add:

- `../next-blog/common/apis/comments.ts`

Recommended exports:

- `getComments(args)`
- `createComment(args)`

This helper should target `/api/comments`, not Payload directly.

### Comments UI component

Add:

- `../next-blog/components/shared/comments-section.tsx`

Component behavior:

1. Client component.
2. Fetch comments on mount from `/api/comments`.
3. Render top-level comments and one reply level.
4. Show reply button only on approved top-level comments.
5. Hide the comment form if `viewerCanComment === false`.
6. On submit:
   - POST to `/api/comments`
   - append returned pending comment locally
   - clear textarea
   - show “awaiting moderation” state inline
7. Handle 401, 403, and validation errors cleanly.

Important renderer rules:

- render comment content as plain text only
- do not use HTML injection
- badge pending comments clearly when they belong to the current user

### Chapter page integration

Update:

- `../next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`

Recommended placement:

- below chapter navigation block
- above nothing else dynamic on the page

Props available already:

- `chapter.id`
- `book.id`
- `chapter.hasPassword`

Do not fetch comments in `getServerSideProps`. Let the client component call the same-origin route so password-proof and auth cookies flow consistently.

### Post page integration

Update:

- `../next-blog/pages/posts/[slug].tsx`

Recommended placement:

- below `PostContent`
- before `SectionSeparator` / “More posts”

Keep this page static.

Do not convert `getStaticProps` to `getServerSideProps` just for comments.

## `next-blog` File-Level Work Breakdown

### Phase 4: API adapter and types

Files:

- `../next-blog/pages/api/comments.ts`
- `../next-blog/common/apis/comments.ts`
- `../next-blog/types/cms.ts`

Tasks:

1. Add route validation and error mapping.
2. Forward auth token and password-proof header to Payload GraphQL.
3. Add local type definitions for public comment payloads.

Acceptance criteria:

- anonymous public reads work for published posts and readable chapters
- authenticated reads include own pending comments
- unauthenticated POST returns 401
- password-locked chapter comments stay blocked until chapter proof cookie exists

### Phase 5: comments UI

Files:

- `../next-blog/components/shared/comments-section.tsx`
- `../next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`
- `../next-blog/pages/posts/[slug].tsx`

Tasks:

1. Build the thread renderer.
2. Build top-level form and reply form.
3. Add optimistic local append for newly created pending comments.
4. Hide form when viewer cannot comment.

Acceptance criteria:

- chapter page renders thread
- post page renders thread
- top-level create works
- reply create works
- pending state is visible immediately after submit

## API Contract Details

### Payload GraphQL query contract

Recommended query name:

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
      author {
        id
        fullName
        avatar {
          id
          url
          optimizedUrl
          thumbnailURL
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

### Payload GraphQL create mutation contract

```graphql
mutation CreateComment(
  $chapterId: ID
  $postId: ID
  $content: String!
  $parentCommentId: ID
) {
  createComment(
    chapterId: $chapterId
    postId: $postId
    content: $content
    parentCommentId: $parentCommentId
  ) {
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
      author {
        id
        fullName
        avatar {
          id
          url
          optimizedUrl
          thumbnailURL
          lowResUrl
          alt
        }
      }
    }
  }
}
```

### Payload GraphQL moderation mutation contract

```graphql
mutation UpdateCommentStatus($commentId: ID!, $status: String!) {
  updateCommentStatus(commentId: $commentId, status: $status) {
    comment {
      id
      status
      updatedAt
    }
  }
}
```

### `next-blog` HTTP route contract

#### `GET /api/comments`

Allowed query params:

- `chapterId`
- `postId`

Rules:

- exactly one required

Success:

```json
{
  "docs": [],
  "totalDocs": 0,
  "viewerCanComment": false
}
```

#### `POST /api/comments`

Allowed body:

```json
{
  "chapterId": 123,
  "content": "Hello",
  "parentCommentId": 456
}
```

or

```json
{
  "postId": 321,
  "content": "Hello"
}
```

Success:

```json
{
  "comment": {
    "id": "1",
    "content": "Hello",
    "status": "pending"
  }
}
```

### Error mapping contract

The blog API route should normalize GraphQL or validation errors into stable HTTP behavior.

Recommended mapping:

- malformed query/body shape: `400`
- unauthenticated create: `401`
- authenticated but forbidden target: `403`
- target not found or unreadable: `404`
- validation failure such as reply-to-reply or empty content: `400`
- unexpected server error: `500`

Recommended user-facing generic messages:

- `400`: `Invalid comment request.`
- `401`: `You must be signed in to comment.`
- `403`: `You do not have permission to comment here.`
- `404`: `Comments are unavailable for this content.`
- `500`: `Unable to load comments right now.`

## Edge Cases the Implementer Must Not Skip

1. Comment creation on a private chapter must fail if the user lost book access after page load.
2. Comment reads on password-locked chapters must fail until proof is present.
3. Replying to a reply must be rejected.
4. Replying to a pending or rejected parent must be rejected.
5. Parent comment from a different chapter/post must be rejected.
6. Content containing only whitespace must be rejected.
7. Overlong content must be rejected.
8. Anonymous users must never see pending comments.
9. Logged-in users should only see their own pending comments, not other users’ pending comments.
10. Rejected comments should stay out of public-site responses.
11. Do not expose admin moderation mutation through `next-blog`.
12. Do not show comments on draft posts in preview mode in this phase.
13. Do not rely on client-side cookie parsing for auth decisions; server routes should decide.
14. Do not let pending comments from a deleted or rejected parent create orphaned visible reply trees.
15. Do not allow a reply on a target whose top-level parent is no longer approved.
16. Do not allow create if both `chapterId` and `postId` are omitted.
17. Do not allow create if both `chapterId` and `postId` are provided.
18. Do not trust client-submitted `author`, `status`, `moderatedAt`, or `moderatedBy`.
19. Do not forget to trim content before length validation.
20. Do not silently accept invalid moderation status strings.

## Failure Modes and How to Handle Them

### Failure mode: public post comments disappear for anonymous readers

Cause:

- implementer reused `postsReadAccess`

Correct fix:

- comment resolver must load post by ID with `overrideAccess: true` and explicitly require published status

### Failure mode: chapter comments visible before chapter password is unlocked

Cause:

- implementer checked chapter collection visibility only

Correct fix:

- enforce `canReadChapterContentForRequest` in comment query and create flows

### Failure mode: weak query plan with large OR condition

Cause:

- implementer used one broad query instead of two narrow indexed queries

Correct fix:

- split approved and own-pending reads

### Failure mode: SSR regression on posts

Cause:

- implementer moved post page to `getServerSideProps`

Correct fix:

- keep post page static and load comments client-side through `/api/comments`

### Failure mode: browser cannot submit comment because auth token is inaccessible

Cause:

- implementer tried direct browser-to-Payload call

Correct fix:

- browser calls same-origin blog API route; server route forwards token from cookies

### Failure mode: duplicate rendering or unstable order after create

Cause:

- implementer appends pending comment without dedupe or stable sort

Correct fix:

- dedupe by `id` and sort by `createdAt`

## Testing Plan

### `payloadcms`

Create:

- `tests/int/comments.int.spec.ts`

Cover at minimum:

1. `Comments` collection field presence and admin config.
2. Mutual exclusivity validation for `chapter`/`post`.
3. Immutable target fields after create.
4. Content normalization and max-length validation.
5. `comments` query returns approved-only for anonymous.
6. `comments` query returns approved + own pending for authenticated reader.
7. `createComment` rejects anonymous requests.
8. `createComment` rejects admin commenter role if strict user-only rule is chosen.
9. `createComment` rejects invalid parent target mismatch.
10. `createComment` rejects reply-to-reply.
11. `createComment` enforces chapter password proof.
12. `updateCommentStatus` requires admin and sets moderation metadata.

### `next-blog`

Create:

- `../next-blog/tests/api/comments.test.ts`
- `../next-blog/tests/components/comments-section.test.tsx`

Cover at minimum:

1. GET route forwards auth token when present.
2. GET route forwards chapter password proof when present.
3. POST route rejects unauthenticated requests.
4. POST route forwards `createComment` payload correctly.
5. Component renders top-level + reply grouping correctly.
6. Component hides form when `viewerCanComment` is false.
7. Component appends pending comment after submit.
8. Component shows pending badge / moderation message.

### Verification commands

In `payloadcms`:

```bash
pnpm generate:types
pnpm payload migrate:create
pnpm payload migrate:status
pnpm tsc --noEmit
pnpm test:int tests/int/comments.int.spec.ts
pnpm test:int
```

In `next-blog`:

```bash
pnpm lint
pnpm test tests/api/comments.test.ts
pnpm test tests/components/comments-section.test.tsx
pnpm test
```

## Work Breakdown Structure

### Phase 0: alignment spike

Deliverables:

- confirm final public-site rule is “authenticated `role === user` can comment”
- confirm comments on password-locked chapters are hidden until unlock
- confirm post comments remain client-fetched on static pages

Exit criteria:

- no unresolved product ambiguity before implementation starts

### Phase 1: Payload schema foundation

Deliverables:

- `Comments` collection
- `src/utils/comments.ts`
- collection registration

Exit criteria:

- schema compiles
- migration generated

### Phase 2: Payload GraphQL contract

Deliverables:

- `comments` query
- `createComment` mutation
- `updateCommentStatus` mutation

Exit criteria:

- integration spec passes for resolver behavior

### Phase 3: Blog API adapter

Deliverables:

- `/api/comments`
- `common/apis/comments.ts`
- blog types updated

Exit criteria:

- route tests pass for anonymous, authenticated, and password-proof flows

### Phase 4: Blog UI integration

Deliverables:

- shared comments section component
- chapter page integration
- post page integration

Exit criteria:

- thread renders correctly
- create + reply UX works

### Phase 5: moderation and hardening

Deliverables:

- moderation metadata wired
- admin moderation verified
- error states and empty states polished

Exit criteria:

- admin can approve/reject without data-shape bugs

### Phase 6: final verification

Deliverables:

- generated files updated
- migration committed
- both repos tested

Exit criteria:

- verification command set passes or blockers are documented explicitly

## Definition of Done

The feature is not done until all items below are true.

### PayloadCMS done criteria

1. `Comments` collection exists and is registered.
2. Field indexes and compound indexes are present in schema.
3. Migration files were generated and committed.
4. `src/payload-types.ts` was regenerated.
5. `comments` query is registered and returns custom public payload.
6. `createComment` mutation is registered and creates `pending` comments only.
7. `updateCommentStatus` mutation is registered and admin-only.
8. Chapter comment reads and creates enforce password-proof access.
9. Anonymous reads show approved comments only.
10. Authenticated user reads show approved comments plus their own pending comments only.
11. Rejected comments never appear in public responses.

### next-blog done criteria

1. `/api/comments` exists and handles `GET` and `POST`.
2. The API route forwards Better Auth token.
3. The API route forwards chapter password proof.
4. Chapter page renders comments section.
5. Post page renders comments section without changing to SSR.
6. Create comment UI works for top-level comments.
7. Reply UI works for one reply level only.
8. Pending moderation state is shown after submit.
9. Plain text rendering is used for comment content.

### Verification done criteria

1. `payloadcms` TypeScript passes.
2. `payloadcms` targeted integration tests pass.
3. `next-blog` lint and targeted tests pass.
4. Representative query plans were checked.
5. No generated file was edited manually.

## Resolver Pseudocode Appendix

### `commentsResolver` pseudocode

```ts
async function commentsResolver(_, args, context) {
  const req = context.req
  const payload = req.payload
  const user = req.user ?? null

  assertExactlyOneTarget(args.chapterId, args.postId)

  const target =
    args.chapterId != null
      ? await assertCommentTargetReadable({
          chapterId: args.chapterId,
          payload,
          req,
          user,
        })
      : await assertCommentTargetReadable({
          postId: args.postId,
          payload,
          req,
          user,
        })

  const approvedDocs = await payload.find({
    collection: 'comments',
    where: {
      and: [
        buildTargetWhere(target),
        { status: { equals: 'approved' } },
      ],
    },
    sort: 'createdAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })

  let pendingDocs = []

  if (user?.role === 'user') {
    pendingDocs = (
      await payload.find({
        collection: 'comments',
        where: {
          and: [
            buildTargetWhere(target),
            { status: { equals: 'pending' } },
            { author: { equals: user.id } },
          ],
        },
        sort: 'createdAt',
        limit: 200,
        depth: 1,
        overrideAccess: true,
      })
    ).docs
  }

  const merged = dedupeById([...approvedDocs.docs, ...pendingDocs])
  merged.sort(sortByCreatedAtAscending)

  return {
    docs: merged.map((doc) => mapCommentDocToPublicComment(doc, user)),
    totalDocs: merged.length,
    viewerCanComment: user?.role === 'user',
  }
}
```

### `createCommentResolver` pseudocode

```ts
async function createCommentResolver(_, args, context) {
  const req = context.req
  const payload = req.payload
  const user = req.user

  assertAuthenticated(user)
  assertCommentCreateRole(user)
  assertExactlyOneTarget(args.chapterId, args.postId)

  const target = await assertCommentTargetReadable({
    chapterId: args.chapterId,
    postId: args.postId,
    payload,
    req,
    user,
  })

  const content = normalizeCommentContent(args.content)

  const parent = await assertParentCommentIsValid({
    parentCommentId: args.parentCommentId,
    target,
    payload,
    req,
  })

  const created = await payload.create({
    collection: 'comments',
    data: {
      chapter: target.type === 'chapter' ? target.id : null,
      post: target.type === 'post' ? target.id : null,
      author: user.id,
      content,
      status: 'pending',
      parentComment: parent?.id ?? null,
      moderatedAt: null,
      moderatedBy: null,
    },
    overrideAccess: true,
  })

  return {
    comment: mapCommentDocToPublicComment(created, user),
  }
}
```

### `updateCommentStatusResolver` pseudocode

```ts
async function updateCommentStatusResolver(_, args, context) {
  const req = context.req
  const payload = req.payload
  const user = req.user

  assertAdmin(user)
  assertAllowedModerationStatus(args.status)

  const existing = await payload.findByID({
    collection: 'comments',
    id: args.commentId,
    depth: 1,
    overrideAccess: true,
  })

  if (!existing) {
    throw new Error('Comment not found')
  }

  const updated = await payload.update({
    collection: 'comments',
    id: args.commentId,
    data: {
      status: args.status,
      moderatedAt: new Date().toISOString(),
      moderatedBy: user.id,
    },
    overrideAccess: true,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
```

## Blog API Route Pseudocode Appendix

### `pages/api/comments.ts` pseudocode

```ts
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  if (req.method === 'GET') {
    const sessionToken = getBetterAuthTokenFromRequest(req)
    const chapterPasswordProof = getChapterPasswordProofCookieValueFromRequest(req)

    validateExactlyOneTarget(req.query.chapterId, req.query.postId)

    const graphqlResponse = await fetchPayloadGraphQL({
      query: COMMENTS_QUERY,
      variables: normalizeTargetVariables(req.query),
      authToken: sessionToken,
      chapterPasswordProof,
    })

    return sendMappedGraphQLResponse(res, graphqlResponse)
  }

  if (req.method === 'POST') {
    const sessionToken = getBetterAuthTokenFromRequest(req)
    const chapterPasswordProof = getChapterPasswordProofCookieValueFromRequest(req)

    if (!sessionToken) {
      return res.status(401).json({ error: 'You must be signed in to comment.' })
    }

    const body = parseJsonBody(req.body)
    validateCreateBody(body)

    const graphqlResponse = await fetchPayloadGraphQL({
      query: CREATE_COMMENT_MUTATION,
      variables: normalizeCreateVariables(body),
      authToken: sessionToken,
      chapterPasswordProof,
    })

    return sendMappedGraphQLResponse(res, graphqlResponse)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method Not Allowed' })
}
```

## UI Assembly Appendix

### Thread assembly algorithm

Input:

- flat `docs` array from API

Process:

1. split docs into:
   - `topLevel = docs.filter(parentCommentId == null)`
   - `replies = docs.filter(parentCommentId != null)`
2. create a `Map<parentCommentId, Comment[]>`
3. insert replies into the map
4. render top-level comments in created order
5. for each top-level comment, render `replyMap.get(comment.id) ?? []`

Do not recursively traverse replies.

### Optimistic/local update rules

After successful `POST`:

1. append returned comment if not already present
2. sort by `createdAt`
3. if it is a reply, place under parent using `parentCommentId`
4. show pending badge if `status === 'pending'`
5. clear the relevant form

### Empty-state rules

- no comments + cannot comment: show `No comments yet.`
- no comments + can comment: show `No comments yet. Start the discussion.`
- fetch error: show non-blocking error box with retry action

## Final Recommendations

1. Keep comments plain-text in Phase 2. Rich-text comments are not worth the moderation and sanitization overhead yet.
2. Use same-origin blog API routes, not direct browser-to-Payload requests.
3. Treat password-locked chapter comments as part of protected chapter content.
4. Keep post pages static; fetch comments client-side.
5. Keep Auther unchanged for now. If product later needs “read but cannot comment,” add a `commenter` relation at the book model level instead of introducing a new comment resource type.
