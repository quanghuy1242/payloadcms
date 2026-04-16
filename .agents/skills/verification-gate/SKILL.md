---
name: verification-gate
description: Run the required verification checks before finishing a code task. Use before declaring any task done — when code, schema, access rules, admin UI, or migrations changed, or when the user says "done" or "is this ready?"
---

# Verification Gate

Use this skill as the final pass before declaring a task done.

## Commands

```bash
# Type-check and lint
pnpm tsc --noEmit

# Integration tests (Vitest)
pnpm test:int

# E2E tests (Playwright)
pnpm test:e2e

# Generate types after schema change
pnpm generate:types

# Check migration status
pnpm payload migrate:status
```

## Required checks by change type

| Change type | Commands to run |
|-------------|----------------|
| Utility (`src/utils/`) | `pnpm tsc --noEmit` + `pnpm test:int` (targeted spec) |
| Collection or schema | `pnpm tsc --noEmit` + `pnpm generate:types` + `pnpm payload migrate:status` |
| Access rules | `pnpm tsc --noEmit` + `pnpm test:int tests/int/access-utils.int.spec.ts` |
| Admin UI component | `pnpm tsc --noEmit` + `pnpm test:int` (component spec) |
| EPUB import logic | `pnpm tsc --noEmit` + `pnpm test:int tests/int/epub-*.int.spec.ts` |
| GraphQL extension | `pnpm tsc --noEmit` + `pnpm test:int tests/int/api.int.spec.ts` |
| HTTP utility | `pnpm tsc --noEmit` + `pnpm test:int tests/int/http-utils.int.spec.ts` |
| Documentation only | `pnpm tsc --noEmit` (confirm no accidental code changes) |

## Always check

1. Read current workspace diagnostics first (TypeScript errors take priority).
2. Identify the smallest relevant verification set from the table above.
3. Run the checks; do not skip or assume they pass.
4. If `generate:types` was needed, confirm `src/payload-types.ts` is up to date.
5. Report all failures explicitly; do not hide them.

## Output rule

Return a four-field verdict:
- **Checked**: what commands were run
- **Passed**: what succeeded
- **Failed**: what failed (with error summary)
- **Residual risk**: what was not verified and why

Do not mark work complete until the verification set is satisfied or the blocker is named explicitly.

## Supporting files

- [template.md](template.md) for a reusable verification checklist skeleton.
- [examples/sample.md](examples/sample.md) for the expected output style.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.