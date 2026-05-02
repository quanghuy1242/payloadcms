# Comment Improvements Plan

## Scope

### Goal

Extend the existing Payload comments foundation so it supports:

1. authenticated admin users commenting through the public-site flow
2. author-side comment editing within a 5-hour window
3. author-side soft delete
4. server-side rate limiting for comment creation

The output of this plan is an implementation-grade handoff for `payloadcms` and the `next-blog` consumer.

### In Scope

- `payloadcms` comment schema updates
- `payloadcms` shared comment utility updates in `src/utils/comments.ts`
- `payloadcms` GraphQL contract changes for comment edit/delete
- `payloadcms` integration tests for the updated contract
- `next-blog` same-origin API proxy routes for comment read/create/edit/delete
- `next-blog` data adapters, types, and UI wiring for edit/delete states

### Out of Scope

- anonymous commenting
- rich-text comments
- nested replies beyond the current one-reply-level model
- a full comments moderation dashboard in `next-blog`
- replacing the existing custom comment GraphQL surface with Payload auto-generated collection mutations
- `auther` permission model changes

## Current-State Findings

1. `payloadcms` already has a `comments` collection in `src/collections/Comments.ts`, but all collection operations are `adminAccess`, so the public flow does not use collection access at all.
2. Public comment behavior is currently implemented through custom GraphQL extensions:
   - query: `src/graphql/queries/Comments/`
   - create mutation: `src/graphql/mutations/CreateComment/`
   - moderation mutation: `src/graphql/mutations/UpdateCommentStatus/`
3. Those resolvers use `overrideAccess: true` and rely on shared helpers in `src/utils/comments.ts`.
4. The current role gate is stricter than the rough plan assumes:
   - `assertCommentCreateRole` rejects any authenticated user whose `role !== 'user'`
   - `viewerCanComment` returns `true` only for `role === 'user'`
5. The current public query returns:
   - approved comments for anonymous viewers
   - approved comments plus the viewer's own pending comments for authenticated `user` role viewers
   - no own-pending branch for authenticated `admin` viewers
6. The current schema has no delete marker. Statuses are only:
   - `pending`
   - `approved`
   - `rejected`
7. The current schema already has hot-path indexes for public reads:
   - `['chapter', 'status', 'createdAt']`
   - `['post', 'status', 'createdAt']`
   - `['chapter', 'author', 'status', 'createdAt']`
   - `['post', 'author', 'status', 'createdAt']`
8. The current repo already has integration coverage in `tests/int/comments.int.spec.ts` for:
   - collection config
   - comment utils
   - public query behavior
   - create mutation
   - moderation mutation
9. `next-blog` currently has:
   - shared GraphQL transport in `../next-blog/common/apis/base.ts`
   - token forwarding helpers in `../next-blog/common/utils/auth.ts`
   - chapter password proof forwarding pattern in `../next-blog/common/apis/chapters.ts` and `../next-blog/pages/api/chapters/unlock.ts`
10. `next-blog` does not currently have comment-specific files, routes, types, or UI.
11. `auther` does not need a contract change for this work. `payloadcms` already maps token roles into Payload users in `src/lib/betterAuth/users.ts`, and `next-blog` already forwards both Better Auth and Payload admin tokens.

### Rough-Plan Mismatches

1. The rough note suggests moving comment access into collection access and switching to Payload's generated mutations. That is not the right change for this phase.
2. In this repo, the custom comment GraphQL contract is already the public surface. Replacing it with generated collection mutations would create a larger contract change, broaden the exposed mutation surface, and force unnecessary `next-blog` remapping work.
3. The rough note also assumes current indexes are sufficient for rate limiting. They are sufficient for the existing public-read query shape, but they are not ideal for the new per-author, time-window rate-limit queries if those queries ignore `status`.

## Architecture Decision

### Chosen Approach

Keep the current custom GraphQL comment architecture and extend it incrementally.

That means:

1. keep `Comments` collection access admin-only by default
2. keep the custom `comments` query
3. keep the custom `createComment` mutation
4. keep the custom `updateCommentStatus` moderation mutation
5. add new custom `updateComment` and `deleteComment` mutations
6. move new reusable edit/delete/rate-limit logic into `src/utils/comments.ts`
7. expose the improved behavior to the browser only through `next-blog` same-origin API routes

### Why This Fits the Current Repo

1. It matches the current public contract pattern instead of replacing it.
2. It keeps collection files thin and shared logic centralized in `src/utils/comments.ts`.
3. It avoids broadening the default REST/GraphQL collection surface for comments.
4. It lets the public contract return a viewer-scoped `PublicComment` shape instead of raw collection docs.
5. It reuses existing chapter-password and token-forwarding patterns already present in `next-blog`.

### Rejected Alternatives

#### Alternative A: Move everything to collection access + generated Payload mutations

Reject for this phase.

Why rejected:

1. It is a larger architectural refactor than the requested feature set.
2. It would force `next-blog` to consume raw collection mutation shapes instead of the existing public comment shape.
3. It would create more risk around exposing comment fields the public flow should not write directly.

#### Alternative B: Add a new `status: 'deleted'`

Reject.

Why rejected:

1. Deletion is not the same concern as moderation status.
2. Mixing moderation and tombstone state into one enum makes resolver logic and admin filtering harder to reason about.
3. A separate delete marker keeps moderation semantics unchanged.

## Cross-Repo Responsibility Split

### `payloadcms`

Owns:

- comment persistence
- comment validation
- target readability checks
- author ownership checks
- moderation rules
- soft-delete state
- rate limiting
- GraphQL contract

Must not do:

- browser-only UI behavior
- public-route proxying
- direct browser session handling

### `next-blog`

Owns:

- same-origin browser-facing API routes
- forwarding auth tokens and chapter password proof
- rendering thread UI
- optimistic/local state updates after create/edit/delete
- mapping payload GraphQL errors to browser-friendly HTTP responses

Must not do:

- direct browser-to-Payload comment mutations
- re-implementing comment authorization rules locally
- guessing edit-window logic without server flags

### `auther`

Owns:

- upstream user identity and role claims

Changes required in this plan:

- none

## Data Model Plan

### Keep Existing Status Model

Do not change `COMMENT_STATUSES`.

Statuses remain:

- `pending`
- `approved`
- `rejected`

### Add Soft-Delete Audit Fields

Edit `src/collections/Comments.ts` to add:

1. `deletedAt`
   - type: `date`
   - admin: read-only
   - nullable
2. `deletedBy`
   - type: `relationship`
   - relationTo: `users`
   - admin: read-only
   - nullable

Do not add a new `isDeleted` database field. The public API can derive `isDeleted = deletedAt != null`.

### Admin Config Updates

Update the collection admin config to include the new tombstone fields in a sensible place:

- include `deletedAt` in `defaultColumns`
- keep `content` as the title for admin searchability

No admin component path changes are required, so `pnpm generate:importmap` is not part of this plan.

### Index Plan

Keep the existing read indexes and add rate-limit indexes:

1. `['author', 'createdAt']`
   - supports global per-author hourly limits
2. `['chapter', 'author', 'createdAt']`
   - supports per-chapter per-author 10-minute limits without relying on `status`
3. `['post', 'author', 'createdAt']`
   - supports per-post per-author 10-minute limits without relying on `status`

Do not remove the existing `status`-based indexes; public comment reads still depend on them.

### Migration Verdict

- Migration required: yes
- Env update required: no
- Build-mode exception applies: no

Files that must change together:

- `src/collections/Comments.ts`
- `src/payload-types.ts`
- `src/migrations/<new timestamp>_comment_improvements.ts`
- `src/migrations/<new timestamp>_comment_improvements.json`
- `src/migrations/index.ts`

## Access / Auth Plan

### Read Rules

#### Anonymous viewer

Can:

- read approved comments on published posts
- read approved comments on readable chapters when chapter password proof is valid

Cannot:

- comment
- see pending comments
- see rejected comments

#### Authenticated viewer, any role

Roles covered:

- `user`
- `admin`

Can:

- read approved comments
- read their own pending comments
- create new comments if the target is readable and rate limits allow
- edit their own visible comments inside the edit window
- soft-delete their own comments

Cannot:

- see other users' pending comments
- see rejected comments
- edit or delete someone else's comment through the public flow

### Moderation Rules

Only admins can moderate through `updateCommentStatus`.

That mutation remains separate from author edit/delete behavior.

Additional rule for this phase:

- `updateCommentStatus` must reject comments that are already soft-deleted

### Edit Rules

Edit is author-owned, not role-owned.

That means an admin user commenting through the public flow may edit their own comment as an author, but does not gain staff-style edit powers over other users' comments through this mutation.

Author edit is allowed only when all are true:

1. requester is authenticated
2. requester owns the comment
3. comment is not soft-deleted
4. comment target is still readable under current access rules
5. current time is within 5 hours of `createdAt`
6. comment status is `pending` or `approved`

#### Status transition on author edit

If the author edits:

- a `pending` comment: keep it `pending`
- an `approved` comment: set it back to `pending` and clear moderation metadata

Do not make rejected comments editable in this phase. The current public query does not expose them, and widening that visibility is out of scope.

### Delete Rules

Soft delete is author-owned, not role-owned.

Delete is allowed when all are true:

1. requester is authenticated
2. requester owns the comment
3. comment is not already soft-deleted

There is no 5-hour limit on delete.

### Token / Proof Forwarding

`next-blog` must continue to forward:

1. auth token from `getBetterAuthTokenFromRequest`
2. chapter password proof using the same `x-chapter-password-proof` header pattern already used by chapter fetches

No `auther` changes are required.

## API / Contract Plan

## `payloadcms` GraphQL Contract

### Existing Query: `comments`

Keep the query name and target args:

```graphql
comments(chapterId: ID, postId: ID): CommentsResult!
```

Extend `PublicComment` with viewer-scoped fields:

```graphql
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
  isDeleted: Boolean!
  viewerCanEdit: Boolean!
  viewerCanDelete: Boolean!
  editWindowEndsAt: String
  author: PublicCommentAuthor!
}
```

Rules:

1. `viewerCanComment` becomes `true` for any authenticated viewer whose token resolved to a Payload user, including `admin`.
2. When `isDeleted === true`, the resolver must return `content: ''` in the public shape so deleted text is not exposed publicly.
3. `viewerCanEdit` and `viewerCanDelete` must be computed server-side from ownership, deletion state, status, and edit-window rules.

### Existing Mutation: `createComment`

Keep the mutation name and public return shape.

Behavior changes:

1. remove the strict `role === 'user'` gate
2. require only an authenticated Payload user
3. apply the new rate-limit helper before `payload.create`

### New Mutation: `updateComment`

Add:

```graphql
updateComment(commentId: ID!, content: String!): UpdateCommentResult!
```

Behavior:

1. load the comment by ID with `overrideAccess: true`
2. verify author ownership
3. verify target readability
4. verify not deleted
5. verify 5-hour edit window
6. normalize the new content
7. if original status is `approved`, write `status: 'pending'`, `moderatedAt: null`, `moderatedBy: null`
8. if original status is `pending`, keep `pending`
9. return the same `PublicComment` shape as the other mutations

### New Mutation: `deleteComment`

Add:

```graphql
deleteComment(commentId: ID!): DeleteCommentResult!
```

Behavior:

1. load the comment by ID with `overrideAccess: true`
2. verify author ownership
3. reject already-deleted comments
4. update `deletedAt` and `deletedBy`
5. do not hard-delete the record
6. do not clear `content` in the database in this phase
7. return the same `PublicComment` shape, which will now have `isDeleted: true` and `content: ''`

### Existing Mutation: `updateCommentStatus`

Keep the mutation name:

```graphql
updateCommentStatus(commentId: ID!, status: String!): UpdateCommentStatusResult!
```

Add guard:

- reject moderation attempts when `deletedAt != null`

## `next-blog` HTTP Contract

### `GET /api/comments`

Purpose:

- fetch comments for either a chapter or a post

Inputs:

- `chapterId` xor `postId`

Behavior:

1. forward auth token when present
2. forward chapter password proof when relevant
3. return the custom `comments` GraphQL payload as JSON
4. set `Cache-Control: no-store, max-age=0`

### `POST /api/comments`

Purpose:

- create a top-level comment or reply

Body:

```json
{
  "chapterId": "7",
  "postId": null,
  "content": "Hello",
  "parentCommentId": null
}
```

Rules:

1. require auth token
2. forward chapter password proof
3. call `createComment`
4. return `401` when the user is not authenticated
5. return `429` when Payload reports rate limiting

### `PATCH /api/comments/[commentId]`

Purpose:

- edit the author's own comment

Body:

```json
{
  "content": "Updated text"
}
```

Rules:

1. require auth token
2. call `updateComment`
3. return the updated public comment payload

### `DELETE /api/comments/[commentId]`

Purpose:

- soft-delete the author's own comment

Rules:

1. require auth token
2. call `deleteComment`
3. return the updated tombstoned public comment payload

### Error Mapping Rules in `next-blog`

Map GraphQL errors to HTTP status codes using stable message matching:

1. `You must be signed in to comment.` -> `401`
2. `Too many comments` -> `429`
3. `Comment not found.` or `Comment target not found.` -> `404`
4. ownership, edit-window, unreadable-target, or deleted-comment errors -> `403`
5. validation errors such as invalid IDs, duplicate targets, empty content -> `400`
6. anything else -> `500`

Do not collapse all GraphQL failures into `500`.

## Database and Performance Plan

### Hot Paths

1. existing public read query by:
   - target
   - status
   - `createdAt` ascending
2. new create-time rate-limit queries by:
   - author + recent `createdAt`
   - target + author + recent `createdAt`

### Query Guidance

For rate limiting, count all comments by the author in the time window regardless of moderation status or deletion state.

Reason:

1. otherwise a spammer can delete and repost to bypass limits
2. status-specific counting would force more complicated query logic

### Recommended Rate Limits

1. per target: max 5 comments per 10 minutes
2. global per author: max 20 comments per hour

### Query Implementation Detail

Implement rate limiting as two indexed count queries in `payloadcms`, not in `next-blog`.

Do not rely on client throttling or browser memory for enforcement.

### Visibility / Mapping Detail

When a comment is soft-deleted:

1. keep the record in the public thread result if its moderation visibility would otherwise include it
2. return `isDeleted: true`
3. return `content: ''`
4. let the UI render a tombstone label such as `Comment deleted`

This keeps reply structure stable without adding a second "load deleted parents" query path.

## Exact File Checklist

## `payloadcms`

### Edit `src/collections/Comments.ts`

Add:

- `deletedAt`
- `deletedBy`
- new rate-limit indexes
- optional `deletedAt` admin column

Must not:

- switch collection access away from admin-only in this phase
- add admin component paths

### Edit `src/utils/comments.ts`

Add or update helpers for:

- authenticated commenter check that allows any authenticated Payload user
- viewer-can-comment check for any authenticated Payload user
- edit-window calculation
- author ownership checks
- soft-delete checks
- rate-limit checks
- public comment mapping with:
  - `isDeleted`
  - `viewerCanEdit`
  - `viewerCanDelete`
  - `editWindowEndsAt`
  - blank public `content` when deleted

Must not:

- move browser logic into this module
- duplicate access helpers already in `src/utils/access.ts`

### Edit `src/graphql/queries/Comments/index.ts`

Update:

- `PublicComment` GraphQL type fields
- `CommentsResult` to keep `viewerCanComment`

Must not:

- change the query name

### Edit `src/graphql/queries/Comments/resolver.ts`

Update:

- `viewerCanComment`
- mapping to the expanded public shape

Must not:

- re-implement normalization that already belongs in `src/utils/comments.ts`

### Edit `src/graphql/mutations/CreateComment/index.ts`

Update returned GraphQL type to match the expanded public shape.

### Edit `src/graphql/mutations/CreateComment/resolver.ts`

Update:

- auth rule from "role user only" to "authenticated user"
- rate-limit enforcement before `payload.create`

Must not:

- skip target readability checks

### Add `src/graphql/mutations/UpdateComment/index.ts`

Export the GraphQL field config for `updateComment`.

### Add `src/graphql/mutations/UpdateComment/resolver.ts`

Implement author edit flow.

Must:

- load the existing comment
- enforce ownership
- enforce edit window
- re-pend approved comments

Must not:

- allow relational field updates
- allow editing deleted comments

### Add `src/graphql/mutations/DeleteComment/index.ts`

Export the GraphQL field config for `deleteComment`.

### Add `src/graphql/mutations/DeleteComment/resolver.ts`

Implement author soft-delete flow.

Must:

- set `deletedAt`
- set `deletedBy`
- return tombstoned public comment payload

Must not:

- call `payload.delete`

### Edit `src/graphql/mutations/UpdateCommentStatus/index.ts`

Update the returned public comment shape if shared fields were expanded.

### Edit `src/graphql/mutations/UpdateCommentStatus/resolver.ts`

Add guard against moderating deleted comments.

### Edit `src/graphql/mutations/index.ts`

Register:

- `updateComment`
- `deleteComment`

### Edit `tests/int/comments.int.spec.ts`

Extend this existing suite instead of creating a disconnected parallel comments spec.

### Generated / migration files

Add or update:

- `src/payload-types.ts`
- `src/migrations/<new timestamp>_comment_improvements.ts`
- `src/migrations/<new timestamp>_comment_improvements.json`
- `src/migrations/index.ts`

## `next-blog`

### Add `../next-blog/common/apis/comments.ts`

Own:

- comments query call
- create comment mutation call
- update comment mutation call
- delete comment mutation call
- chapter password proof header forwarding for comment requests

Must not:

- use direct browser fetch to Payload
- duplicate token parsing logic

### Edit `../next-blog/types/cms.ts`

Add:

- `PublicCommentAuthor`
- `PublicComment`
- `CommentsResult`

### Add `../next-blog/pages/api/comments.ts`

Handle:

- `GET`
- `POST`

Must:

- require auth only for `POST`
- forward token and chapter password proof
- map GraphQL errors to stable HTTP responses

### Add `../next-blog/pages/api/comments/[commentId].ts`

Handle:

- `PATCH`
- `DELETE`

Must:

- require auth
- call the new Payload mutations

### Add `../next-blog/hooks/useComments.ts`

Own:

- client-side fetch/mutate state
- optimistic update for create/edit/delete
- loading/error state

Must not:

- embed CMS URLs directly

### Add shared comment UI components under `../next-blog/components/shared/comments/`

Recommended files:

- `CommentsSection.tsx`
- `CommentComposer.tsx`
- `CommentThread.tsx`
- `CommentItem.tsx`

Responsibilities:

- render flat payload into top-level + one-level replies
- show pending badge
- show deleted tombstone
- show edit/delete controls using server-provided flags

### Edit `../next-blog/pages/posts/[slug].tsx`

Mount the comments section client-side for posts.

Must not:

- convert the whole page from static generation to SSR just for comments

### Edit `../next-blog/pages/books/[slug]/chapters/[chapterSlug].tsx`

Mount the comments section for chapters using existing server-provided page props and current auth/proof context on the browser side.

## Work Breakdown Structure

### Phase 1. Schema and Shared Utility Foundation

Deliverables:

- soft-delete schema fields
- rate-limit indexes
- shared comment helper updates

Tasks:

1. add `deletedAt` and `deletedBy`
2. add three rate-limit indexes
3. add shared helpers for:
   - commenter auth
   - edit window
   - ownership
   - rate limiting
   - tombstone mapping
4. update collection admin config
5. generate types
6. create migration

Exit criteria:

- schema compiles
- migration only contains intended DDL
- mapper can produce tombstoned public comments

### Phase 2. Payload GraphQL Contract

Deliverables:

- expanded `PublicComment`
- updated `createComment`
- new `updateComment`
- new `deleteComment`
- deleted-comment moderation guard

Tasks:

1. update query/mutation GraphQL types
2. update `commentsResolver`
3. update `createCommentResolver`
4. implement `updateCommentResolver`
5. implement `deleteCommentResolver`
6. register new mutations
7. extend Payload integration tests

Exit criteria:

- all comment GraphQL operations return the same public comment shape
- admin tokens can comment through the public flow
- author edit/delete rules are enforced server-side

### Phase 3. `next-blog` Adapter Layer

Deliverables:

- comment API client module
- same-origin API routes for read/create/edit/delete
- stable HTTP error mapping

Tasks:

1. add comment types to `types/cms.ts`
2. add `common/apis/comments.ts`
3. add `pages/api/comments.ts`
4. add `pages/api/comments/[commentId].ts`
5. add route-level tests

Exit criteria:

- browser never talks directly to Payload for comment mutations
- same-origin routes forward auth and chapter proof correctly

### Phase 4. `next-blog` UI Integration

Deliverables:

- reusable comments section
- edit/delete controls
- deleted tombstone rendering

Tasks:

1. add `useComments` hook
2. add shared comment components
3. mount on post page
4. mount on chapter page
5. implement optimistic create/edit/delete updates

Exit criteria:

- post page keeps static generation
- chapter page keeps its existing access model
- edit/delete controls only render when server flags allow

### Phase 5. Verification

Deliverables:

- targeted tests passing in both repos
- type checks passing
- migration status clean

Tasks:

1. run Payload targeted tests
2. run Payload type check
3. run migration status
4. run `next-blog` lint
5. run `next-blog` targeted tests

Exit criteria:

- no contract mismatch between repos
- no accidental generated-file edits

## Edge Cases

1. Admin token on the public site should now produce `viewerCanComment: true` and allow create/edit/delete only for the admin's own comments.
2. Anonymous viewer on a password-protected chapter should still be blocked unless proof exists.
3. Auth lost between page load and submit should produce `401` from `next-blog` API routes.
4. Target post unpublished between page load and submit should fail on the server, not silently succeed.
5. Comment target deleted or inaccessible between page load and submit should fail as `404` or `403`.
6. Parent comment deleted between reply form open and submit should still reject reply creation if parent no longer qualifies.
7. Editing an approved comment within 5 hours should make it disappear from other viewers immediately because it returns to `pending`.
8. Editing after 5 hours should fail even if the UI timer was stale.
9. Double-delete should reject cleanly instead of updating `deletedAt` twice.
10. Deleted comments must not leak original content through the public mapper.
11. Rate limiting must count recently deleted comments too, or users can bypass by delete-and-repost loops.
12. Rejected comments should remain invisible in the public query during this phase.

## Failure Modes

1. Weak implementation may change collection access to `authenticatedAccess` and delete the custom GraphQL contract. Do not do that in this phase.
2. Weak implementation may add `status: 'deleted'` instead of delete audit fields. Do not mix moderation and tombstone state.
3. Weak implementation may enforce edit/delete permissions only in `next-blog`. Server-side enforcement in Payload is mandatory.
4. Weak implementation may blank the stored database `content` on delete and accidentally violate required-field validation. Do not do that in this phase.
5. Weak implementation may forget to set approved edits back to `pending`, causing unmoderated content replacement.
6. Weak implementation may exclude deleted comments entirely from the response, which would collapse reply context unexpectedly.
7. Weak implementation may add rate limiting in `next-blog` only. That is not authoritative and is insufficient.
8. Weak implementation may reuse the current `status`-based indexes for rate-limit queries and assume performance is fine. Add the author-time-window indexes explicitly.
9. Weak implementation may build comment UI with direct CMS URLs in the browser. Use same-origin API routes only.
10. Weak implementation may forget `pnpm generate:types` after schema changes.

## Testing Plan

## `payloadcms`

Extend `tests/int/comments.int.spec.ts` to cover:

1. `viewerCanComment` returns `true` for authenticated admin viewers.
2. `createCommentResolver` accepts admin-authenticated public-site requests.
3. `createCommentResolver` rejects when per-target rate limit is exceeded.
4. `createCommentResolver` rejects when global rate limit is exceeded.
5. `mapCommentDocToPublicComment` returns:
   - `isDeleted`
   - blank public `content` for deleted comments
   - `viewerCanEdit`
   - `viewerCanDelete`
   - `editWindowEndsAt`
6. `updateCommentResolver`:
   - allows author edit within 5 hours
   - keeps `pending` as `pending`
   - changes `approved` to `pending`
   - clears moderation metadata on approved edit
   - rejects non-owner
   - rejects deleted comment
   - rejects expired edit window
7. `deleteCommentResolver`:
   - soft-deletes by setting `deletedAt` and `deletedBy`
   - rejects non-owner
   - rejects double-delete
8. `updateCommentStatusResolver` rejects deleted comments.
9. Collection config includes new fields and new indexes.

## `next-blog`

Add or extend:

1. `tests/apis/comments.test.ts`
   - `GET /api/comments` forwards target and optional auth/proof
   - `POST /api/comments` requires auth
   - `POST /api/comments` maps rate-limit errors to `429`
2. `tests/apis/comment-by-id.test.ts`
   - `PATCH /api/comments/[commentId]` requires auth and forwards edit payload
   - `DELETE /api/comments/[commentId]` requires auth and forwards delete mutation
3. `tests/common/apis/comments.test.ts`
   - GraphQL payload shaping
   - chapter password proof header forwarding
4. `tests/components/comments-section.test.tsx`
   - deleted tombstone rendering
   - edit/delete button visibility based on server flags
   - optimistic update behavior for create/edit/delete
5. `tests/pages/chapter-page.test.tsx` or a new page-level comments integration test
   - chapter page mounts comments section without breaking existing chapter flow

E2E is optional for this phase. The minimum protective set is targeted API, adapter, and component tests.

## Verification Commands

## `payloadcms`

Run after implementation:

```bash
pnpm generate:types
pnpm tsc --noEmit
pnpm test:int -- tests/int/comments.int.spec.ts
pnpm payload migrate:status
```

If a migration was created locally, also run it before final review with the required Turso/R2 env vars exported:

```bash
pnpm payload migrate
pnpm payload migrate:status
```

`pnpm generate:importmap` is not required unless someone adds or moves admin component paths during implementation.

## `next-blog`

Run after implementation:

```bash
pnpm lint
pnpm test -- tests/apis/comments.test.ts tests/apis/comment-by-id.test.ts tests/common/apis/comments.test.ts tests/components/comments-section.test.tsx
```

If the `next-blog` test filenames differ slightly during implementation, keep the command targeted to the new comment-related tests instead of falling back to the entire suite immediately.

## Definition of Done

This work is done only when all of the following are true:

1. authenticated admin users can comment through the public comment flow without special-casing the UI
2. the public comments query returns server-computed edit/delete flags
3. authors can edit their own visible comments within 5 hours
4. approved comments edited by authors return to `pending`
5. authors can soft-delete their own comments
6. deleted comments render as tombstones and do not expose original content publicly
7. `createComment` is rate-limited server-side by target and globally per author
8. `updateCommentStatus` cannot moderate deleted comments
9. `next-blog` uses same-origin API routes for comment create/edit/delete
10. chapter comment calls still forward password proof correctly
11. Payload types and migration files are generated and committed correctly
12. targeted verification passes in both repos

## Pseudocode Appendix

### `payloadcms`: author edit mutation

```ts
async function updateCommentResolver(_, args, context) {
  const payload = context.req.payload
  const req = context.req
  const user = req.user

  assertAuthenticatedCommentUser(user)

  const existing = await loadCommentByIdOrThrow({
    commentId: args.commentId,
    payload,
    req,
  })

  assertCommentAuthor({ comment: existing, user })
  assertCommentNotDeleted(existing)
  await assertExistingCommentTargetReadable({ comment: existing, payload, req, user })
  assertCommentEditableNow(existing, user)

  const nextContent = normalizeCommentContent(args.content)
  const originalStatus = existing.status

  const updated = await payload.update({
    collection: 'comments',
    id: existing.id,
    data: {
      content: nextContent,
      status: originalStatus === 'approved' ? 'pending' : originalStatus,
      moderatedAt: originalStatus === 'approved' ? null : existing.moderatedAt,
      moderatedBy: originalStatus === 'approved' ? null : existing.moderatedBy,
    },
    depth: 1,
    overrideAccess: true,
  })

  return {
    comment: mapCommentDocToPublicComment(updated, user),
  }
}
```

### `payloadcms`: rate-limit helper

```ts
async function assertCommentCreateRateLimit({ payload, userId, target }) {
  const now = Date.now()
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()

  const targetWhere =
    target.type === 'chapter'
      ? { chapter: { equals: target.id } }
      : { post: { equals: target.id } }

  const [perTargetCount, globalCount] = await Promise.all([
    payload.count({
      collection: 'comments',
      where: {
        and: [
          targetWhere,
          { author: { equals: userId } },
          { createdAt: { greater_than: tenMinutesAgo } },
        ],
      },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'comments',
      where: {
        and: [
          { author: { equals: userId } },
          { createdAt: { greater_than: oneHourAgo } },
        ],
      },
      overrideAccess: true,
    }),
  ])

  if (perTargetCount.totalDocs >= 5) {
    throw new Error('Too many comments on this item. Please wait a few minutes.')
  }

  if (globalCount.totalDocs >= 20) {
    throw new Error('Too many comments overall. Please wait before commenting again.')
  }
}
```

### `next-blog`: item route for edit/delete

```ts
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  const token = getBetterAuthTokenFromRequest(req)
  const commentId = normalizeCommentId(req.query.commentId)

  if (!token) {
    return res.status(401).json({ error: 'You must be signed in to comment.' })
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req.body)
    const response = await updateComment({ authToken: token, commentId, content: body.content })
    return res.status(200).json(response)
  }

  if (req.method === 'DELETE') {
    const response = await deleteComment({ authToken: token, commentId })
    return res.status(200).json(response)
  }

  res.setHeader('Allow', 'PATCH, DELETE')
  return res.status(405).json({ error: 'Method Not Allowed' })
}
```

## Final Recommendation

Implement this as an incremental extension of the current custom comment GraphQL contract, not as a collection-access refactor. The rough plan's product goals are valid, but the safest repo-aligned delivery is:

1. schema and utility additions in `payloadcms`
2. custom GraphQL contract expansion in `payloadcms`
3. same-origin API and UI work in `next-blog`
4. no `auther` change
