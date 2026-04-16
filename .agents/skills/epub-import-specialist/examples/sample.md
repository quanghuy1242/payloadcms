# EPUB Import Specialist Example

## Issue: Footnotes in imported chapters display as plain text

**Pipeline stage affected**: HTML → Lexical conversion (`src/utils/epubLexical.ts`)

**Root cause**: The converter's `<a>` handler strips `epub:type="noteref"` links instead of mapping them to the `epub-footnote-ref` Lexical node.

**Fix location**: `src/utils/epubLexical.ts` — add handling for `<a epub:type="noteref">` to emit `{ type: 'epub-footnote-ref', ... }`.

**Regression risk**: Affects all future EPUB imports; existing saved chapters are unaffected (stored as JSON snapshots). Add a test case in `tests/int/epub-lexical.int.spec.ts`.

---

## Issue: Large chapter times out during save

**Pipeline stage affected**: Persistence (`src/components/admin/books/` → Payload REST API)

**Root cause**: Admin component uses a single `requestJSON` call with no retry.

**Fix**: Switch to `requestJSONWithRetry` with `{ retries: 2, retryDelayMs: 600 }` and thread an `AbortController` signal through for cancellation.