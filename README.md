# payloadcms

A self-hosted content management platform built on **PayloadCMS 3.60 + Next.js 15**. Manages EPUB books (with browser-side import) and blog content from a single admin panel. Exposes GraphQL + REST APIs. Operates as a **resource server consumer** and **grant projection subscriber** within the Auther identity ecosystem.

---

## Architecture

```
┌──────────────┐      OAuth2 PKCE       ┌──────────────┐
│    Auther     │◄──────────────────────►│  payloadcms   │
│    (IdP +     │                        │  (resource    │
│     AuthZ)    │     access_token       │   server      │
│              │───────────────────────►│   consumer)   │
└──────────────┘                        └──────┬────────┘
     │                                         │
     │ webhooks: grant.created/revoked         │ GraphQL + REST
     │ group.member.added/removed              │
     │                                         ▼
     │                                  ┌──────────────┐
     └─────────────────────────────────►│  GrantMirror  │
                                        │  (read model) │
                                        └──────────────┘
```

- **Identity**: Fully delegated to **Auther** via OAuth2 PKCE. No local passwords.
- **Tokens**: Validates JWKS-signed resource access tokens with audience `payload-content-api`.
- **Authorization**: Mirrors grants from the `payload-content` authorization space as a local `GrantMirror` read model — a **projection consumer**, not the canonical grant store.

---

## 1. Browser-Side EPUB Import Pipeline (1,556 lines)

A full EPUB→Payload import pipeline running entirely in the browser to avoid serverless body-size and timeout constraints.

### Architecture

```
User drops .epub
     │
     ▼
┌────────────────────────────────┐
│  Async Generator Pipeline       │
│  yields discriminated events    │
│  for real-time progress UI      │
└────────────┬───────────────────┘
             │
     ┌───────▼────────┐
     │  Phase 1: Parse │  epubjs: spine, metadata, TOC
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │  Phase 2: Book  │  Create/reuse by sourceHash + dedup
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │  Phase 3: Cover │  Resolve EPUB 2/3 manifest → upload to Media
     └───────┬────────┘
             │
     ┌───────▼──────────────────────────┐
     │  Phase 4-5: Chapters (batched)    │
     │  Max 10 chapters or 5000 words    │
     │  per batch                        │
     │  ┌──────────────────────────┐     │
     │  │  HTML → Sanitize          │     │
     │  │  → Extract images          │     │
     │  │  → Upload to Media         │     │
     │  │  → Convert to Lexical JSON │     │
     │  │  → UPSERT chapter          │     │
     │  └──────────────────────────┘     │
     └───────┬──────────────────────────┘
             │
     ┌───────▼────────┐
     │  Phase 6: Done  │  Patch book with progress + stats
     └────────────────┘
```

### Key Capabilities

- **Resumption checkpointing** — detects already-saved chapters by `chapterSourceKey` + `importBatchId`, skipping re-processing
- **Cancellation** — `AbortController` with cooperative checks at every await boundary
- **Retry** — per-chapter (2 attempts, 150ms backoff) + per-batch (1 attempt, 250ms backoff)
- **Three-tier image dedup** — in-memory cache → inflight promise coalescing → filename lookup in Media collection
- **Failure log** — per-chapter `{chapterIndex, chapterTitle, error, timestamp}` records stored on the book
- **Progress events** — async generator yields discriminated union events for real-time UI: phase changes, image uploads, chapter progress, warnings, completion

### HTML → Lexical Converter (1,117 lines)

Full DOM→Lexical converter supporting 17+ custom node types: headings (with anchor IDs), paragraphs, lists (ordered, unordered, checklists), tables, links, images, footnotes (inline refs + block footnotes), callouts (note/warning/tip variants), internal EPUB links, code blocks, horizontal rules, inline formatting. Generates stable node IDs for dedup.

**Source:** `src/utils/epubPipeline.ts`, `src/utils/epubImport.ts`, `src/utils/epubLexical.ts`, `src/components/admin/EpubImporter.tsx`

---

## 2. Image Optimization Pipeline

On every Media upload, **8 image variants** are generated in parallel via Cloudflare R2's `/cdn-cgi/image/` transformation endpoint:

| Variant | Size | Format | Purpose |
|---------|------|--------|---------|
| Low-res placeholder | 20px wide, q=20, blur=10 | base64 WebP | LQIP for above-the-fold rendering |
| Optimized | 750px wide, q=75, fit=scale-down | WebP | Primary display |
| 6 responsive | 480, 640, 750, 828, 1080, 1200px wide | WebP | `srcset` for responsive images |

All 8 operations run in **parallel** via `Promise.allSettled`. On delete, all 7 R2 variants are cleaned up in a single `DeleteObjects` call. A backfill script (`pnpm backfill:lowres`) regenerates placeholders for existing media.

No local image processing — Cloudflare handles all transformations.

**Source:** `src/utils/lowres.ts`, `src/collections/Media.ts`

---

## 3. Auther Grant Mirror — Distributed Authorization Read Model

A sophisticated two-phase permission system where Auther is the source of truth and Payload maintains a local, query-optimized mirror.

### Write Path (Webhook-Driven)

`POST /api/webhooks/auther` receives signed webhooks from Auther:

| Event | Handler Behavior |
|-------|-----------------|
| `grant.created` | Out-of-order guard (revocation tombstone check). Resolves Payload user, upserts mirror row. If user unknown → enqueues **deferred grant** via QStash |
| `grant.revoked` | Revokes all active mirror rows for tupleId. Writes **revocation tombstone** for out-of-order guarding |
| `group.member.added` | Calls Auther `ListObjects` for authoritative grant set. Expands group to per-user mirror rows. Deferred queue for unknown users |
| `group.member.removed` | Two-pass: collect active rows → revoke removed. Fetches remaining grants from Auther. **Fail-closed** if Auther unreachable |

### Deferred Grant Queue

When grant events arrive before the target Payload user exists, a `DeferredGrants` record is created and a **QStash** job is published. QStash retries (3 times) until the user is created via the `usersAfterOperationHook` drain. Deferred grants expire after 7 days. Revocation tombstones prevent stale grants from being applied after revocation.

### Read Path

At read time, `GrantMirror` rows are queried locally. Conditioned/ABAC grants (`requiresLiveCheck: true`) are batched and sent to Auther's `POST /api/auth/check-permission/batch` with a **15-second in-memory cache** (SHA-256 keyed on session token hash + entity IDs + context). TTL configurable via `AUTHER_PERMISSION_CACHE_TTL_MS` (0 to disable).

### Reconciliation

`POST /api/internal/reconcile` performs a full sweep: scans Auther's grants, compares against GrantMirror, inserts missing rows, revokes stale rows, fixes `requiresLiveCheck` drift, bootstraps unknown users, and cleans expired tombstones.

**Source:** `src/utils/grantMirror.ts`, `src/utils/deferredGrants.ts`, `src/app/api/webhooks/auther/route.ts`, `src/app/api/internal/reconcile/route.ts`, `src/app/api/internal/queues/deferred-grants/route.ts`

---

## 4. Custom GraphQL Layer

### Custom Queries

| Query | Purpose |
|-------|---------|
| `SimilarPosts(postId, limit?)` | Scored recommendations: category match (+10), tag matches (+3 each), author match (+2) |
| `readingProgress(bookId)` | User's per-chapter reading progress |
| `bookmarks` | User's bookmarks (book + chapter) |
| `comments` | Public comments with depth-limited threading |
| `bookExportManifest(bookId)` | Book metadata + chapter index for EPUB export |
| `bookExportChunk(bookId, page, limit)` | Paginated chapters with Lexical content and media for export |

### Custom Mutations

| Mutation | Purpose |
|----------|---------|
| `unlockChapterPassword(chapterId, password)` | PBKDF2 verification → 60-min HMAC proof token |
| `saveReadingProgress(bookId, chapterId, progress)` | Upsert reading progress |
| `createBookmark(contentType, chapterId?, bookId?)` | Create bookmark with validation + dedup |
| `deleteBookmark(bookmarkId)` | Delete user bookmark |
| `createComment(...)` | Create pending comment with auth check, rate limiting (5/target/10min, 20/global/hour), depth limit |
| `updateComment(commentId, content)` | Edit within 5-hour window |
| `deleteComment(commentId)` | Soft-delete with author verification |
| `updateCommentStatus(commentId, status)` | Admin moderation (approve/reject) |
| `generateEpub(bookId)` | HMAC-signed download token (15-min expiry), returns URL |

**Source:** `src/graphql/`

---

## 5. Better Auth Integration

Payload's local authentication is **completely disabled** (`disableLocalStrategy: true`). All auth flows through Auther:

1. Login page intercepted → redirect to Auther's OAuth2 authorize endpoint
2. Callback exchanges code for tokens → `access_token` stored in cookies
3. Middleware injects cookie as `Authorization: Bearer` header
4. Custom auth strategy extracts token, verifies JWT via Auther's JWKS endpoint (`createRemoteJWKSet`)
5. Users upserted: lookup by `betterAuthUserId` → email → create. **Drains deferred grants** on first user creation or email-linking
6. User provisioning: `signUpBetterAuthUser()` creates Auther user with random password + signup secret

**Source:** `src/lib/betterAuth/`, `src/app/(payload)/auth/callback/route.ts`, `middleware.ts`

---

## 6. Chapter Password System

- Passwords hashed with **PBKDF2-SHA256** (120,000 iterations)
- **Proof tokens**: HMAC-signed with 60-min TTL, passed via `chapter-password-proof` cookie or `Authorization` header
- **Admin bypass**: Admins skip password verification
- **Version tracking**: `passwordVersion` auto-increments on change, invalidating old proofs

**Source:** `src/utils/chapterPasswords.ts`, `src/utils/chapterPasswordHooks.ts`

---

## 7. Comment System

Full CRUD with moderation workflow:

- **Rate limiting**: 5 comments per target per 10 minutes; 20 global per hour
- **Edit window**: 5 hours after creation
- **Threading**: Replies with depth limiting via `PUBLIC_COMMENT_DEPTH`
- **Soft-delete**: Deleted comments preserved with `deletedAt` timestamp
- **Moderation**: Admin approve/reject with `moderatedAt`/`moderatedBy` tracking
- **Composite indexes**: 12 compound indexes for efficient querying

**Source:** `src/utils/comments.ts`, `src/collections/Comments.ts`, `src/graphql/`

---

## Admin UI Highlights

- **EPUB Import Wizard** — Full-page browser-side importer with progress UI, cancel, retry
- **Better Auth Login Redirect** — Intercepts login; redirects to Auther
- **Books Grid View** — Custom card grid replacing default table
- **Media Grid View** — Responsive image grid with blur placeholders
- **Chapter Drawer** — View chapters from book detail without full navigation
- **Slug Generator** — Auto-generate + manual edit with validation
- **Draft Autosave** — 5-second autosave on all content collections
- **Status Toggle** — Draft/published accessible from document toolbar

---

## Content Collections

| Collection | Key Features |
|------------|-------------|
| **Users** | Auther SSO, auto-provisioning, admin/user roles |
| **Books** | Manual + EPUB import, resetable import lifecycle, private gating, Cloudflare cache tag purging |
| **Chapters** | Lexical rich text (17 custom features), password protection, per-book ordering, EPUB import dedup |
| **Posts** | Drafts + autosave, categories, tags, SEO plugin, YouTube embeds, code blocks |
| **Media** | 8-variant R2 image optimization, grid view, blur placeholder generation |
| **Categories** | Slug-based, immutable slugs, image thumbnails |
| **Comments** | Moderation workflow, threading, rate limiting, soft-delete |
| **ReadingProgress** | Per-user per-chapter tracking |
| **Bookmarks** | Per-user toggle for books and chapters |

---

## Environment Configuration

```bash
# Required
PAYLOAD_SECRET=your-long-random-secret

# Database (omit for local SQLite)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Object storage (omit for local filesystem)
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret
R2_PUBLIC_BASE_URL=https://cdn.example.com

# Auther — OAuth client
AUTH_BASE_URL=https://auth.example.com
PAYLOAD_CLIENT_ID=your-payload-client-id
PAYLOAD_CLIENT_SECRET=your-payload-client-secret

# Auther — JWT validation
BETTER_AUTH_JWT_ISSUER=https://auth.example.com
BETTER_AUTH_JWT_AUDIENCE=payload-content-api
PAYLOAD_RESOURCE_SERVER_AUDIENCE=payload-content-api
PAYLOAD_ACCEPT_CLIENT_AUDIENCES=false

# Auther — webhooks and internal API
AUTHER_API_KEY=your-auther-internal-api-key
AUTHER_WEBHOOK_SECRET=your-auther-webhook-secret

# Auther — blog client (for grant mirror cross-client awareness)
BLOG_CLIENT_ID=client_xxxxxxxxxxxxxxxxxxxx

# Deferred grant queue (QStash)
QSTASH_TOKEN=your-qstash-token
QSTASH_CURRENT_SIGNING_KEY=your-qstash-current-signing-key
QSTASH_NEXT_SIGNING_KEY=your-qstash-next-signing-key
QSTASH_URL=https://qstash.upstash.io
QUEUE_TARGET_BASE_URL=https://cms.example.com

# Permission check cache
AUTHER_PERMISSION_CACHE_TTL_MS=15000

# Cloudflare cache purge (optional)
CLOUDFLARE_CACHE_ZONE_ID=your-zone-id
CLOUDFLARE_CACHE_API_TOKEN=your-api-token
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Generate types + production build |
| `pnpm start` | Start production server |
| `pnpm ci` | Run migrations then build |
| `pnpm test:int` | Vitest integration tests (36+ files) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm lint` | ESLint |
| `pnpm promote:admin` | Promote a user to admin role |
| `pnpm backfill:lowres` | Regenerate low-res image placeholders |
| `pnpm payload migrate:create` | Create new migration |
| `pnpm payload migrate` | Apply pending migrations |
| `pnpm epub:probe` | Inspect EPUB file structure |

## File Map

```
src/
├── collections/                # Payload collections (11 collections)
│   ├── Users.ts                # Auther SSO, auto-provisioning
│   ├── Books.ts                # EPUB import lifecycle, private gating
│   ├── Chapters.ts             # 17 Lexical features, password protection
│   ├── Posts.ts                # Drafts, categories, tags, SEO
│   ├── Media.ts                # 8-variant R2 optimization
│   ├── Comments.ts             # Moderation, threading, rate limiting
│   ├── GrantMirror.ts          # Auther permission read model
│   ├── DeferredGrants.ts       # Out-of-order grant queue
│   ├── ReadingProgress.ts      # Per-user per-chapter tracking
│   ├── Bookmarks.ts            # Per-user bookmarks
│   └── Categories.ts           # Slug-based categorization
├── lib/
│   ├── betterAuth/             # Auther integration (strategy, tokens, env, PKCE)
│   └── cloudflareCache.ts      # Cache tag-based purge
├── utils/
│   ├── epubPipeline.ts         # 1,556-line browser-side EPUB import
│   ├── epubImport.ts           # HTML sanitizer, asset resolution, FNV-1a hashing
│   ├── epubLexical.ts          # 1,117-line HTML→Lexical converter
│   ├── grantMirror.ts          # Auther API clients, permission batch cache
│   ├── deferredGrants.ts       # QStash deferred grant queue
│   ├── chapterPasswords.ts     # PBKDF2-SHA256 password hashing + HMAC proofs
│   ├── comments.ts             # Comment validation + rate limiting
│   ├── access.ts               # Access control: GrantMirror queries, media resolution
│   ├── lowres.ts               # R2 image optimization URL generation
│   ├── lexicalToHtml.ts        # Lexical→HTML for EPUB download
│   └── ...                     # Books hooks, reading features, cookies, etc.
├── components/admin/           # Custom admin components
│   ├── EpubImporter.tsx        # Full-page browser EPUB importer
│   ├── BetterAuthLoginRedirect.tsx
│   └── ...                     # Book list view, media grid, slug field, etc.
├── graphql/                    # Custom queries + mutations
├── features/                   # 5 custom Lexical features (headings, links, etc.)
├── app/                        # Route handlers
│   ├── (payload)/auth/         # OAuth2 callback + logout
│   ├── api/webhooks/auther/    # Auther webhook receiver
│   ├── api/internal/           # Reconciliation + deferred grant worker
│   └── api/books/[id]/access/  # Book grant management
├── migrations/                 # 29 migration files
└── payload.config.ts           # Main PayloadCMS configuration
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19, TypeScript 5.7) |
| CMS | PayloadCMS 3.60 |
| Database | Turso (libSQL) → local SQLite fallback |
| Object Storage | Cloudflare R2 (S3-compatible API + `/cdn-cgi/image/` transforms) |
| Rich Text | `@payloadcms/richtext-lexical` + 5 custom features |
| Auth | Auther (OAuth2 PKCE + JWKS validation) |
| Queue | QStash (Upstash) — deferred grants, relayed webhooks |
| Image Transform | Cloudflare `/cdn-cgi/image/` (no local processing) |
| Testing | Vitest (36+ int tests) + Playwright (E2E) |
| Container | Docker + Docker Compose + MinIO (local S3) |

## Docker Setup

```bash
docker-compose up       # MinIO (local S3) included
# MinIO console: http://localhost:9001 (minioadmin / minioadmin)
```

For local Turso without cloud: `docker-compose -f docker-compose.turso.yml up`.

## Deployment

1. Set all environment variables on your platform
2. Run pending migrations: `pnpm payload migrate`
3. Build: `pnpm ci` (migrates + builds)
4. Start: `pnpm start`

EPUB processing is **fully browser-side** — fits within Vercel free-tier function limits. Turso and R2 credentials required in production.
