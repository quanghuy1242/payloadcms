# PayloadCMS Project: AI Agent Instructions

## Architecture Overview

This is a **PayloadCMS 3.60 + Next.js 15** headless CMS with a **pluggable storage architecture** that adapts between cloud and local development:

- **Database**: Turso (libSQL) in production → local SQLite fallback (`.payload/data.sqlite`) in dev
- **Storage**: Cloudflare R2 in production → local filesystem fallback in dev
- **Image Transforms**: Cloudflare Images for dynamic resizing with custom GraphQL queries
- **SEO**: Plugin-based with custom generators in `src/lib/postsSeo.ts`
- **GraphQL**: Extended API with custom queries in `src/graphql/queries/`

**Critical**: The `src/lib/turso.ts` and `src/lib/r2Bucket.ts` modules handle fallback logic. Missing env vars trigger graceful degradation, NOT errors (except in production runtime).

## Centralized Utilities Philosophy

**Never scatter utility logic—centralize in `src/utils/`**. This project follows an agentic workflow where all cross-cutting helpers live in one place:

| Module | Purpose | Example Usage |
|--------|---------|---------------|
| `utils/access.ts` | Role-based access control & ownership checks | Collections use `authenticatedAccess`, `ownerAccess('author')`, `postsReadAccess` |
| `utils/ownership.ts` | Auto-assign relationship owners via hooks | `enforceOwnershipHook('author')` in Posts |
| `utils/slug.ts` | Immutable slug generation with random suffixes | `createRandomizedSlugHook('title')` prevents collisions |
| `utils/strings.ts` | Safe string conversions | `toNullableString()`, `isNonEmptyString()` |
| `utils/numbers.ts` | Numeric sanitization | `sanitizeDimension()`, `sanitizeQuality()`, `clampNumber()` |
| `utils/identifiers.ts` | ID normalization across types | GraphQL resolvers use this for type-safe ID handling |

**Before adding any validation, parsing, or access logic**: Check if a utility exists. If it doesn't, extend `src/utils/` instead of inlining code. See `docs/agentic-ai.md` for the full philosophy.

## Collection Patterns

### Access Control Flow
Collections follow this hierarchy:
1. **Admin users** (`role: 'admin'`) bypass all restrictions
2. **Authenticated users** can create/read their own content
3. **Public access** limited to published content via status checks

Example from `Posts`:
```typescript
access: {
  create: authenticatedAccess,
  read: postsReadAccess, // Published posts OR own drafts
  update: ownerAccess('author'),
  delete: ownerAccess('author'),
}
```

### Slug & Ownership Hooks
All content collections use **two critical hooks** in `beforeValidate`:
```typescript
hooks: {
  beforeValidate: [
    enforceOwnershipHook('author'), // Auto-assign current user
    createRandomizedSlugHook('title'), // Generate collision-free slug
  ],
}
```

Slugs are **immutable after creation** via `validateImmutableSlug` validator.

### Media Access Pattern
`Media` collection uses `publishedMediaReadAccess` which:
1. Checks if media is referenced by published posts/categories
2. Falls back to owner-only access for unpublished media
3. Uses complex OR queries checking `coverImage`, `meta.image`, and rich text content

## Database & Migrations

### Schema Sync Behavior
- **Development** (`NODE_ENV !== 'production'`): Auto-syncs via `push: true` in `sqliteAdapter`
- **Production**: Requires manual migrations via `pnpm payload migrate:create`

Migration files in `src/migrations/` contain **both `.ts` and `.json`** (commit both!).

### Migration Commands
```bash
# Create migration (with Turso connection for accuracy)
PAYLOAD_SECRET=x TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm payload migrate:create

# Run pending migrations (pre-deployment)
pnpm payload migrate

# Check status
pnpm payload migrate:status
```

**Never run migrations during Next.js build** (`isNextBuild` flag prevents this in `src/payload.config.ts`).

## GraphQL Extensions

Custom queries live in `src/graphql/queries/` and are wired via `createQueriesExtension()` in config.

Example pattern (see `postsCoverImageTransforms/`):
```typescript
export const createPostsCoverImageTransformsQuery = (GraphQL, defaults) => ({
  queries: {
    PostsCoverImageTransforms: {
      type: new GraphQL.GraphQLObjectType({ /* ... */ }),
      resolve: customResolver,
    },
  },
})
```

These extend the auto-generated PayloadCMS GraphQL schema with custom business logic (like Cloudflare image transforms).

## Environment Configuration

**Strict vs. Lenient Mode**:
- `createR2BucketFromEnv({ strict: false })` in dev → returns `null` on missing vars
- `strict: true` in production → throws errors

The config file uses `isNextBuild` to relax validation during `next build` (when services aren't needed).

### Cloudflare Images Integration
`src/lib/cloudflareImages.ts` builds URLs like:
```
https://account.cloudflareimages.com/cdn-cgi/image/w=800,h=600,fit=cover,format=webp/bucket/path/filename.jpg
```

Uses `sanitizeDimension()` and `sanitizeQuality()` from `utils/numbers.ts` to validate transform params.

## Critical Workflows

### Testing Strategy
```bash
pnpm test:int  # Vitest for API integration tests
pnpm test:e2e  # Playwright for frontend E2E tests
```

Integration tests use `getPayload()` with config to test collections directly (see `tests/int/api.int.spec.ts`).

### User Promotion Script
`scripts/promote-user.ts` bypasses Payload API and writes directly to SQLite:
```bash
pnpm promote:admin --email user@example.com
```

Uses `resolveTursoConnection()` to handle both local and remote databases.

### Docker Development
- `docker-compose.yml` provides MinIO (S3-compatible) and optional libSQL server
- MinIO credentials: `minioadmin` / `minioadmin` on port 9000/9001
- Update `.env` to point R2 vars at `http://minio:9000` for local testing

## Type Safety Conventions

### Known `@ts-ignore` Comments
**Do NOT remove these** (see `docs/agentic-ai.md`):
1. `payload.config.ts` lines with `// @ts-ignore` for plugin types (Payload 3.x compatibility)
2. `access.ts` for complex query builder types that PayloadCMS doesn't expose

### Generated Files
- `src/app/(payload)/layout.tsx` - Auto-generated, has warning header
- `src/payload-types.ts` - Regenerate via `pnpm generate:types`
- `src/app/(payload)/admin/importMap.js` - Auto-generated import map

**Never edit these manually**. Use `pnpm generate:types` or `pnpm generate:importmap`.

## Next.js Routing Structure

```
src/app/
├── (payload)/          # Payload admin routes (route group)
│   ├── admin/[[...segments]]/  # Dynamic admin panel
│   ├── api/            # Auto-generated API routes
│   └── custom.scss     # Admin UI customizations
└── my-route/           # Custom Next.js routes outside Payload
```

The `(payload)` route group keeps admin separate from frontend routes.

## Common Gotchas

1. **Don't use `push: true` with production Turso** - Set `TURSO_DATABASE_URL` and let `resolveTursoConnection()` handle it
2. **Media access is async** - `publishedMediaReadAccess` queries posts/categories, so it's slower than other access checks
3. **Slug collisions** - Use `createRandomizedSlugHook()` for user-generated content (not `createSlugHook()`)
4. **R2 multipart uploads** - The `r2Bucket.ts` adapter handles this via `resumeMultipartUpload()`
5. **Environment in tests** - Load `.env` via `vitest.setup.ts` using `dotenv/config`

## When Adding Features

1. **Access control**: Use existing utilities from `utils/access.ts` (admin check → owner check → public fallback)
2. **Field validation**: Check `utils/` for sanitizers/validators before writing custom logic
3. **Hooks**: Follow the `beforeValidate` → ownership → slug pattern from existing collections
4. **GraphQL**: Extend via `src/graphql/queries/` directory with custom resolvers
5. **Environment vars**: Add to `.env.example` and validate via Zod in `src/lib/env.ts`

## Reference Files for Patterns

- **Collection structure**: `src/collections/Posts.ts`
- **Complex access logic**: `src/utils/access.ts` (see `publishedMediaReadAccess`)
- **Environment parsing**: `src/lib/env.ts` (Zod schemas with transforms)
- **Hook composition**: `src/utils/slug.ts` and `src/utils/ownership.ts`
- **Migration structure**: Any file in `src/migrations/`
- **Storage abstraction**: `src/lib/r2Bucket.ts` (S3 SDK → R2 bucket interface)

## Context7 Usage

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.
