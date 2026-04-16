---
name: epub-import-specialist
description: Understand and review the EPUB to Payload import pipeline, Lexical conversion, chapter batching, and image handling. Use when changing epubImport.ts, epubLexical.ts, chapterLexicalNodes.ts, or chapterRichText.ts, or debugging broken chapter content after an import.
---

# EPUB Import Specialist

Use this skill for the book import subsystem.

## Pipeline stages and owning modules

| Stage | Module | Responsibility |
|-------|--------|----------------|
| Preflight / metadata | `src/utils/epubImport.ts` | Parse EPUB spine, TOC, sanitize HTML, extract images |
| HTML → Lexical conversion | `src/utils/epubLexical.ts` | Convert sanitized HTML nodes to Lexical JSON |
| Node registration | `src/utils/chapterLexicalNodes.ts` | Defines custom node types available to Payload Lexical |
| Rich text helpers | `src/utils/chapterRichText.ts` | Utilities for working with stored Lexical content |
| Admin orchestration | `src/components/admin/books/` | UI, chapter batching, progress, retry logic |
| Persistence | Payload REST API (`/api/chapters`) | Saves converted chapters; uses `requestJSONWithRetry` |

## Custom Lexical nodes registered for chapters

Check `src/utils/chapterLexicalNodes.ts` and `src/features/` for:
- `epub-footnote-ref` — footnote reference node
- `epub-internal-link` — cross-chapter internal link node
- `youtube` — embedded YouTube video node

Any new EPUB construct must map to a registered node or it will be silently dropped.

## HTML sanitization rules (`src/utils/epubImport.ts`)

- Disallowed tags: `style`, `script`, `iframe`, `object`, `embed`.
- URL protocol allowlist: `http:`, `https:`, `mailto:`, `tel:`.
- Block-level elements are normalized; `div` inside `li`/`td`/`th` is treated specially.
- Images: only `image/png`, `image/jpeg`, `image/jpg` are uploaded; others are dropped.

## Check

- Import state transitions (idle → parsing → converting → saving → done/error) are consistent.
- Chapter batching is deterministic — retry logic uses `requestJSONWithRetry`, not ad hoc loops.
- HTML sanitization does not destroy semantic content (headings, lists, blockquotes, tables).
- Image MIME type is validated before upload; unsupported types are skipped gracefully.
- Lexical output only uses nodes registered in `chapterLexicalNodes.ts`.
- Internal links resolve to valid chapter slugs within the same book.
- Footnotes are preserved as `epub-footnote-ref` nodes, not flattened to plain text.

## Useful questions

- Is this logic preflight, batch orchestration, HTML→Lexical conversion, or persistence?
- Does this change affect both manual book creation and EPUB imports?
- Is the new construct mappable to a registered Lexical node type?
- Does the change preserve the content shape required by Payload's Lexical editor?

## Output rule

Name the pipeline stage affected first, then the exact failure mode the change prevents or introduces.

## Supporting files

- [template.md](template.md) for an import pipeline review skeleton.
- [examples/sample.md](examples/sample.md) for the expected report format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.