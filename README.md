# PayloadCMS with Next.js

A modern headless CMS built with PayloadCMS 3.0 and Next.js 15, featuring Turso (libSQL) database, Cloudflare R2 storage, and comprehensive GraphQL API support.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Docker Setup](#docker-setup)
- [Database & Migrations](#database--migrations)
- [User Management](#user-management)
- [Testing](#testing)
- [Production Build](#production-build)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Troubleshooting](#troubleshooting)

## Introduction

This project is a production-ready PayloadCMS implementation that provides a powerful content management system with a beautiful admin UI. It's built on top of Next.js 15 and uses modern cloud services for scalability and performance.

## Features

- **PayloadCMS 3.60**: Latest version with full TypeScript support
- **Next.js 15**: React 19 with App Router
- **Turso Database**: Globally-distributed SQLite (libSQL) with local fallback
- **Cloudflare R2**: S3-compatible object storage for media files
- **GraphQL API**: Full GraphQL support with playground
- **SEO Plugin**: Built-in SEO optimization for posts
- **Lexical Editor**: Modern rich text editing experience
- **E2E Testing**: Playwright and Vitest integration
- **Docker Support**: Full containerization support

## Tech Stack

- **Frontend/Backend**: Next.js 15.4.4, React 19.1.0
- **CMS**: PayloadCMS 3.60.0
- **Database**: SQLite with Turso libSQL
- **Storage**: Cloudflare R2 (S3-compatible)
- **Language**: TypeScript 5.7.3
- **Package Manager**: pnpm 10.15.1
- **Testing**: Playwright, Vitest
- **Linting**: ESLint
- **Containerization**: Docker & Docker Compose

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: ^18.20.2 || >=20.9.0
- **pnpm**: 10.15.1 (or it will be installed via corepack)
- **Docker** (optional): Latest version for containerized development
- **Docker Compose** (optional): For multi-container setup

## Installation

1. **Clone the repository:**

```bash
git clone <repository-url>
cd payloadcms
```

2. **Install dependencies:**

```bash
corepack enable
corepack prepare pnpm@10.15.1 --activate
pnpm install
```

## Environment Configuration

1. **Create environment file:**

```bash
cp .env.example .env
```

2. **Configure environment variables:**

Edit `.env` with your configuration:

```bash
# Required: Payload secret for JWT signing
PAYLOAD_SECRET=your-long-random-secret-here

# Database (optional for local development)
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Cloudflare R2 Storage (optional for local development)
R2_ENDPOINT=https://account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=your-r2-bucket
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_PUBLIC_BASE_URL=https://account-id.r2.cloudflarestorage.com/your-r2-bucket
```

### Environment Variables Explained

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYLOAD_SECRET` | Yes | Secret key for JWT token signing (use a strong random string) |
| `TURSO_DATABASE_URL` | No* | Turso database URL (falls back to local SQLite if not set) |
| `TURSO_AUTH_TOKEN` | No* | Turso authentication token |
| `R2_ENDPOINT` | No* | Cloudflare R2 endpoint URL |
| `R2_BUCKET_NAME` | No* | R2 bucket name for media storage |
| `R2_ACCESS_KEY_ID` | No* | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | No* | R2 secret access key |
| `R2_PUBLIC_BASE_URL` | No* | Public base URL (or custom domain) for your R2 bucket |

*In local development, the app falls back to local SQLite (`.payload/data.sqlite`) and filesystem storage if these are not provided.

## Development

### Local Development (without Docker)

1. **Start the development server:**

```bash
pnpm dev
```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin
   - GraphQL Playground: http://localhost:3000/api/graphql-playground
   - GraphQL API: http://localhost:3000/api/graphql

3. **Create your first admin user:**
   - Navigate to http://localhost:3000/admin
   - Follow the on-screen instructions to create an admin account

### Database Fallback Behavior

- **Without Turso credentials**: Uses local SQLite file at `.payload/data.sqlite`
- **Without R2 credentials**: Stores media files in local filesystem
- **Development mode**: Auto-syncs schema changes (no manual migrations needed)

## Docker Setup

### Using Docker Compose (Recommended)

The project includes a `docker-compose.yml` file with the following services:

1. **payload**: Main Next.js application
2. **minio**: Local S3-compatible storage (optional)
3. **libsql**: Local Turso emulator (commented out, optional)

**Start all services:**

```bash
docker-compose up
```

**Run in background:**

```bash
docker-compose up -d
```

**View logs:**

```bash
docker-compose logs -f
```

**Stop services:**

```bash
docker-compose down
```

### Docker Services Configuration

#### Main Application (payload)
- Port: `3000:3000`
- Automatically installs dependencies and starts dev server
- Uses volumes for code synchronization

#### MinIO (S3-compatible storage)
- S3 API Port: `9000`
- Web Console: `9001`
- Default credentials: `minioadmin` / `minioadmin`
- Access console at: http://localhost:9001

**To use MinIO locally**, update your `.env`:

```bash
R2_ENDPOINT=http://minio:9000
R2_BUCKET_NAME=payloadcms
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
```

Then create the bucket via MinIO console at http://localhost:9001

#### LibSQL Server (Optional)

Uncomment the `libsql` service in `docker-compose.yml` to run a local Turso emulator:

```yaml
libsql:
  image: ghcr.io/libsql/sqld:0.24.23
  command:
    [
      "--http-listen-addr=0.0.0.0:8080",
      "--db-path=/var/lib/sqld/db.sqld",
      "--disable-auth"
    ]
  ports:
    - '8080:8080'
  volumes:
    - sqldata:/var/lib/sqld
```

Update your `.env`:

```bash
TURSO_DATABASE_URL=http://libsql:8080
```

### Production Docker Build

The `Dockerfile` is optimized for production deployment:

```bash
# Build the image
docker build -t payloadcms .

# Run the container
docker run -p 3000:3000 --env-file .env payloadcms
```

**Note**: Ensure `output: 'standalone'` is set in `next.config.mjs` for Docker builds.

## Database & Migrations

### Understanding Schema Synchronization

- **Development** (`NODE_ENV !== 'production'`): Schema changes auto-sync to database
- **Production**: Manual migrations required for schema changes

### Creating Migrations

When you modify collections, globals, or any schema:

```bash
pnpm payload migrate:create
```

For Turso databases, include connection details:

```bash
PAYLOAD_SECRET=dev-secret \
TURSO_DATABASE_URL="libsql://..." \
TURSO_AUTH_TOKEN="..." \
pnpm payload migrate:create
```

This creates two files in `src/migrations/`:
- `YYYYMMDD_HHMMSS.ts` - TypeScript migration file
- `YYYYMMDD_HHMMSS.json` - JSON migration metadata

**Commit both files to version control.**

### Running Migrations

**In production (before starting the app):**

```bash
pnpm payload migrate
```

**Check migration status:**

```bash
pnpm payload migrate:status
```

**Reset database (development only - dangerous!):**

```bash
pnpm payload migrate:reset
```

### Migration Best Practices

1. Always create migrations for production schema changes
2. Test migrations in a staging environment first
3. Take Turso snapshots before running production migrations
4. Commit migration files with your code changes
5. Never edit migration files after they've been applied

## User Management

### Promoting Users to Admin

Use the provided script to promote existing users to admin role:

```bash
pnpm promote:admin --email user@example.com
```

Or using the short flag:

```bash
pnpm promote:admin -e user@example.com
```

This script:
- Connects to your configured database (Turso or local SQLite)
- Finds the user by email
- Updates their role to `admin`
- Provides confirmation or error messages

## Testing

The project includes comprehensive testing setup:

### Integration Tests (Vitest)

```bash
# Run integration tests
pnpm test:int

# Watch mode
pnpm test:int --watch
```

### End-to-End Tests (Playwright)

```bash
# Run E2E tests
pnpm test:e2e

# Run with UI
pnpm test:e2e --ui

# Run specific test file
pnpm test:e2e tests/e2e/frontend.e2e.spec.ts
```

### Run All Tests

```bash
pnpm test
```

## Production Build

### Build the application:

```bash
pnpm build
```

This command:
1. Generates TypeScript types
2. Builds the Next.js application
3. Creates optimized production bundles

### Run migrations (if needed):

```bash
pnpm payload migrate
```

### Start production server:

```bash
pnpm start
```

### CI/CD Build Command

For continuous integration:

```bash
pnpm ci
```

This runs migrations and builds the application.

## Deployment

### Manual Deployment

1. **Build the application:**
   ```bash
   pnpm build
   ```

2. **Run migrations:**
   ```bash
   pnpm payload migrate
   ```

3. **Start the server:**
   ```bash
   pnpm start
   ```

4. **Environment Requirements:**
   - All environment variables must be set
   - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are required in production
   - R2 credentials are recommended but optional

## Key Files

- **`src/payload.config.ts`**: Main Payload configuration
- **`src/collections/`**: Define your content types
- **`src/globals/`**: Define global singletons
- **`src/migrations/`**: Database migration files
- **`docker-compose.yml`**: Local development services
- **`Dockerfile`**: Production container image

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm ci` | Run migrations and build (CI/CD) |
| `pnpm test` | Run all tests |
| `pnpm test:int` | Run integration tests |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm lint` | Run ESLint |
| `pnpm payload` | Access Payload CLI |
| `pnpm payload migrate:create` | Create new migration |
| `pnpm payload migrate` | Run pending migrations |
| `pnpm payload migrate:status` | Check migration status |
| `pnpm generate:types` | Generate TypeScript types |
| `pnpm generate:importmap` | Generate import map |
| `pnpm promote:admin` | Promote user to admin |
| `pnpm devsafe` | Clean dev (removes .next) |

## Troubleshooting

### Local SQLite file not found

**Solution**: The file is auto-created on first run. Ensure the `.payload` directory has write permissions.

### Turso connection errors

**Solutions**:
- Verify `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are correct
- Check network connectivity to Turso
- Fall back to local SQLite by removing Turso env vars

### R2 upload failures

**Solutions**:
- Verify R2 credentials and bucket name
- Check bucket CORS settings
- Ensure S3 API access is enabled
- Fall back to local storage by removing R2 env vars

### Docker container exits immediately

**Solutions**:
- Check Docker logs: `docker-compose logs`
- Ensure `.env` file exists
- Verify port 3000 is not in use

### Migration conflicts

**Solutions**:
- Check migration status: `pnpm payload migrate:status`
- Never edit applied migrations
- In development, you can reset: `pnpm payload migrate:reset` (dangerous!)

### Admin panel not accessible

**Solutions**:
- Ensure dev server is running
- Check that port 3000 is accessible
- Verify `PAYLOAD_SECRET` is set
- Clear browser cache and cookies

### TypeScript errors after schema changes

**Solutions**:
- Regenerate types: `pnpm generate:types`
- Restart TypeScript server in VS Code
- Check for migration files that need to be created

## Additional Resources

- [PayloadCMS Documentation](https://payloadcms.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Turso Documentation](https://docs.turso.tech/)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [Payload Discord Community](https://discord.com/invite/payload)
- [GitHub Discussions](https://github.com/payloadcms/payload/discussions)
