# Implementation Plan: EPUB Import and Book Management Roadmap for Payload CMS

## Context & Architecture Constraints

We are building an EPUB book ingestion and management system for Payload CMS 3.0 (Next.js App Router). Because we are deploying to Vercel Free Tier, we cannot process large `.epub` files on the server because the 4.5MB body limit and 10s execution timeout are too restrictive.

**Core rule:** all EPUB parsing, unzipping, chunking, HTML cleanup, and HTML-to-Lexical conversion must happen in the browser using custom admin client components. The browser then uploads images to the Media endpoint and creates records through the standard Payload REST API.

The canonical data model is two collections:

- `books`
- `chapters`

Imported books and manually authored books are separate origins, but they share the same collections. The admin experience should be book-centric, with chapters managed from the book screen instead of treating the chapter collection as the primary surface.

## Phase 1: Foundation

Goal: install the browser-side EPUB and Lexical HTML import helpers, then register the two canonical collections.

### Dependencies

- `pnpm add epubjs`
- `pnpm add lexical @lexical/html`
- `pnpm add -D @types/epubjs`

### Collections

#### `Books`

- Slug: `books`
- Admin title: `useAsTitle: 'title'`
- Fields:
  - `title` (text, required)
  - `author` (text)
  - `slug` (text, unique, required)
  - `cover` (upload, relationTo: `media`)
  - `importStatus` (select: `idle`, `importing`, `ready`, `failed`) so import lifecycle is queryable in admin and API
  - `importStartedAt`, `importFinishedAt`, `importFailedAt` (date) for lifecycle auditing and resume logic
  - `importErrorSummary` (textarea) for recoverable failure visibility
  - `importBatchId` (text, indexed) to dedupe/retry imports safely
- Admin enhancement: inject a custom component above the list view.

```ts
admin: {
  components: {
    beforeList: ['./components/admin/books/EpubImporter'],
  },
}
```

#### `Chapters`

- Slug: `chapters`
- Admin title: `useAsTitle: 'title'`
- Fields:
  - `title` (text, required)
  - `book` (relationship, relationTo: `books`, required, hasMany: false)
  - `order` (number, required, indexed) - critical for sorting the spine; enforce uniqueness per book
  - `slug` (text, required)
  - `content` (richText) - use the default Lexical editor from `editor: lexicalEditor({})`

### Registration

- Register both collections in `src/payload.config.ts`.
- Keep the rich text editor configuration aligned with the chapter editor and browser importer by using one shared Lexical node registry.
- Apply consistent access, ownership, draft, and version settings to both collections from the start.
- Keep one admin component path convention (`./components/...`) across collections to avoid import map mismatches.

## Phase 2: Browser-Only EPUB Import

Goal: turn an uploaded `.epub` into canonical `books` and `chapters` records entirely in the browser.

### Client Component

**File:** `src/components/admin/books/EpubImporter.tsx`

### UI State

- Include `'use client';` at the top.
- Render an `<input type="file" accept=".epub" />`.
- Track progress states such as `Idle`, `Parsing`, `Uploading Images`, `Uploading Chapter X`, `Finalizing`, `Done`, `Failed`, `Canceled`, and `Retrying`.

### Import Lifecycle

- Treat each upload as an import batch with a stable `importBatchId` so retries can resume or dedupe instead of duplicating records.
- Create the book in an `importing` or staging state first, then mark it complete only after all chapters and media have been written successfully.
- Keep partial imports visible as recoverable failures instead of silently promoting them to finished books.

### Processing Flow

1. Import `epubjs`.
2. On file select, instantiate `const book = ePub(file)`.
3. Wait for `book.ready`.
4. Read metadata from `book.loaded.metadata`.
5. Generate a URL-friendly slug and resolve collisions with the existing randomized slug policy if needed.
6. `POST` to `/api/books` with `credentials: 'include'` and store the returned `doc.id`.
7. Read the spine via `book.loaded.spine`.
8. Iterate through `spine.spineItems` sequentially with a `for...of` loop, not `Promise.all`.
9. Add a deliberate micro-delay such as `await new Promise(res => setTimeout(res, 150))` at the end of each chapter iteration to reduce locking and rate-limit pressure.

### Chapter HTML and Image Handling

For each chapter:

- Load the raw HTML string with `book.load(item.href)`.
- Parse the HTML string with the browser's native `DOMParser`.
- Find all `<img>` tags.
- For each image:
  - Resolve the relative `src` against the current chapter href before asking EPUB.js for the asset.
  - Try `book.archive.getBlob(resolvedSrc)` first.
  - If that fails because of relative path issues, use `book.archive.createUrl(resolvedSrc)` and then `fetch(url).then(r => r.blob())`.
  - If the extracted asset is not in the current Media upload mime allowlist, either convert it client-side or skip it with a warning.
  - Wrap the blob in `FormData`.
  - Use `formData.append('file', imageBlob, stableFilename)` so Payload receives the expected file field and a stable filename.
  - Derive `alt` from the EPUB image metadata or chapter context so the Media record passes validation.
  - Explicitly append `alt` to the multipart payload (for example, `formData.append('alt', derivedAlt)`) because Media validation requires it.
  - `POST` to `/api/media` with `credentials: 'include'` so the active admin session is recognized.
  - Replace the `img.src` in the DOM with the returned Cloudflare R2 URL.

### Cleanup and Lexical Conversion

Before chapter creation:

- Strip out all `<style>`, `<script>`, `<iframe>`, `<object>`, and `<embed>` tags, and remove event-handler attributes such as `onload` and `onclick`.
- Normalize and validate all `href`/`src` values with a protocol allowlist (`http`, `https`, `mailto`, `tel`, and relative URLs), rejecting `javascript:`, unknown protocols, and unsafe `data:` payloads.
- Remove `class` and `style` attributes only when they are layout-only and do not carry semantic meaning.
- Unwrap wrapper `<div>` elements only when they are semantically empty; do not flatten structure that would alter reading order or destroy lists, tables, figures, or notes.
- Serialize the cleaned DOM back to an HTML string.

Convert that HTML in the browser using the Lexical import path:

- Parse the cleaned HTML string with `DOMParser`.
- Pass the DOM into `@lexical/html`'s `$generateNodesFromDOM`.
- Build the temporary Lexical editor using the same shared rich-text node schema as the chapter editor, and keep that node registry centralized instead of inferring the schema from a bare default editor.
- Serialize the editor state with `editor.getEditorState().toJSON()`.

Finally:

- `POST` the chapter data to `/api/chapters` with the Lexical JSON content, the `book` ID, and the chapter `order` index.

### Import Success Criteria

- The Vercel timeout must not be triggered because all heavy lifting happens in the browser.
- The 150ms throttle must reduce database/network locking pressure.
- Images inside the EPUB must upload into the Payload Media library and render in the chapter content.
- Original EPUB styles must be stripped so the frontend can apply its own typography.
- Partial imports must remain recoverable through the import batch id, rather than producing silent half-finished books.

## Phase 3: Book-Centric Admin Shell, Preview, and Manual Authoring

Goal: make Payload itself the primary book management and authoring UI, without relying on EPUB processing.

### Book Shell

- Build a book-centric admin shell around the `Books` collection.
- Keep `Chapters` as a separate collection in the data model, but manage them from the book screen.
- Use custom admin components to group chapters under the current book and hide the raw chapter collection from the main navigation.
- Provide tabs or panels for Details, Chapters, Preview, History, and Export.

### Preview Mode

Preview mode lives inside the same book shell from this phase. It is not a separate preview UI.

Recommended preview behavior:

- Show the uploaded or authored book as a read-only book experience.
- Render the cover, title, author, TOC, chapter count, import status, and source metadata together.
- Show the book content in read-only Lexical mode using the same node schema as the editor.
- Group chapters under the book so the preview feels like a single publication.
- Provide chapter jump links, search, and source/import history.
- Keep the preview read-only and do not expose editor controls there.
- Lazy-load chapter bodies for large books and virtualize long chapter lists.
- Surface missing media or failed chapter import warnings instead of hiding them.
- If a book has been published, clearly indicate whether the preview is showing draft or published content.

### Native Authoring

Goal: support direct book creation and editing in the admin UI using native Payload and Lexical behavior.

Recommended authoring behavior:

- Let users create and manage books directly in Payload without going through EPUB import.
- Use the native Payload Lexical editor for chapter content editing.
- Make chapter creation, reordering, duplication, and deletion available from the book screen.
- Treat the book shell as the primary authoring surface; the raw chapter collection can remain secondary.

### Data Boundaries

- Treat manual books and imported books as separate origins, even though they share the same collections.
- Add an `origin` or `sourceMode` field so the UI knows whether a book is `manual`, `epub-imported`, or `synced`.
- Enable versions and drafts on both `Books` and `Chapters` so authors can compare revisions and roll back changes.
- Reserve explicit sync metadata now: `sourceType`, `sourceId`, `sourceHash`, `sourceVersion`, `importBatchId`, and `syncStatus` on `books`, plus `chapterSourceKey`, `chapterSourceHash`, and `manualEditedAt` on `chapters`.
- Make `(book, order)` the canonical chapter sort key and enforce it as unique per book using both application validation and a database-level composite unique index migration.
- Manual books should not be forced through EPUB logic unless the user explicitly chooses that path.

## Phase 4: Updates, Conflict Resolution, and EPUB Export

Goal: support MEAP-style updates, reimports, conflict resolution, and export while preserving manual edits.

### Policy

- Never auto-overwrite a manually edited book with an incoming EPUB.
- Treat new EPUB uploads as proposals or draft revisions until a user reviews them.
- If a book already has manual edits, show a conflict resolver instead of applying the import silently.
- If the source removes a chapter, mark it as stale or removed and let the user decide whether to delete it.
- Export should always use the current canonical state, not the original upload.

### Update Flow

1. Detect the source change through a file hash, source id, or MEAP revision id.
2. Import into a draft or staging version tied to an `importBatchId` so retries are safe.
3. Match chapters by stable source keys first, then by slug, order, and title as fallback.
4. Highlight conflicts at the chapter level before considering field-level merges.
5. Let the user keep current content, accept incoming content, merge selectively, or skip the chapter.
6. Publish only after the resolver is approved.

### What the System Should Support

- A chapter-level diff view at minimum, with field-level diff later if needed.
- Import manifests so a reimport can map a new EPUB back to the previous chapters.
- Sync status badges such as `clean`, `pending`, `conflicted`, and `diverged`.
- A source-link panel showing the last import, last export, and upstream source id.
- An EPUB export action from both published and draft states, with explicit user choice.

### Technical Notes

- Track metadata such as `sourceType`, `sourceId`, `sourceHash`, `sourceVersion`, `importBatchId`, and `lastImportedAt`.
- Add per-chapter keys such as `chapterSourceKey`, `chapterSourceHash`, and `manualEditedAt` so the diff engine can match content across reimports.
- Use Payload versions and drafts to stage imports and preserve historical revisions.
- Add abort, retry/backoff, and resume behavior so long imports can recover without reuploading already-confirmed media or chapters.
- Persist fine-grained checkpoints per import batch (chapter checkpoint and media checkpoint) using stable keys so retries skip already-created chapters and already-uploaded media.
- Keep the import path and export path separate so neither becomes a hidden side effect of the other.
- If a manual book later gets EPUB updates, keep the human-edited state visible and let the user choose whether to merge or replace.

### Suggested Data Model Additions

| Field | Where | Purpose |
| --- | --- | --- |
| `origin` | `books` | Distinguish `manual`, `epub-imported`, and `synced` books |
| `sourceType` | `books` | Identify EPUB upload, MEAP feed, or manual creation |
| `sourceHash` | `books` | Detect whether the upstream source changed |
| `sourceId` | `books` | Stable external identifier for MEAP or another source |
| `importBatchId` | `books` | Group chapters imported from one upload |
| `syncStatus` | `books` | Drive badges such as `clean`, `pending`, or `conflicted` |
| `chapterSourceKey` | `chapters` | Stable key used to match chapters during reimport |
| `chapterSourceHash` | `chapters` | Detect chapter-level changes |
| `manualEditedAt` | `chapters` | Mark chapters that diverged from imported content |

### Recommended Default Behavior

| Situation | Default behavior | Reason |
| --- | --- | --- |
| New EPUB uploaded for an imported book | Stage a draft and compare against the previous import | Avoid losing manual changes |
| EPUB uploaded for a manual book | Create an import proposal or a new synced revision | Keep manual workflow separate |
| Manual edits exist and a source update arrives | Open the conflict resolver UI | Prevent silent data loss |
| Export requested | Export the current canonical state | Make the output match what users see |

### Short Version

- Imported books and manual books should stay separate at the origin level.
- The admin UI should be book-centric, with chapters managed from the book screen.
- Preview mode should live inside that same book shell as a read-only tab or panel.
- The default policy should preserve human edits and require explicit replacement when an EPUB import would overwrite them.

## Testing and Validation

- Add unit coverage for slug collision handling, chapter path normalization, and sanitizer behavior.
- Add integration coverage for the import lifecycle, media upload validation, and chapter creation retry behavior.
- Add e2e coverage for the admin importer, book shell, preview mode, and conflict resolver flows.
- Add fixture-based parser fidelity tests with representative EPUBs that cover lists, tables, notes, nested images, and malformed markup.

## Implementation Notes From Phase 1 And 2

These are the concrete behaviors we verified while implementing the foundation and browser import flow. Keep them in mind so later phases do not reintroduce the same surprises.

- `book.loaded.spine` resolves to a `Spine` object, not a plain array. Iterate `spine.spineItems` or `book.spine.spineItems` instead of calling array methods directly on the loaded value.
- `epubjs` can trigger replacement and archive-related side effects in tests. For fixture-driven parser tests, keep the importer logic isolated and disable replacement behavior where needed so the test only validates content conversion.
- The importer must append `alt` when uploading media. Payload validation will reject file uploads that do not include accessible alt text.
- Relative EPUB asset paths are common. Resolve chapter-relative image `src` values before attempting upload, and fall back from `getBlob` to `createUrl(...)+fetch(...)` when archive lookups fail.
- Preserve semantic HTML metadata where possible. Strip unsafe tags, event handlers, and unsafe URL schemes, but do not blanket-remove class metadata if it carries meaning for later styling or preview rendering.
- The admin route redirects to `/admin`, and the unauthenticated admin title is `Login - Payload`. Frontend smoke tests should assert that behavior instead of the default scaffold homepage.
- Playwright HTML reports should stay static-only in local validation runs. Use `reporter: [['html', { open: 'never' }]]` so failures do not auto-open the interactive report page.
- Local Payload integration tests need the ignored `.payload/` directory for SQLite state. If the folder is missing, recreate it before running API-level smoke tests.
- TypeScript 6 warns about `baseUrl`. Keep `ignoreDeprecations: "6.0"` in `tsconfig.json` while the path alias setup still depends on it.
