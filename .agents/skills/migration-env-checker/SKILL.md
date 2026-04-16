---
name: migration-env-checker
description: Decide whether a schema change needs a migration and whether environment variables or build-mode fallbacks matter. Use when adding, removing, or renaming collection fields, changing field types, adding env vars, changing src/lib/env.ts, or asked "do I need a migration?"
---

# Migration Env Checker

Use this skill for schema and environment-sensitive changes.

## When a migration IS required

- Adding a non-optional field to an existing collection.
- Removing or renaming a field that has existing data.
- Changing a field type (e.g., `text` → `number`).
- Adding/removing a relationship field.
- Changing a unique or index constraint.

## When a migration is NOT required

- Adding an optional field with no data constraint.
- Adding a new collection (table is created fresh).
- Changing admin UI only (`label`, `admin.description`, `defaultColumns`).
- Adding a `beforeValidate` or `afterChange` hook that doesn't alter shape.

## Migration commands

```bash
# Create migration (connect to Turso for accuracy)
PAYLOAD_SECRET=x TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm payload migrate:create

# Run pending migrations before deployment
pnpm payload migrate

# Check pending status
pnpm payload migrate:status
```

Commit both the `.ts` and `.json` files from `src/migrations/`.

## Dev vs. production behavior

| Context | Behavior |
|---------|----------|
| `NODE_ENV !== 'production'` | `push: true` in sqliteAdapter — schema auto-syncs, no migration needed |
| Production (Turso) | Manual migrations required via `pnpm payload migrate` |
| `next build` (`isNextBuild` flag) | Validation is relaxed; env vars are not required |

Never run `pnpm payload migrate` during a Next.js build step.

## Environment variable rules

- All env vars are declared and validated via Zod in `src/lib/env.ts`.
- R2/Turso vars: `strict: false` in dev (graceful degradation), `strict: true` in production.
- New env vars must be added to both `src/lib/env.ts` (Zod schema) and `.env.example`.
- The `isNextBuild` flag in `src/payload.config.ts` bypasses validation during builds.

## Check

- Does the field change alter the database shape? If yes, a migration is required.
- Is the new env var added to `src/lib/env.ts` with proper Zod validation?
- Is `.env.example` updated?
- Are both `.ts` and `.json` migration files committed together?
- Does the migration run cleanly against a local SQLite copy before targeting Turso?

## Output rule

Deliver a three-line verdict: migration required (yes/no/optional), env update required (yes/no), build-mode exception applies (yes/no).
Then list the files that must change together.

## Supporting files

- [template.md](template.md) for a migration decision skeleton.
- [examples/sample.md](examples/sample.md) for the expected verdict format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.