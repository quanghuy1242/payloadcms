---
name: admin-ui-orchestration-reviewer
description: Review large admin React flows for state, orchestration, cancellation, and component responsibility. Use when editing src/components/admin/, adding multi-step wizards or import flows, wiring fetch calls in components, or when a UI gets stuck or leaks state.
---

# Admin UI Orchestration Reviewer

Use this skill for complex admin components. Admin UI lives in `src/components/admin/`.

## Request helpers — always import from `src/utils/http.ts`

| Helper | Usage |
|--------|-------|
| `requestJSON(url, options)` | Single fetch, throws `HttpRequestError` on non-2xx |
| `requestJSONWithRetry(url, options)` | Automatic retry with configurable `retries` and `retryDelayMs` |
| `HttpRequestError` | Catch this to distinguish network errors from logic errors |

Never write inline `fetch().then()` chains or local retry loops in a component.

## Check

- Presentation state (open/closed, step index, error messages) stays in the component.
- Orchestration logic (chunked uploads, retries, batch sequencing) is extracted to a utility when it exceeds ~30 lines.
- `AbortSignal` / `signal` is threaded through to every `requestJSON` call so cancellation is honored.
- Progress reporting uses explicit state updates, not console.log.
- The component does not own business rules (e.g., slug generation, chapter ordering).
- Shared request helpers from `src/utils/http.ts` are imported rather than reinvented.
- Import pipeline logic lives in `src/utils/epubPipeline.ts` (`runEpubImportPipeline()` async generator) — `EpubImporter.tsx` only assembles config, iterates the generator, and maps events to React state.

## Common targets in this project

- `src/components/admin/books/EpubImporter.tsx` — thin shell over `runEpubImportPipeline()`; iterates async generator events, maps to React state
- `src/components/admin/books/` — rest of book import wizard (chapter preview, progress display)
- `src/components/admin/chapters/` — Chapter editor, content save flow
- `src/components/admin/media/` — Media upload flow
- Any drawer or modal that calls the Payload REST API

## Output rule

Separate UI concerns from orchestration concerns in your review.
If a component is too large, name the exact lines/function that should move to a helper in `src/utils/`.

## Supporting files

- [template.md](template.md) for a UI review skeleton.
- [examples/sample.md](examples/sample.md) for the expected output format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.