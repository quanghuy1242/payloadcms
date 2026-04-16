# Migration Env Checker Example

## Scenario: Adding `language` field to `Books` collection

- **Migration required**: YES — new non-optional field in an existing collection with data.
- **Env update required**: NO — no new env variables.
- **Build-mode exception**: NO — field is read at runtime, not build time.

**Files to update together**:
1. `src/collections/Books.ts` — add the `language` field.
2. Run `pnpm payload migrate:create` to generate `src/migrations/<timestamp>-add-language-to-books.ts`.
3. Commit both the `.ts` and `.json` migration files from `src/migrations/`.
4. Run `pnpm generate:types` to refresh `src/payload-types.ts`.

---

## Scenario: Adding `OPENAI_API_KEY` environment variable

- **Migration required**: NO — no schema change.
- **Env update required**: YES.
- **Build-mode exception**: YES — guard with `isNextBuild` in `src/payload.config.ts` if only used at runtime.

**Files to update together**:
1. `src/lib/env.ts` — add Zod validation: `OPENAI_API_KEY: z.string().min(1)`.
2. `.env.example` — add `OPENAI_API_KEY=`.