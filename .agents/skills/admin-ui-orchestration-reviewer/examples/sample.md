# Admin UI Orchestration Review Example

## Component: `BookImportWizard` in `src/components/admin/books/`

**Keep in component**: Step index state, error display, progress percentage, abort button visibility.

**Extract to utility or use existing helper**:
- Chapter batch sequencing loop — use `requestJSONWithRetry` from `src/utils/http.ts` instead of the ad hoc retry `while` loop.
- EPUB parsing logic — call `src/utils/epubImport.ts` functions; do not duplicate them inline.
- AbortController management — create in component, pass `signal` down to `requestJSONWithRetry`.

**Verdict**: The current component owns the retry loop (orchestration concern). Extract retry to `requestJSONWithRetry` and move EPUB parsing calls to `epubImport.ts`.