---
name: test-strategy-chooser
description: Choose the right test level for a change and explain what should be covered. Use when finishing a feature, adding utilities, changing access rules, or asked "what tests should I write?" or "how do I test this?"
---

# Test Strategy Chooser

Use this skill when you need to decide how to verify a change.

## Test surface in this project

| Layer | Runner | Command | Location |
|-------|--------|---------|----------|
| Integration | Vitest | `pnpm test:int` | `tests/int/` |
| E2E | Playwright | `pnpm test:e2e` | `tests/e2e/` |

## Existing integration test files

- `tests/int/api.int.spec.ts` — REST API endpoints
- `tests/int/access-utils.int.spec.ts` — access helper contracts
- `tests/int/books-admin-components.int.spec.ts` — book admin UI components
- `tests/int/books-admin-config.int.spec.ts` — book collection config
- `tests/int/books-hooks.int.spec.ts` — Books collection hooks
- `tests/int/books-list-view.int.spec.ts` — book list view behavior
- `tests/int/epub-import-utils.int.spec.ts` — EPUB sanitization helpers
- `tests/int/epub-importer.int.spec.ts` — full import pipeline
- `tests/int/epub-lexical.int.spec.ts` — HTML → Lexical conversion
- `tests/int/http-utils.int.spec.ts` — `requestJSON` / `requestJSONWithRetry`
- `tests/int/slug.int.spec.ts` — slug generation helpers

Integration tests load `.env` via `vitest.setup.ts` and use `getPayload()` directly.

## Decision rules

| Change type | Preferred test level | Rationale |
|-------------|---------------------|----------|
| Pure utility (`src/utils/`) | Integration (Vitest) | No UI needed; fast, deterministic |
| Collection hooks / access | Integration (Vitest) | Uses `getPayload()` to test real behavior |
| Admin React component | Integration (Vitest) | Component rendering with jsdom |
| Full import pipeline | Integration (Vitest) | End-to-end over the pure logic layer |
| User journey (login, CRUD flow) | E2E (Playwright) | Tests real browser + server |
| REST/GraphQL API contract | Integration (Vitest) | Uses `getPayload()` + API calls |

## Check

- Pure utilities get the narrowest test: integration spec targeting only that module.
- Collection behavior changes get an integration test, not a unit mock.
- Admin flows that require a real browser get an E2E test.
- Shared logic always has the narrowest test that proves the contract.
- New spec files follow the `*.int.spec.ts` or `*.e2e.spec.ts` naming convention.

## Output rule

State the minimum test set that protects the change: test level, existing file to extend or new file to create, and the specific assertions that matter.
If the current test surface is weak for this area, name the missing layer explicitly.

## Supporting files

- [template.md](template.md) for a test plan skeleton.
- [examples/sample.md](examples/sample.md) for the expected output format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.