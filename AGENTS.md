# PayloadCMS Project: AI Agent Instructions

# Important

- This payloadcms is using auth service using better-auth here https://github.com/quanghuy1242/auther
- The blog site consumes data from this CMS project here https://github.com/quanghuy1242/next-blog 
- When planning something across domain, use github mcp or tools to check needed or suggest recommendations for 2 others.

## Tech Stack

- **PayloadCMS 3.60 + Next.js 15** headless CMS
- **Database**: Turso (libSQL) in production → `.payload/data.sqlite` in dev
- **Storage**: Cloudflare R2 in production → local filesystem in dev
- **SEO**: `src/lib/postsSeo.ts` | **GraphQL**: playground enabled

Fallback logic lives in `src/lib/turso.ts` and `src/lib/r2Bucket.ts`. Missing env vars degrade gracefully in dev; `strict: true` throws in production. The `isNextBuild` flag in `src/payload.config.ts` relaxes env validation during `next build`.

## Hard Rules

1. **Never remove `// @ts-ignore` comments.** They guard Payload 3.x plugin type gaps — removing them breaks the build.
2. **Never manually edit generated files.** Regenerate them with commands below. Generated: `src/payload-types.ts`, `src/app/(payload)/admin/importMap.js`, `src/app/(payload)/layout.tsx`.
3. **Centralize all shared logic in `src/utils/`.** Before adding validation, parsing, access, or fetch logic, check if a utility already exists. Load the `utility-extraction-adviser` skill.
4. **Always use the Context7 MCP** for library docs, config steps, and API references. Never guess at library-specific details from training data.

## Repo Layout

```
src/
  collections/       Thin Payload collection configs — hooks + access delegated to utils
  utils/             All shared logic: access, slugs, strings, numbers, http, epub pipeline
  features/          Custom Lexical nodes (server + client split per feature)
  components/admin/  Browser-only React admin UI
  lib/               Turso, R2, env (Zod), SEO — external service adapters
  graphql/           Custom queries + mutations, one subdirectory per query/mutation
  globals/           Payload globals
  migrations/        Schema migrations — always commit both .ts and .json
src/app/
  (payload)/         Payload admin route group — do not add custom frontend routes here
```

## Key Commands

```bash
pnpm tsc --noEmit                 # Type-check
pnpm test:int                     # Vitest integration tests
pnpm test:e2e                     # Playwright E2E tests
pnpm generate:types               # Regenerate src/payload-types.ts after schema change
pnpm generate:importmap           # Regenerate admin import map
pnpm payload migrate:create       # Create migration (set TURSO_* env vars for accuracy)
pnpm payload migrate              # Run pending migrations before deployment
pnpm payload migrate:status       # Check pending migrations
pnpm promote:admin --email X      # Promote a user to admin (writes directly to SQLite)
```

## Skills

**Always review list of available skills to see if there is one that you can utilize for any given input, or in the middle of the loop, read additional skills if that benefits your work.** Skills contain the detailed checklists, patterns, and failure modes — this file only lists when to reach for each one.

| Skill | Load when... |
|-------|-------------|
| `access-control-checker` | Changing collections, globals, or auth behavior; adding sensitive fields; wiring hooks that touch `req.user`; asking "who can see or edit this?" |
| `admin-ui-orchestration-reviewer` | Editing `src/components/admin/`; adding multi-step wizards or import flows; wiring fetch calls in components; a UI is stuck or leaking state |
| `architecture-scout` | Planning a feature that touches multiple files; unsure which layer owns the logic; suspecting duplicate code; asking "where should I put this?" |
| `book-chapter-flow-reviewer` | Editing `Books.ts`, `Chapters.ts`, or `utils/books.ts`; import status transitions; chapter ordering; book admin list; book sync or import lifecycle |
| `browser-server-boundary-guard` | Code could run in both browser and server; Lexical feature server/client splits; EPUB import logic; "window is not defined" errors |
| `collection-contract-reviewer` | Adding or changing collection fields, hooks, or access properties; adding a new collection; asking "is this collection correct?" |
| `epub-import-specialist` | Changing anything releated to books; debugging broken chapter content after an import |
| `graphql-query-scaffold` | Adding custom GraphQL queries or mutations; changing resolver logic; registering new types; asking "how do I expose this via GraphQL?" |
| `lexical-node-scaffold` | Adding a new rich text node, Lexical plugin, or toolbar button; asking "how do I add a custom block to the editor?" |
| `migration-env-checker` | Adding, removing, or renaming collection fields; changing field types; adding env vars; changing `src/lib/env.ts`; asking "do I need a migration?" |
| `test-strategy-chooser` | Finishing a feature; adding utilities; changing access rules; asking "what tests should I write?" or "how do I test this?" |
| `utility-extraction-adviser` | Logic is duplicated across files; inline fetch bypasses `requestJSON`; validation duplicates an existing util; asking "where should this helper live?" |
| `verification-gate` | Before declaring any task done — whenever code, schema, access rules, admin UI, or migrations changed |
