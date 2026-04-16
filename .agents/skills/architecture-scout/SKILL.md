---
name: architecture-scout
description: Map the repo structure, find the right layer for a change, and identify what should not be touched. Use when planning features touching multiple files, unsure where logic belongs, suspecting duplicate code, or asked "where should I put this?"
---

# Architecture Scout

Use this skill when you need to understand where a change belongs.

## Layer map for this repo

| Layer | Path | Rule |
|-------|------|------|
| Collections | `src/collections/` | Thin contracts only — hooks/access delegated to utils |
| Utilities | `src/utils/` | Side-effect free, framework-agnostic, testable without UI |
| Lexical features | `src/features/` | Custom Lexical nodes + plugins (server + client split) |
| Admin components | `src/components/admin/` | React components, browser only |
| Library adapters | `src/lib/` | Turso, R2/MinIO, env, SEO — wraps external services |
| GraphQL extensions | `src/graphql/` | Queries + mutations in their own subdirectories |
| Scripts | `scripts/` | One-off CLI ops; may depend on Payload but not Next.js |
| Tests | `tests/int/`, `tests/e2e/` | Integration (Vitest) and E2E (Playwright) |
| Globals | `src/globals/` | Payload globals (site settings, etc.) |

## Focus

- Identify the owning layer using the table above.
- Point out boundary violations: business logic in collections, browser APIs in server utilities, inline fetch in components.
- Suggest the smallest set of files that should change.
- Call out anything that looks like a future maintenance trap.

## Default questions

- Does this logic belong in `src/utils/` as a shared helper?
- Is this collection file still a thin contract (hooks/access imported from utils)?
- Is any browser-only code (DOM, Blob, window) leaking into a server-safe utility?
- Is any feature-specific logic duplicated elsewhere in the repo?
- Does `src/lib/` already have an adapter for this external service?

## Output rule

State the layer decision first, then list the supporting file references.
Avoid proposing broad refactors unless the current change directly requires them.

## Supporting files

- [template.md](template.md) for an architecture review skeleton.
- [examples/sample.md](examples/sample.md) for the expected report shape.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.