---
name: book-chapter-flow-reviewer
description: Review the Books → Chapters data model, import lifecycle, chapter ordering, and admin UI. Use when editing Books.ts, Chapters.ts, books.ts, import status transitions, chapter ordering, the book admin list view, or asked about book sync status or import lifecycle.
---

# Book Chapter Flow Reviewer

Use this skill for the Books + Chapters subsystem.

## Data model overview

```
Book (src/collections/Books.ts)
├── title, slug (randomized, immutable)
├── owner: relationship → Users (enforced via enforceOwnershipHook('createdBy'))
├── origin: 'manual' | 'epub-imported' | 'synced'
├── sourceType: 'manual' | 'epub-upload' | 'meap-feed' | 'external-sync'
├── importStatus: 'idle' | 'importing' | 'ready' | 'failed' | 'canceled'
├── syncStatus: 'clean' | 'pending' | 'conflicted' | 'diverged'
└── Chapters (related, via chapters.book relationship)
    ├── title, slug (non-randomized via createSlugHook)
    ├── book: relationship → Books
    ├── order: integer (unique per book, enforced via enforceUniqueChapterOrderHook)
    ├── content: Lexical rich text (custom nodes registered in chapterLexicalNodes.ts)
    └── _status: draft | published (autosave every 5s)
```

## Key utilities

| Module | Exports | Use for |
|--------|---------|---------|
| `src/utils/books.ts` | `applyBookImportLifecycleHook`, `enforceUniqueChapterOrderHook`, `bookDeleteAccess`, `enforceBookHasNoChaptersBeforeDelete`, constants | All Books-specific hooks and guards |
| `src/utils/chapterRichText.ts` | `createChapterLexicalEditor` | Wiring Lexical editor to a chapter field |
| `src/utils/chapterLexicalNodes.ts` | Custom node definitions | Node registration for chapter content |
| `src/utils/epubImport.ts` | EPUB parsing + sanitization | EPUB → chapter data pipeline (stage 1) |
| `src/utils/epubLexical.ts` | HTML → Lexical conversion | EPUB → chapter data pipeline (stage 2) |

## Import lifecycle state machine

```
idle → importing → ready
       importing → failed
       importing → canceled
failed → importing  (retry)
canceled → importing (retry)
```

`applyBookImportLifecycleHook` in `src/utils/books.ts` enforces valid transitions in `beforeChange`.
Never update `importStatus` directly in a component; always go through the Payload API.

## Chapter ordering rules

- `order` field must be unique within a book.
- `enforceUniqueChapterOrderHook` (`beforeChange`) re-sequences conflicting orders automatically.
- Do not manually reorder by patching `order` fields individually — use the reorder API or the bulk operation in the admin component.

## Admin components

- `src/components/admin/books/BooksListView` — custom list view with import status badges.
- `src/components/admin/books/` — book import wizard (EPUB upload, chapter preview, batch save).
- `src/components/admin/chapters/ChaptersListView` — chapter list view (hidden from main nav).

## Access rules

| Collection | Create | Read | Update | Delete |
|------------|--------|------|--------|--------|
| Books | `authenticatedAccess` | `authenticatedAccess` | `ownerAccess('createdBy')` | `bookDeleteAccess` |
| Chapters | `authenticatedAccess` | `authenticatedAccess` | `ownerAccess('createdBy')` | `ownerAccess('createdBy')` |

`bookDeleteAccess` blocks deletion if the book has existing chapters (`enforceBookHasNoChaptersBeforeDelete`).

## Check

- Import status transitions follow the state machine — no illegal transitions.
- `applyBookImportLifecycleHook` is wired in `beforeChange`, not `beforeValidate`.
- Chapter `order` conflicts are handled by `enforceUniqueChapterOrderHook`, not ad hoc.
- Lexical editor for chapter `content` uses `createChapterLexicalEditor()` from `chapterRichText.ts`.
- Book delete guard is present: `enforceBookHasNoChaptersBeforeDelete`.
- Admin components use `requestJSONWithRetry` (not raw `fetch`) for all API calls.
- Status constants (`BOOK_IMPORT_STATUSES`, `BOOK_SYNC_STATUSES`) are imported from `src/utils/books.ts`.
- EPUB import pipeline separates parsing (`epubImport.ts`) from conversion (`epubLexical.ts`).

## Common failure modes

- Inline status string literals in components instead of importing constants from `books.ts`.
- Directly patching `importStatus` via fetch instead of routing through Payload's collection API.
- Chapter reorder logic in a component instead of using the bulk operation.
- Using `createRandomizedSlugHook` for chapters (should use `createSlugHook` — chapters get deterministic slugs from titles).
- Forgetting to thread `AbortSignal` through batch saves (import can't be canceled).

## Output rule

State the lifecycle stage or data model layer affected, then the exact hook or utility that owns that behavior.
If a component is doing what a utility should do, name both the component location and the utility it should call instead.

## Supporting files

- [template.md](template.md) for a book/chapter review skeleton.
- [examples/sample.md](examples/sample.md) for a concrete review example.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.
