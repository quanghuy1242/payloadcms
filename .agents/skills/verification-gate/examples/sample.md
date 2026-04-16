# Verification Gate Example

## Task completed: Added `language` field to Books collection

**Checked**:
- `pnpm tsc --noEmit` — 0 errors
- `pnpm generate:types` — `src/payload-types.ts` updated with `language` field
- `pnpm payload migrate:status` — 1 pending migration (`add-language-to-books`)
- `pnpm test:int tests/int/books-admin-config.int.spec.ts` — 12 tests passed

**Passed**: TypeScript, types generation, targeted integration tests.

**Failed**: Nothing.

**Residual risk**: Migration has not been run against Turso production yet — must run `pnpm payload migrate` before deployment.