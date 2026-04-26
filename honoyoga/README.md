# honoyoga

Standalone Hono + GraphQL Yoga worker for the CMS read API.

Worker name: `payload-api`.

## Commands

Run from the repo root with `pnpm --dir honoyoga ...`:

- `pnpm --dir honoyoga dev`
- `pnpm --dir honoyoga check`
- `pnpm --dir honoyoga deploy`
- `pnpm --dir honoyoga format`

## Scope

This package is the transport boundary only.

- Hono handles routing and request middleware.
- GraphQL Yoga handles GraphQL execution.
- The shared schema/repository/policy layer comes later.
