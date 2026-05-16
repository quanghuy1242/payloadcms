## Why these patches exist

This repository supports three production build targets side by side:

- `pnpm build` for the standard Next.js / Vercel-target build
- `pnpm build:opennext` for OpenNext on Cloudflare Workers
- `pnpm build:vinext` for Vinext on Cloudflare Workers

After upgrading to Payload `3.84.1` and Next `16`, the plain Next and Vinext builds worked, but OpenNext with Turbopack failed because Payload's SQLite adapter pulled Drizzle migration helpers into the production server bundle.

The concrete failure mode was:

- `@payloadcms/db-sqlite` imported `pushDevSchema` eagerly
- `@payloadcms/db-sqlite` exposed `requireDrizzleKit` eagerly
- `@payloadcms/drizzle` referenced `drizzle-kit/api` directly
- Turbopack traced those dev-only paths into the server chunk graph
- OpenNext then failed while rebundling the Turbopack server output for Cloudflare

These patches keep the behavior the app needs, but move the Drizzle-kit loading behind runtime-only branches so production server bundling does not pull those modules into the deployed graph.

## Where the patches are applied

PNPM applies these patches automatically during `pnpm install` via `package.json`:

```json
"pnpm": {
  "patchedDependencies": {
    "@payloadcms/db-sqlite@3.84.1": "patches/@payloadcms__db-sqlite@3.84.1.patch",
    "@payloadcms/drizzle@3.84.1": "patches/@payloadcms__drizzle@3.84.1.patch"
  }
}
```

That means:

- fresh installs apply them automatically
- CI applies them automatically as part of dependency installation
- if Payload versions change, these patch entries and patch files likely need review

## What each patch does

### `@payloadcms__db-sqlite@3.84.1.patch`

- defers `pushDevSchema` until the guarded non-production path actually runs
- defers `requireDrizzleKit` until a migration-related code path actually calls it

### `@payloadcms__drizzle@3.84.1.patch`

- stops re-exporting a top-level `requireDrizzleKit` implementation that hard-references `drizzle-kit/api`
- resolves the Drizzle-kit module id lazily at runtime instead

## When to remove them

Remove these patches only after verifying that upstream Payload no longer leaks Drizzle migration helpers into the Turbopack production server graph and all three commands still pass:

- `pnpm build`
- `pnpm build:opennext`
- `pnpm build:vinext`
- `pnpm deploy:opennext:dry-run`
- `pnpm deploy:vinext:dry-run`
