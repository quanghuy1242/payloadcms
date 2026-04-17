# payloadcms

A self-hosted content management platform built on **PayloadCMS 3.60 + Next.js 15**, purpose-built for managing both EPUB books (with browser-side import) and original blog content from a single admin panel. It exposes a full GraphQL + REST API for headless consumption while keeping the infrastructure lean enough to run on Vercel's free tier.

## Table of Contents

- [Overview](#overview)
- [Admin UI Highlights](#admin-ui-highlights)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Docker Setup](#docker-setup)
- [Database & Migrations](#database--migrations)
- [Authentication & User Management](#authentication--user-management)
- [Testing](#testing)
- [Available Scripts](#available-scripts)
- [Deployment](#deployment)

---

## Overview

payloadcms manages two distinct but related content domains from one admin panel:

**Books & Chapters**: Import EPUB files directly in the browser. The entire parsing pipeline (metadata extraction, HTML-to-Lexical conversion, image extraction) runs client-side to avoid serverless body-size and timeout constraints. Chapters are stored as structured Lexical rich text with custom nodes that preserve EPUB-specific semantics (footnote references, internal cross-chapter links).

**Blog Posts**: Standard article publishing with draft/published versioning, per-author ownership, category tagging, automatic slug generation, and SEO meta fields.

Both content types are served through Payload's built-in REST and GraphQL APIs. A custom `SimilarPosts` GraphQL query provides scored post recommendations (category match, same author, tag overlap) without needing an external service.

---

## Admin UI Highlights

The admin panel extends PayloadCMS with several custom components and views:

### EPUB Import Wizard
Uploading an `.epub` file opens a full-page import wizard (`BookImportPage`). The browser parses the file with `epubjs`, converts each chapter's XHTML content to Lexical JSON, uploads extracted images to the Media collection, and then sends the structured data to the Payload REST API. Import status (`idle → importing → ready / failed`) is tracked per book so failed imports can be safely retried without duplicating content.

### Book & Chapter Management
The Books list view (`BooksListView`) replaces the default table with a card grid. Each book detail page surfaces a **View Chapters** button that opens the chapter list in a drawer, avoiding a full navigation away. A protected **Delete Book** button (`DeleteBookButton`) validates that no chapters exist before allowing deletion.

### Media Grid View
The Media collection renders as a responsive image grid (`MediaGridView`) instead of the default table. Each image shows its low-resolution blurred placeholder (a base64 data URL generated on upload) alongside its dimensions and storage key.

### Better Auth Login Flow
Payload's login page is intercepted and replaced with a redirect to an external Better Auth provider via a PKCE OAuth2 flow. On return, the JWT is validated against the provider's JWKS endpoint and the session is established in Payload. The `BetterAuthLogout` component signs out of both systems simultaneously.

### Draft & Versioning
All content collections (Books, Chapters, Posts) support draft versions with 5-second autosave. The status toggle between draft and published is accessible directly from the document toolbar.

### Image Optimization Pipeline
On every Media upload, the system generates:
- A **base64 low-resolution placeholder** for instant above-the-fold rendering
- A **1920px WebP** master
- **6 responsive variants** (384 → 1280px) stored in R2 for `srcset` use

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| CMS | PayloadCMS 3.60 |
| Database | Turso (libSQL) → local SQLite fallback |
| Object Storage | Cloudflare R2 → local filesystem fallback |
| Rich Text | Lexical via `@payloadcms/richtext-lexical` |
| Auth | Better Auth (PKCE/JWKS) |
| Language | TypeScript 5.7 |
| Package Manager | pnpm 10 |
| Testing | Vitest (integration) + Playwright (E2E) |
| Container | Docker + Docker Compose (MinIO for local S3) |

---

## Getting Started

**Requirements:** Node.js `^18.20.2 || >=20.9.0`, pnpm 10.

```bash
# 1. Install dependencies
corepack enable && corepack prepare pnpm@10.15.1 --activate
pnpm install

# 2. Copy and edit environment file
cp .env.example .env

# 3. Start the dev server
pnpm dev
```

Access points once running:

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Frontend |
| `http://localhost:3000/admin` | Admin panel |
| `http://localhost:3000/api/graphql` | GraphQL API |
| `http://localhost:3000/api/graphql-playground` | GraphQL Playground |

Without Turso or R2 credentials the app falls back to a local SQLite file (`.payload/data.sqlite`) and filesystem storage automatically — no configuration needed for local development.

---

## Environment Configuration

```bash
# Required
PAYLOAD_SECRET=your-long-random-secret

# Database — omit to use local SQLite
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Object storage — omit to use local filesystem
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-bucket
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret
R2_PUBLIC_BASE_URL=https://cdn.example.com

# Auther (required for private book access)
AUTHER_BASE_URL=https://auth.example.com
AUTHER_API_KEY=your-auther-internal-api-key

# Better Auth (required for login and private book access)
PAYLOAD_CLIENT_ID=your-payload-client-id
BETTER_AUTH_URL=https://your-auth-provider.example.com
```

All variables are validated at startup via Zod schemas in `src/lib/env.ts`. Missing production-required vars throw on boot; missing optional vars trigger graceful fallback in development.

---

## Docker Setup

The `docker-compose.yml` includes the main app and a **MinIO** container for local S3-compatible storage.

```bash
# Start everything
docker-compose up

# Background
docker-compose up -d
```

MinIO console is available at `http://localhost:9001` (credentials: `minioadmin` / `minioadmin`). Point your R2 env vars at `http://minio:9000` to use it.

To emulate Turso locally, uncomment the `libsql` service in `docker-compose.yml` and set `TURSO_DATABASE_URL=http://libsql:8080`.

For a production Docker build:

```bash
docker build -t payloadcms .
docker run -p 3000:3000 --env-file .env payloadcms
```

---

## Database & Migrations

In development, schema changes auto-sync (`push: true`). In production, migrations must be created explicitly:

```bash
# Create a migration (run with Turso credentials for accuracy)
PAYLOAD_SECRET=x \
TURSO_DATABASE_URL="libsql://..." \
TURSO_AUTH_TOKEN="..." \
pnpm payload migrate:create
```

Each run creates a paired `.ts` + `.json` file in `src/migrations/` — commit both. Apply in production before deploying:

```bash
pnpm payload migrate        # apply pending
pnpm payload migrate:status # check state
```

Never edit a migration file after it has been applied to any environment.

---

## Authentication & User Management

Authentication is handled by an external **Better Auth** provider. Payload does not store passwords; it validates JWTs via the provider's JWKS endpoint and maps users to the local `Users` collection (`role: 'admin' | 'user'`).

**Promote a user to admin** (direct DB write, bypasses API):

```bash
pnpm promote:admin --email user@example.com
```

This works against both local SQLite and remote Turso.

### Access Control Summary

| Collection | Create | Read | Update / Delete |
|------------|--------|------|-----------------|
| Books | Authenticated | Owner or admin | Owner or admin |
| Chapters | Authenticated | Owner or admin | Owner or admin |
| Posts | Authenticated | Published = anyone; drafts = owner | Owner or admin |
| Media | Authenticated | Referenced by published content = anyone; else owner | Owner or admin |
| Users | Admin | Self or admin | Self or admin |

---

## Testing

```bash
pnpm test:int     # Vitest integration tests (hits Payload API directly)
pnpm test:e2e     # Playwright E2E tests
pnpm test         # Both
```

Integration tests load environment from `.env` via `vitest.setup.ts` and call `getPayload()` with the live config. E2E tests drive a running dev server via Playwright.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm devsafe` | Clean `.next` then start dev server |
| `pnpm build` | Generate types and build for production |
| `pnpm start` | Start production server |
| `pnpm ci` | Run migrations then build (CI/CD) |
| `pnpm test:int` | Vitest integration tests |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm lint` | ESLint |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` |
| `pnpm generate:importmap` | Regenerate admin import map |
| `pnpm payload migrate:create` | Create new migration |
| `pnpm payload migrate` | Apply pending migrations |
| `pnpm payload migrate:status` | Check migration status |
| `pnpm promote:admin` | Promote a user to admin role |
| `pnpm backfill:lowres` | Regenerate low-res image placeholders |
| `pnpm epub:probe` | Inspect EPUB file structure |

---

## Deployment

1. Set all required environment variables on your hosting platform.
2. Run pending migrations before the new code goes live: `pnpm payload migrate`.
3. Build: `pnpm build` (or use `pnpm ci` to do both in one step).
4. Start: `pnpm start`.

`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are required at runtime in production. R2 credentials are strongly recommended; without them media uploads fall back to the local filesystem which is ephemeral on most platforms.

The project is structured for Vercel deployment. Because EPUB processing is fully browser-side, it fits within Vercel's free-tier function body-size and execution-time limits.
