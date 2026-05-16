# Vinext Cloudflare Workers Deployment Guide

> Status: Draft, dry-run verified
> Date: 2026-05-16
> Scope: Deploy this PayloadCMS 3.60 / Next.js 15 project to Cloudflare Workers through vinext without replacing the existing Next/Vercel workflow.

## Table Of Contents

- [Goal](#goal)
- [Current State](#current-state)
- [What Can Run Alongside Existing Deployment](#what-can-run-alongside-existing-deployment)
- [Required Compatibility Shim](#required-compatibility-shim)
- [Cloudflare Configuration](#cloudflare-configuration)
- [Environment Variables And Bindings](#environment-variables-and-bindings)
- [Build And Dry Run](#build-and-dry-run)
- [Actual Deploy Command](#actual-deploy-command)
- [Known Risks](#known-risks)
- [Verification Checklist](#verification-checklist)
- [Rollback](#rollback)
- [Definition Of Done](#definition-of-done)

## Goal

Build and optionally deploy the CMS to Cloudflare Workers using vinext while preserving the existing Next.js scripts and Vercel-compatible path.

This guide intentionally does not perform a real deploy. It documents the commands and checks needed before a human runs the final Cloudflare deployment.

## Current State

The repository now has a side-by-side vinext migration:

- `package.json` keeps the existing `dev`, `build`, and `start` scripts on Next.js.
- `package.json` adds vinext scripts: `dev:vinext`, `build:vinext`, `start:vinext`, `deploy:vinext`, and `deploy:vinext:dry-run`.
- `vite.config.ts` configures `vinext()` and `@cloudflare/vite-plugin`.
- `wrangler.jsonc` configures the Cloudflare Worker name, compatibility date, Node compatibility, and static asset handling.
- `src/vinext/payload-ui-rsc-shim.js` works around a Payload 3.60 / Rolldown export-analysis incompatibility.

Latest verified dry run:

```text
Total Upload: 17767.88 KiB / gzip: 4411.57 KiB
```

This dry run did not deploy anything.

## What Can Run Alongside Existing Deployment

Yes, this can live alongside the current Vercel/Next deployment because the original scripts remain unchanged:

```bash
pnpm dev
pnpm build
pnpm start
```

The Cloudflare/vinext path uses separate scripts:

```bash
pnpm dev:vinext
pnpm build:vinext
pnpm start:vinext
pnpm deploy:vinext:dry-run
pnpm deploy:vinext
```

The generated `dist/` output is ignored by git. Running vinext builds should not affect the checked-in Next.js build output.

## Required Compatibility Shim

The normal vinext build fails against Payload 3.60 with:

```text
[MISSING_EXPORT] "getHTMLDiffComponents" is not exported by
@payloadcms/ui/dist/elements/HTMLDiff/index.js
```

The compatibility shim in `src/vinext/payload-ui-rsc-shim.js` replaces the `@payloadcms/ui/rsc` barrel only for vinext. It re-exports the same Payload RSC symbols directly and uses Payload's underlying `HtmlDiff` implementation for `getHTMLDiffComponents`.

The alias is in `vite.config.ts`:

```ts
resolve: {
  alias: {
    '@payloadcms/ui/rsc': fileURLToPath(new URL('./src/vinext/payload-ui-rsc-shim.js', import.meta.url)),
  },
},
```

Do not remove this shim until Payload or vinext resolves the upstream bundling incompatibility.

## Cloudflare Configuration

The checked-in `wrangler.jsonc` is intentionally minimal:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "payloadcms",
  "compatibility_date": "2026-05-16",
  "compatibility_flags": ["nodejs_compat"],
  "main": "vinext/server/app-router-entry",
  "assets": {
    "not_found_handling": "none"
  }
}
```

During `vinext build`, vinext emits `dist/server/wrangler.json`. Use that generated file for Wrangler dry runs and deployment checks because it points at the built server entry and generated client assets.

## Environment Variables And Bindings

This project currently reads service configuration through the existing env layer and Payload config. Before a real Cloudflare deploy, configure production values for at least:

- `PAYLOAD_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- Auth/auther variables used by `src/lib/env.ts` and `src/lib/betterAuth/env.ts`
- QStash/queue variables if internal queue endpoints are used in production

Cloudflare secrets should be set through Wrangler, not committed:

```bash
pnpm exec wrangler secret put PAYLOAD_SECRET
pnpm exec wrangler secret put TURSO_DATABASE_URL
pnpm exec wrangler secret put TURSO_AUTH_TOKEN
```

Repeat for each sensitive production value.

Current storage/database adapters still use Turso and R2 SDK credentials. They are not yet rewritten to use native Cloudflare bindings through `cloudflare:workers`.

## Build And Dry Run

Run:

```bash
pnpm tsc --noEmit
pnpm build:vinext
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

Or use the combined script:

```bash
pnpm deploy:vinext:dry-run
```

Expected result from the latest verification:

```text
Total Upload: 17767.88 KiB / gzip: 4411.57 KiB
No bindings found.
--dry-run: exiting now.
```

`No bindings found` is expected with the current `wrangler.jsonc` because this project is not yet using Cloudflare-native bindings.

## Actual Deploy Command

Do not run this until secrets and production env values are configured:

```bash
pnpm deploy:vinext
```

For a lower-level deploy using the already-built output:

```bash
pnpm build:vinext
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

## Known Risks

- The Worker upload size is larger than the Cloudflare Workers free-plan 3 MiB compressed limit. Latest dry run was `gzip: 4411.57 KiB`.
- Payload 3.60 requires the `@payloadcms/ui/rsc` compatibility shim for vinext/Rolldown.
- vinext reports `middleware.ts` as deprecated for Next.js 16-style routing. This is a warning, not a current build blocker.
- vinext reports direct `eval` warnings from Payload migration and queue internals. These are warnings in the current build.
- Runtime parity with the existing Vercel deployment still needs manual smoke testing against real Turso/R2/auth secrets.

## Verification Checklist

Before any real deploy:

```bash
pnpm tsc --noEmit
pnpm build:vinext
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

After a real deploy, verify:

- `/admin` loads.
- Auth redirects and logout work.
- `/api/graphql` responds.
- `/api/[...slug]` Payload REST routes respond.
- Media URLs resolve through the configured R2 public base URL.
- Book/chapter GraphQL reads still match the blog consumer's expectations.
- Internal queue/reconcile endpoints are protected by their configured secrets.

## Rollback

The existing Next.js deployment path remains available. To rollback operationally, point traffic back to the current Vercel deployment and leave the Worker unused.

To remove the vinext migration from the repo later, revert:

- `vite.config.ts`
- `wrangler.jsonc`
- vinext scripts and dependencies in `package.json`
- vinext lockfile changes in `pnpm-lock.yaml`
- `src/vinext/payload-ui-rsc-shim.js`
- `/.wrangler/` and `/dist/` entries in `.gitignore`

## Definition Of Done

The Cloudflare path is ready for a real deployment only when:

- Type-check passes.
- `pnpm build:vinext` passes.
- Wrangler dry run passes.
- Production secrets are configured in Cloudflare.
- A deployed Worker passes the smoke tests listed above.
- The upload-size limit is acceptable for the selected Cloudflare plan.
