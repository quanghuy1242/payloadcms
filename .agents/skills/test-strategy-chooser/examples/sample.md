# Test Strategy Example

## Change: New `sanitizeImageMimeType` helper in `src/utils/epubImport.ts`

- **Level**: Integration (Vitest)
- **Command**: `pnpm test:int tests/int/epub-import-utils.int.spec.ts`
- **Assertions**: `sanitizeImageMimeType('image/png')` → `'image/png'`; `sanitizeImageMimeType('image/gif')` → `null`; `sanitizeImageMimeType(undefined)` → `null`.

---

## Change: `language` field on Books collection with `ownerAccess('owner')`

- **Level**: Integration (Vitest)
- **Command**: `pnpm test:int tests/int/books-admin-config.int.spec.ts`
- **Assertions**: Admin can update `language`; non-owner cannot; unauthenticated cannot.

---

## Change: Book import wizard shows wrong step count after chapter save

- **Level**: E2E (Playwright)
- **Command**: `pnpm test:e2e`
- **Assertions**: After the last chapter saves, the progress indicator shows "Done" not "3 of 4".