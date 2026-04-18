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

## Generating a new migration — correct process

Payload's `migrate:create` diffs the **current Payload schema** against the **last snapshot JSON** (`src/migrations/<latest>.json`). If that snapshot is stale (e.g. hand-written migrations added tables/columns that were never reflected back into the JSON), the diff will re-emit already-applied DDL. The correct process is:

### 1. Boot local Turso and apply all existing migrations

```bash
docker compose -f ./docker-compose.turso.yml up -d
PAYLOAD_SECRET=x \
  TURSO_DATABASE_URL=http://127.0.0.1:8080 \
  TURSO_AUTH_TOKEN=none \
  R2_BUCKET_NAME=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x \
  R2_ENDPOINT=https://x.r2.cloudflarestorage.com \
  pnpm payload migrate
```

Verify all migrations are `Ran: Yes` with `pnpm payload migrate:status` (same env prefix).

> **Why dummy R2 vars?** `src/payload.config.ts` always builds the R2 adapter at startup; it will throw if those vars are missing even during migrate commands.

### 2. Check whether the latest snapshot JSON is stale

If any hand-written `*_000001_*` / `*_000002_*` style migrations exist **without a corresponding snapshot update**, the snapshot is stale. Inspect:

```bash
python3 -c "
import json
with open('src/migrations/<latest>.json') as f: d = json.load(f)
print(list(d['tables'].keys()))
"
```

Compare that table list against the actual DDL in the hand-written `.ts` files. Any table or column that a hand-written migration created but the snapshot doesn't list must be patched in.

### 3. Patch the snapshot JSON if stale

Use Python to add the missing entries directly into the latest `.json` file **before** running `migrate:create`. The format mirrors every other entry in the file:

```python
# Example: add a missing array-table
data['tables']['books_import_failure_log'] = {
    "name": "books_import_failure_log",
    "columns": { ... },     # match the exact column names/types from the migration .ts
    "indexes": { ... },
    "foreignKeys": { ... },
    "compositePrimaryKeys": {},
    "uniqueConstraints": {},
    "checkConstraints": {}
}
# Example: add a missing column to an existing table
data['tables']['chapters']['columns']['chapter_word_count'] = {
    "name": "chapter_word_count", "type": "numeric",
    "primaryKey": False, "notNull": False, "autoincrement": False
}
```

Write it back with `json.dump(data, f, indent=2)`.

### 4. Run `migrate:create` against local Turso

```bash
PAYLOAD_SECRET=x \
  TURSO_DATABASE_URL=http://127.0.0.1:8080 \
  TURSO_AUTH_TOKEN=none \
  R2_BUCKET_NAME=x R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x \
  R2_ENDPOINT=https://x.r2.cloudflarestorage.com \
  pnpm payload migrate:create --name <descriptive_name>
```

Inspect the generated `.ts` file. It must **only** contain DDL for the new schema you actually added — no re-creation of tables/columns that already exist in the DB. If it does contain spurious re-creates, the snapshot patch in step 3 is incomplete.

### 5. Apply and verify

```bash
# same env prefix
pnpm payload migrate
pnpm payload migrate:status   # all rows Ran: Yes
```

Then stop Turso:

```bash
docker compose -f ./docker-compose.turso.yml down
```

### 6. Commit the right files

Always commit these four together:

| File | Reason |
|------|--------|
| `src/migrations/<timestamp>.ts` | New migration logic |
| `src/migrations/<timestamp>.json` | New snapshot (generated automatically) |
| `src/migrations/<previous_latest>.json` | Patched snapshot (if stale) |
| `src/migrations/index.ts` | Auto-updated by `migrate:create` |

### Quick reference — env vars required locally

```bash
PAYLOAD_SECRET=x
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=none
R2_BUCKET_NAME=x
R2_ACCESS_KEY_ID=x
R2_SECRET_ACCESS_KEY=x
R2_ENDPOINT=https://x.r2.cloudflarestorage.com
```

### Check pending status / run in production

```bash
# Check pending
pnpm payload migrate:status

# Run pending migrations before deployment (production Turso)
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... pnpm payload migrate
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
- Are all four files committed together: new `.ts`, new `.json`, patched previous `.json` (if stale), updated `index.ts`?
- Does the generated migration only contain DDL for the *new* schema — no re-creation of tables that already exist in the DB?
- Did you apply and verify against local Turso before targeting production?
- Is the latest snapshot JSON stale? (Hand-written `_000001_` / `_000002_` migrations not reflected in the JSON = stale. Patch it before running `migrate:create`.)

## Output rule

Deliver a three-line verdict: migration required (yes/no/optional), env update required (yes/no), build-mode exception applies (yes/no).
Then list the files that must change together.

## Supporting files

- [template.md](template.md) for a migration decision skeleton.
- [examples/sample.md](examples/sample.md) for the expected verdict format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.