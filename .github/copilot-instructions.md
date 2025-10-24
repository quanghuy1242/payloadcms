# PayloadCMS Project: AI Agent Instructions

## Architecture Overview

This is a **PayloadCMS 3.60 + Next.js 15** headless CMS with a **pluggable storage architecture** that adapts between cloud and local development:

- **Database**: Turso (libSQL) in production → local SQLite fallback (`.payload/data.sqlite`) in dev
- **Storage**: Cloudflare R2 in production → local filesystem fallback in dev
- **SEO**: Plugin-based with custom generators in `src/lib/postsSeo.ts`
- **GraphQL**: Standard Payload GraphQL API with playground enabled

**Critical**: The `src/lib/turso.ts` and `src/lib/r2Bucket.ts` modules handle fallback logic. Missing env vars trigger graceful degradation, NOT errors (except in production runtime).

## Centralized Utilities Philosophy

**Never scatter utility logic—centralize in `src/utils/`**. This project follows an agentic workflow where all cross-cutting helpers live in one place:

| Module | Purpose | Example Usage |
|--------|---------|---------------|
| `utils/access.ts` | Role-based access control & ownership checks | Collections use `authenticatedAccess`, `ownerAccess('author')`, `postsReadAccess` |
| `utils/ownership.ts` | Auto-assign relationship owners via hooks | `enforceOwnershipHook('author')` in Posts |
| `utils/slug.ts` | Immutable slug generation with random suffixes | `createRandomizedSlugHook('title')` prevents collisions |
| `utils/strings.ts` | Safe string conversions | `toNullableString()`, `isNonEmptyString()` |
| `utils/numbers.ts` | Numeric safety net (`isFiniteNumber`, `clampNumber`, `sanitizeDimension`, `sanitizeQuality`). | Media sanitization, storage configuration. |
| `utils/identifiers.ts` | ID normalization across types | Shared API handlers use this for type-safe ID handling |

**Before adding any validation, parsing, or access logic**: Check if a utility exists. If it doesn't, extend `src/utils/` instead of inlining code. See the Agentic Utilities Blueprint below for the full philosophy.

## Agentic Utilities Blueprint

Our agentic coding workflow relies on a consistent, reusable utilities layer so every role—planner, architect, implementer, reviewer, integrator, operator—can share the same primitives instead of scattering ad-hoc helpers across the codebase. This blueprint is the single source of truth for how we build, extend, and consume utilities.

### Guiding Principles

- **Centralize once, reuse everywhere.** All cross-cutting helpers (strings, numbers, access policies, sanitizers) live in `src/utils`. Feature folders should import from this hub rather than invent local copies.
- **Future-proof by design.** Utilities must be side-effect free, type-safe, and defensive against malformed input so new surfaces can depend on them without surprises.
- **Small, composable modules.** Keep utilities focused (e.g., `strings`, `numbers`, `identifiers`). Compose them in higher-level helpers instead of bloating single files.
- **Document intent through names.** Functions should read like instructions (`sanitizeIdentifiers`, `toNullableString`, `clampNumber`) so other agents immediately understand behavior.
- **Tests before trust.** Whenever practical, add unit coverage that demonstrates the contract. Utilities are the foundation—bugs here cascade everywhere.
- **Prefer extension over duplication.** If an edge case isn’t covered, extend the existing helper or create a nearby sibling module instead of writing new inline logic.

### Current Utility Surface

| Module | Responsibilities | Primary Consumers |
| --- | --- | --- |
| `src/utils/strings.ts` | Whitespace-safe conversion helpers (`toNullableString`, `isNonEmptyString`). | SEO generators, slug helpers, GraphQL resolvers. |
| `src/utils/numbers.ts` | Numeric safety net (`isFiniteNumber`, `clampNumber`, `sanitizeDimension`, `sanitizeQuality`). | Media sanitization, storage configuration. |
| `src/utils/identifiers.ts` | Deduplicates arbitrary IDs into canonical strings. | Collection-level lookups, seeds, migrations. |
| `src/utils/slug.ts` | Immutable slug formatting with Vietnamese transliteration support (using `slugify` package) plus randomized variants for collision-free posts. | Collections that need stable identifiers (Posts, Categories). |
| `src/utils/access.ts` | Role-aware access primitives (`authenticatedAccess`, `ownerAccess`, `adminOrSelfAccess`, `adminOrSelfFieldAccess`, `postsReadAccess`, `publishedMediaReadAccess`, `adminOrEmailContains`) plus shared-media handling. | Collections, globals, field-level guards, ownership hooks. |
| `src/utils/ownership.ts` | Hooks that enforce relationship ownership (e.g., auto-assigning `author`, `owner`, `createdBy`). | Collections needing per-user ownership guarantees. |

These files replaced the legacy `src/collections/utils` folder so future helpers are available outside collection contexts.

### Adding a New Utility

1. **Check first.** Search `src/utils` for similar logic. If it exists, extend it.
2. **Design the contract.** Write a short docstring or comment describing inputs/outputs and failure behavior.
3. **Keep dependencies shallow.** Utilities should only depend on other utilities or standard library features—never on framework-specific modules.
4. **Name intentionally.** Use verbs like `sanitize`, `resolve`, `format`, `assert` that reflect purpose.
5. **Document usage.** Update this blueprint with the new module and its consumers so other agents discover it.
6. **Add tests if behavior is non-trivial.** Prefer Vitest unit tests under `tests/utils`.

### Consuming Utilities in New Code

- **Planner:** When breaking down a task, identify which utilities will be reused and note any needed extensions.
- **Architect:** Ensure new features integrate via existing helpers instead of redefining validation, parsing, or access rules.
- **Implementer:** Import from the relevant utility module; do not inline string/number sanitization, slug logic, or access control (use helpers like `adminOrSelfFieldAccess`).
- **Reviewer:** Reject patches that duplicate functionality or bypass existing helpers without justification.
- **Integrator:** When wiring configuration or storage backends, lean on shared utilities so environment parsing and error handling stay consistent.
- **Operator:** Feed runtime learnings (unexpected inputs, edge cases) back into utilities to strengthen the shared foundation.

### Example Workflow

1. **Gather requirements.** Planner highlights the need for normalizing API payload IDs.
2. **Audit existing utilities.** Architect confirms `sanitizeIdentifiers` fits but needs array-like support.
3. **Extend utility.** Implementer updates `src/utils/identifiers.ts` with tests that cover new scenarios.
4. **Integrate feature.** Implementer imports the helper into the service instead of writing new normalization code.
5. **Review and ship.** Reviewer verifies adherence to these guidelines; Integrator ensures deployment aligns with shared logic.

By treating `src/utils` as the canonical toolbox, we keep agent-produced code predictable, maintainable, and ready for future extensions. Every new helper should make the next agent’s job easier. Never scatter utility logic—centralize, document, and reuse.

Don't fix any code with comment `// @ts-ignore`.

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

## Environment Configuration

**Strict vs. Lenient Mode**:
- `createR2BucketFromEnv({ strict: false })` in dev → returns `null` on missing vars
- `strict: true` in production → throws errors

The config file uses `isNextBuild` to relax validation during `next build` (when services aren't needed).

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

## GraphQL Extensions

**Always follow PayloadCMS best practices for GraphQL organization**. See `docs/graphql-best-practices.md` for full details.

### Directory Structure
```
src/graphql/
├── index.ts              # Main export
├── queries/
│   ├── index.ts          # Query aggregator
│   └── [QueryName]/
│       ├── index.ts      # Query definition
│       └── resolver.ts   # Resolver logic
└── mutations/
    ├── index.ts          # Mutation aggregator
    └── [MutationName]/
        ├── index.ts      # Mutation definition
        └── resolver.ts   # Resolver logic
```

### Critical Rules
1. **Never inline GraphQL logic in `payload.config.ts`** - Extract to `src/graphql/`
2. **Separate concerns** - Keep resolver logic separate from query/mutation definitions
3. **Use the structure** - Each query/mutation gets its own directory with `index.ts` + `resolver.ts`
4. **Reference existing types** - Use `payload.collections['posts'].graphQL?.type` instead of recreating types
5. **Access payload correctly** - Always extract from context: `const payload: Payload = context.req.payload`

### Example Pattern
```typescript
// src/graphql/queries/MyQuery/resolver.ts
export const myQueryResolver = async (_: any, args: Args, context: any) => {
  const payload: Payload = context.req.payload
  // Logic here
}

// src/graphql/queries/MyQuery/index.ts
export const MyQuery = (GraphQL: any, payload: any): GraphQLFieldConfig => ({
  type: /* ... */,
  args: /* ... */,
  resolve: myQueryResolver,
})

// src/graphql/queries/index.ts
export const queries = (GraphQL, payload) => ({
  MyQuery: MyQuery(GraphQL, payload),
})
```

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
4. **GraphQL extensions**: Follow the structured approach in `src/graphql/` - see `docs/graphql-best-practices.md`
5. **Environment vars**: Add to `.env.example` and validate via Zod in `src/lib/env.ts`

## Reference Files for Patterns

- **Collection structure**: `src/collections/Posts.ts`
- **Complex access logic**: `src/utils/access.ts` (see `publishedMediaReadAccess`)
- **Environment parsing**: `src/lib/env.ts` (Zod schemas with transforms)
- **Hook composition**: `src/utils/slug.ts` and `src/utils/ownership.ts`
- **Migration structure**: Any file in `src/migrations/`
- **Storage abstraction**: `src/lib/r2Bucket.ts` (S3 SDK → R2 bucket interface)
- **GraphQL extensions**: `src/graphql/queries/SimilarPosts/` (query + resolver pattern)

## Context7 Usage

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.
