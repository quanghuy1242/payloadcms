# EPUB Importer Polish Plan

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Snapshot](#2-current-architecture-snapshot)
3. [Active Bugs and Their Root Causes](#3-active-bugs-and-their-root-causes)
   - 3.1 [Link Node Validation Failures (`url` field invalid)](#31-link-node-validation-failures)
   - 3.2 [Image Upload Failures (`Cannot read properties of undefined (reading 'type')`)](#32-image-upload-failures)
   - 3.3 [Blob URLs Leaking into Chapter Content](#33-blob-urls-leaking-into-chapter-content)
   - 3.4 [Content Field Validation Failures (chapter skipped entirely)](#34-content-field-validation-failures)
   - 3.5 [Cover Upload Failures](#35-cover-upload-failures)
4. [Gap 1 — Internal Links Stripped (ToC becomes a flat list of dead text)](#4-gap-1--internal-links-stripped)
5. [Gap 2 — Flat Chapter Extraction (no section hierarchy)](#5-gap-2--flat-chapter-extraction)
6. [Gap 3 — Book Metadata Completeness](#6-gap-3--book-metadata-completeness)
7. [Gap 4 — Image Pipeline Robustness](#7-gap-4--image-pipeline-robustness)
8. [Gap 5 — Structural Content Fidelity](#8-gap-5--structural-content-fidelity)
9. [Gap 6 — Import Reliability and Partial Resumption](#9-gap-6--import-reliability-and-partial-resumption)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Executive Summary

The EPUB importer is functional for simple, prose-heavy books, but breaks on four recurring classes of problem that affect almost every technical or structured book in the test corpus:

1. **All internal links are silently dropped.** Any `<a href>` that is not a fully-qualified `http://` or `https://` URL — which includes every link inside a Table of Contents page, every cross-reference, every footnote anchor — is unwrapped into plain text by the Lexical walker. The result is that an HTML Table of Contents, which should be a clickable list of chapter links, is imported as an indistinguishable flat list of bare labels.

2. **Chapters are imported flat, ignoring the book's hierarchy.** EPUBs encode their structure in a ToC tree (`NCX`/`nav` element). Technical books like *Fast Python* have a 3-level hierarchy: 22 top-level spine files but 218 distinct ToC entries, with sections like `1.2.1` pointing to `#heading_id_6` within the same file. The current importer only iterates spine items — so all subsections within `01.htm` become part of one monolithic chapter. The ToC hierarchy data exists and is parsed, but it is only used to derive a breadcrumb string in the chapter title; it is never stored structurally.

3. **Active upload failures block large imports.** The `Cannot read properties of undefined (reading 'type')` error traces to `ensureSupportedMediaBlob` receiving `null` from an archive lookup, then attempting to access `.type` on the result before the null guard. Images in unsupported formats (WebP, GIF, SVG) also silently fail, and any chapter that has one or more failed images still attempts Lexical conversion with a broken DOM, which often produces a link node with a null URL that fails chapter validation entirely.

4. **Book metadata is sparse.** The `Books` collection stores title, author, cover, and import lifecycle fields but has no fields for language, description/synopsis, publisher, ISBN, publication date, or series. For non-English books (the corpus includes Vietnamese and English titles), the language field is especially important for correct typography, slugification, and content rendering.

This document enumerates every gap found during codebase analysis and live probe runs against all four EPUBs in `data/`, then proposes concrete implementation plans for each fix, categorized by risk and effort.

---

## 2. Current Architecture Snapshot

### Data model

```
Books (collection)
├── title, author, slug, cover (upload)
├── origin, sourceType, sourceHash, sourceId, sourceVersion
├── importStatus, importBatchId, importTotalChapters, importCompletedChapters
├── importStartedAt, importFinishedAt, importFailedAt, lastImportedAt
├── importErrorSummary
└── syncStatus, createdBy

Chapters (collection)
├── title, slug, book (rel→books), order
├── chapterSourceKey, chapterSourceHash, importBatchId, manualEditedAt
├── content (richText / Lexical)
└── createdBy
```

The `Chapters` collection has no `depth`, `parentChapter`, `sectionLevel`, `sectionId`, or `tocHref` fields. Order is a flat integer starting at 1.

### Import pipeline (browser-only)

The pipeline runs entirely in the browser to stay within Vercel's 4.5 MB body / 10 s timeout constraints:

```
EPUB file selected
  → epubjs opens file in-memory (base64 / ArrayBuffer)
  → book.loaded.navigation → flat ToC list (flattenTocItems)
  → book.loaded.spine → spine items array
  → Preflight: for each spine item
      section.load() → raw HTML
      resolveChapterTocMetadata() → best-match label from flat ToC
      estimateWordCountFromHTML()
  → createChapterBatches() → groups by MAX_CHAPTERS_PER_BATCH / MAX_WORDS_PER_BATCH
  → For each batch (up to MAX_PARALLEL_BATCHES in parallel):
      For each chapter:
        sanitizeChapterHTML() → clean HTML + warnings
        For each <img>:
          resolveEpubAssetPath()
          readArchiveBlob() → Blob
          ensureSupportedMediaBlob() → normalized Blob or null
          POST /api/media → uploaded media id + url
          img.setAttribute('data-lexical-upload-id', ...)
        convertHtmlToChapterLexicalState() → Lexical JSON
        isSubstantiveChapterContent() → skip if empty/nav
        POST/PATCH /api/chapters
```

### Key utility modules

| Module | Responsibility |
|--------|---------------|
| `src/utils/epubImport.ts` | HTML sanitization, ToC matching, URL validation, asset path resolution, hash functions, slug/title/alt derivation |
| `src/utils/epubLexical.ts` | HTML-to-Lexical recursive DOM walker |
| `src/components/admin/books/EpubImporter.tsx` | Browser-only React component orchestrating the pipeline |
| `scripts/epub-probe.ts` | Node.js test harness for offline validation of all EPUBs |

---

## 3. Active Bugs and Their Root Causes

### 3.1 Link Node Validation Failures

**Symptom:** `The following field is invalid: Content` / `link node failed to validate: The following fields are invalid: url`.

**Root cause:** This error comes from an older code path where the importer used `$generateNodesFromDOM` from `@lexical/html` to convert chapter HTML. That library creates `link` nodes for *all* `<a href>` tags regardless of protocol, including relative EPUB paths like `../Text/01.htm#pgfId-123`. Payload's link validator then rejects any link node whose `url` field is not an absolute HTTP(S) URL.

The current `htmlToPayloadLexical` walker in `epubLexical.ts` does not have this problem — it only calls `makeLink` for `http://`/`https://` URLs and silently unwraps everything else. As long as `EpubImporter.tsx` and `epubLexical.ts` do not import from `@lexical/html`, this error will not occur.

**Fix:** Confirm neither file imports from `@lexical/html`. The error logs in `docs/book.md` reflect an earlier codebase state. If the error reappears in a future refactor, the cause will be the same: a code path that passes relative EPUB hrefs into a Lexical link node without stripping them first.

---

### 3.2 Image Upload Failures

**Symptom:** `Skipped image N in chapter M: Cannot read properties of undefined (reading 'type')`.

**Current state:** `ensureSupportedMediaBlob` already has a null guard (`if (!blob) return null`) and this is covered by a regression test (`await expect(ensureSupportedMediaBlob(undefined)).resolves.toBeNull()`). The null guard was added after the bug was first observed and logged in `docs/book.md`. The error logs there are from an earlier codebase state.

**Remaining actual bug — empty MIME type blobs:** When epubjs returns a `Blob` for an image but the blob has no type (i.e., `blob.type === ""`), the current `ensureSupportedMediaBlob` logic silently drops the image:

```typescript
const normalizedMimeType = blob.type.toLowerCase()  // ""
if (MEDIA_UPLOAD_ALLOWED_MIME_TYPES.has(""))  // false — skip allowed check
if (!"".startsWith('image/'))  // true — not an image mime
return null  // silently dropped
```

This happens when `book.archive.createUrl(...) + fetch(...)` returns a blob without a `Content-Type` header, which occurs for resources that epubjs cannot classify. The image is silently skipped with the generic "Skipped image N" warning. In the *Fast Python* book, this affects virtually all embedded images because the chapter HTML contains blob URLs (see 3.3) that reference resources that epubjs can't re-fetch without the original file context.

**Fix:** Add magic-byte MIME sniffing when `blob.type` is empty or `application/octet-stream`, before deciding whether to skip or attempt conversion (see Gap 4 for the full implementation).

---

### 3.3 Blob URLs Leaking into Chapter Content

**Symptom:** Log lines `Chapter N: Removed unsafe src URL: blob:https://payload.quanghuy.dev/...`.

**Root cause:** During phase 1 (preflight), `section.load()` is called but `section.render()` is intentionally skipped. However, epubjs internally rewrites some image `src` attributes to blob URLs when `render()` is called implicitly by certain archive operations. If a chapter's `section.document` has already had its images rewritten to blob URLs before the importer reads `section.document.documentElement.outerHTML`, those blob URLs end up in `chapterHTML`.

The second `sanitizeChapterHTML` call later removes them (correctly), but by then the `<img>` DOM node has `src="blob:..."` which does not match the original path, so `resolveEpubAssetPath` cannot reconstruct the archive path and the image is lost entirely.

**Fix:** During the image upload loop in `processPreparedChapter`, query `chapterImages` from the freshly-parsed `chapterDocument` *before* any epubjs mutation. Specifically:

1. In `prepareChaptersForImport`, parse the raw HTML immediately after `section.load()` using `new DOMParser().parseFromString(html, 'text/html')` and extract both the sanitized HTML and the image `src` values **at that moment**, before storing `preparedChapter.chapterHTML`.
2. Store the raw (pre-sanitize) image source list alongside the chapter HTML in `PreparedChapter`, so the image loop in `processPreparedChapter` iterates those pre-epubjs-mutation paths rather than re-querying the DOM.

---

### 3.4 Content Field Validation Failures (chapter skipped entirely)

**Symptom:** `The following field is invalid: Content` / `Content is required`.

**Root cause A:** After all images fail to upload, `chapterHTMLWithUploadedImages` still contains the original relative `img src` attributes. The second `sanitizeChapterHTML` pass strips them (they fail the protocol allowlist). The resulting HTML has `<img>` tags with no `src`. The Lexical walker's `case 'img':` then falls through to `return []` because neither `data-lexical-upload-id` is set nor is the `src` an `https://` URL. If the chapter had *only* images (no text), `isSubstantiveChapterContent` returns `false` and the chapter is skipped.

**Root cause B:** `isSubstantiveChapterContent` currently counts a chapter as empty if it has no text nodes, no `upload` nodes, and no `block` nodes. A chapter consisting entirely of an image that failed to upload will be skipped.

**Fix for B:** Before marking a chapter as non-substantive due to image-only content, emit a stronger warning that distinguishes "navigation-only chapter" from "image-upload-failure chapter". Optionally, insert a placeholder upload node pointing to a sentinel so the chapter is created with a clear indication of the missing images rather than silently dropping it.

---

### 3.5 Cover Upload Failures

**Symptom:** `Cover upload failed for Fast Python. The import will continue without a cover image.`

**Root cause:** The EPUB cover is resolved from `book.loaded.cover`, which returns an object URL (blob URL) created by epubjs internally. When the importer tries to `fetch(objectURL)` and upload it as media, the fetch sometimes fails in the browser because the object URL was revoked or never properly created in the first place.

**Fix:** Use `book.archive.getBlob(coverPath)` directly after resolving the cover path from `book.loaded.metadata.cover` rather than relying on `book.loaded.cover`. The `readArchiveBlob` helper already implements multi-candidate-path blob resolution — apply the same logic to cover upload. Also, the cover's MIME type is often WebP (especially for modern EPUB3 files), which is not in `MEDIA_UPLOAD_ALLOWED_MIME_TYPES`. Add WebP to the allowed types or convert via `canvas.toBlob` before uploading.

---

## 4. Gap 1 — Internal Links Stripped

### Problem description

Every book's Table of Contents page consists of anchor links to other chapters or sections within the book. For example, in *Fast Python*'s `toc.htm`:

```html
<a href="../Text/01.htm#pgfId-1016250">An urgent need for efficiency</a>
<a href="../Text/01.htm#pgfId-1011845">How bad is the data deluge?</a>
```

These `href` values are relative cross-document links with fragment identifiers. The current Lexical walker in `epubLexical.ts` has this exact logic for `<a>` tags:

```typescript
case 'a': {
  const href = el.getAttribute('href') ?? ''
  // Case 1: external URL → link node
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return [makeLink(href, walkChildren(el, ctx), newTab)]
  }
  // Case 2: id-only anchor with no href and empty children → drop
  if (!el.hasAttribute('href') && el.hasAttribute('id') && !el.textContent?.trim()) {
    return []
  }
  // Case 3: everything else (fragment, relative, etc.) → unwrap
  return walkChildren(el, ctx)
}
```

Case 3 silently unwraps all internal links. The text content is preserved but the navigation target is lost. The entire ToC page becomes a flat sequence of plain-text paragraphs: `"E-book extras by Neil Gaiman and Dave McKean"`, `"EPIGRAPH"`, `"I."`, `"CORALINE DISCOVERED THE DOOR..."` — indistinguishable from regular prose and with no clickable navigation.

Additionally, `sanitizeLexicalLinkURLValue` returns `null` for fragment-only anchors (`#chapter1`), which means even if a link node were created, Payload's link validator would reject it.

### Why this is hard

To turn a relative EPUB href like `../Text/01.htm#heading_id_4` into a meaningful Payload link, you need a mapping from EPUB spine hrefs to the Payload chapter record IDs that were created during import. This mapping does not exist at the time the Lexical walker runs, because the walker runs *before* or *during* chapter creation — it cannot look up future IDs.

### Option A: two-pass import with a spine-to-chapter map

**Phase 1 (current):** Pre-flight pass creates all chapter records and builds a `spineHref → chapterId` lookup map.

**Phase 2 (new):** Re-process chapters that contain internal links, replacing each `href` with the resolved Payload chapter URL (e.g., `/books/[book-slug]/chapters/[chapter-slug]` or an API link).

This requires:

1. **Store ToC metadata on the Chapter record.** Add `tocHref` (the raw EPUB href) and `spineHref` fields to the `Chapters` collection so the map can be reconstructed without re-parsing the EPUB.

2. **Build the map during preflight.** After all chapters are created, build `Map<normalizedSpineHref, { chapterId, chapterSlug, bookSlug }>`. The normalized href strips the fragment: `OEBPS/Text/01.htm#heading_id_4` maps to the chapter whose `tocHref` or `spineHref` matches `OEBPS/Text/01.htm`.

3. **Two sub-cases for internal links:**

   - **Same-spine-file fragment link** (`../Text/01.htm#heading_id_4`): Resolve the file part to the chapter slug, then rewrite the href as `#heading_id_4` (an in-page anchor pointing to a heading ID in the rendered chapter). This requires that the heading elements in the rendered chapter carry `id` attributes matching those in the EPUB — which they do because the Lexical walker preserves heading content but drops `id` attributes from the heading element itself. **Fix:** Emit heading `id` attributes when walking `h1`–`h4` by using a `data-section-id` field or by injecting the EPUB `id` as a custom node property that the renderer can convert to an HTML `id`.

   - **Cross-chapter link** (`../Text/02.htm`): Rewrite as an absolute path to the chapter page: `/books/[book-slug]/[chapter-slug]` or as a Payload internal link using `linkType: 'internal'` pointing to the chapter record.

4. **Modify `makeLink` to support internal links.** The `makeLink` factory currently hardcodes `linkType: 'custom'`. Add a second variant:

   ```typescript
   const makeInternalLink = (
     relationTo: string,
     value: string | number,
     children: AnyNode[],
   ): AnyNode => ({
     type: 'link',
     version: 3,
     format: '',
     indent: 0,
     direction: 'ltr',
     fields: {
       linkType: 'internal',
       doc: { relationTo, value },
       newTab: false,
     },
     children,
   })
   ```

5. **Sequence change in `EpubImporter.tsx`:**

   ```
   Phase A: Create all chapters with internal links temporarily stripped (current behavior)
   Phase B: Build spineHref → chapterRecord map from API response
   Phase C: PATCH each chapter whose Lexical state contains strip-marker nodes,
            replacing them with resolved internal links
   ```

   This avoids the circular dependency problem (links need IDs that don't exist yet).

### Alternative: sentinel node + render-time resolution ✅ **Preferred**

Rather than a two-pass PATCH over the REST API, store the unresolved EPUB href in a custom Lexical node during import and resolve it in the frontend renderer at read time.

**Why this is preferred:** The two-pass approach requires extra REST calls after every import (one PATCH per chapter that contains internal links), adds state management complexity (what if the second pass is interrupted?), and introduces a new failure mode. The sentinel approach has a much simpler failure mode: unresolved links fall back to plain text, which is exactly the current behavior. The resolution logic moves to the renderer, which already has access to the book's chapter list and can do the lookup without any network calls if the chapter list is co-fetched with the page.

**How it works:**

1. During the Lexical walk, instead of unwrapping internal `<a href>` tags, emit a custom sentinel node:

   ```typescript
   const makeEpubInternalLink = (epubHref: string, children: AnyNode[]): AnyNode => ({
     type: 'epub-internal-link',
     version: 1,
     fields: { epubHref },
     children,
   })
   ```

2. In `case 'a':`, add a fourth case before the unwrap fallthrough:

   ```typescript
   // Case 4: relative or fragment link → sentinel node
   if (href && !href.startsWith('javascript:')) {
     return [makeEpubInternalLink(href, walkChildren(el, ctx))]
   }
   ```

3. Register `epub-internal-link` as a custom Lexical node in `createChapterLexicalEditor()` so Payload does not reject it at validation time.

4. In the frontend chapter renderer, walk the Lexical tree and replace `epub-internal-link` nodes: normalize the `epubHref` to its spine-file component (strip fragment), look it up against the pre-fetched chapter list (matched by `spineHref`), and render a Next.js `<Link>` to that chapter's URL, preserving the fragment as a hash if present.

5. If no matching chapter is found (e.g., a link to an appendix that was not imported), fall back to rendering the children as plain text — same as today.

This keeps the import pipeline stateless and single-pass. The sentinel node is invisible to the reader when unresolved and becomes a proper link once the renderer has the chapter list.

### Data model changes needed

Add to `Chapters` collection:

```typescript
{
  name: 'tocHref',
  type: 'text',
  admin: { position: 'sidebar', readOnly: true },
},
{
  name: 'spineHref',
  type: 'text',
  index: true,
  admin: { position: 'sidebar', readOnly: true },
},
```

The `spineHref` field already exists conceptually in `PreparedChapter.spineHref` but is never saved to the database. Persisting it enables the two-pass link rewrite and future EPUB re-import matching.

---

## 5. Gap 2 — Flat Chapter Extraction

### Problem description

The EPUB ToC is a tree. *Fast Python* has **24 spine files** but **218 ToC entries**. The ToC maps multiple subsections to heading anchors within the same spine file:

```
[navPoint-17] Chapter 1  → OEBPS/Text/01.htm
  [navPoint-18] 1.1  → OEBPS/Text/01.htm#heading_id_4
  [navPoint-19] 1.2  → OEBPS/Text/01.htm#heading_id_5
    [navPoint-20] 1.2.1  → OEBPS/Text/01.htm#heading_id_6
    [navPoint-21] 1.2.2  → OEBPS/Text/01.htm#heading_id_7
```

The current importer iterates spine items only. So `01.htm` becomes one chapter titled `"1 An urgent need for efficiency in data processing"`. Subsections 1.1, 1.2, 1.2.1, etc. are present as headings in the chapter content but are not individually addressable, filterable, or navigable in Payload.

For a book like Coraline (a simple novel), this is fine — each chapter is one spine file. But for technical/educational books with subsections, the granularity is lost.

### Option A: Section-level chapters (structural split)

Split each spine file at heading boundaries according to the ToC. For `01.htm` with 6 ToC entries, create 6 chapter records: one for each heading range `[heading_id_4, heading_id_5)`, `[heading_id_5, heading_id_6)`, etc.

**Pros:** Full navigability. Each subsection is a queryable chapter record.

**Cons:**
- Complex DOM slicing: need to extract the HTML between two heading anchors within the same document.
- Chapter `order` numbering becomes non-integer (e.g., `1.2.1` or `0101_06`).
- The existing flat `order` field (integer) does not support fractional or hierarchical ordering.
- The `Chapters` collection would need a `depth` and `parentChapter` field, plus a DB migration.
- Batch splitting means 218 chapter POST requests for one book, which is slow over the browser REST path.

**Implementation sketch for DOM slicing:**

```typescript
function sliceAtHeading(
  doc: Document,
  anchorId: string,
  nextAnchorId: string | null,
): string {
  const startEl = doc.getElementById(anchorId)
  if (!startEl) return ''

  const fragment = doc.createDocumentFragment()
  let current: Node | null = startEl
  
  while (current) {
    const next = current.nextSibling
    if (
      nextAnchorId &&
      current.nodeType === 1 &&
      (current as Element).id === nextAnchorId
    ) break
    fragment.appendChild(current.cloneNode(true))
    current = next
  }

  const wrapper = doc.createElement('div')
  wrapper.appendChild(fragment)
  return wrapper.innerHTML
}
```

### Option B: Hierarchical chapter model (data model change)

Store chapters with depth and parent relationship, without splitting spine files. Each ToC entry becomes a chapter record, but "section" chapters have a `parentChapter` relationship and their content is either a slice of the parent spine's HTML or empty (just a navigation node).

**Data model additions:**

```typescript
// Chapters collection additions
{
  name: 'depth',
  type: 'number',
  defaultValue: 0,
  admin: { position: 'sidebar', description: 'ToC depth: 0=top-level chapter, 1=section, 2=subsection' },
},
{
  name: 'parentChapter',
  type: 'relationship',
  relationTo: 'chapters',
  admin: { position: 'sidebar' },
},
{
  name: 'sectionAnchorId',
  type: 'text',
  admin: { position: 'sidebar', description: 'HTML id of the heading element that starts this section in the parent spine file' },
},
```

The import would create one "container" chapter record per top-level spine item (as today), then create child chapter records for each ToC subsection pointing to `parentChapter`. The content of child chapters could be empty (navigation only) or sliced from the parent.

**Pros:** The data model is richer and the ToC tree is fully preserved. Frontend can render a collapsible navigation tree.

**Cons:** Requires a DB migration. The `enforceUniqueChapterOrderHook` needs updating to enforce uniqueness within sibling scope, not globally per book.

### Option C: Preserve depth as metadata only (minimal change)

The lowest-effort option: do not change the data model or split content. Instead:

1. Add `tocDepth` (number, 0–N) and `tocParentHref` (text) fields to `Chapters`.
2. During import, populate these from the flattened ToC.
3. Use `tocDepth` in the admin UI and frontend to indent chapter list items visually.
4. The frontend reader can render an indented ToC using `tocDepth` without splitting content.

This is the recommended first step because it requires only:
- Two new fields on `Chapters` (one migration).
- A small change to `prepareChaptersForImport` to carry `tocDepth` from `flattenTocItems`.
- A UI update to the chapter list view to indent by depth.

**Recommended immediate action (Option C)**, with Option B as a follow-on for books where section-level navigation is important.

### Migration needed

```typescript
// New migration file: YYYYMMDD_add_chapter_depth.ts
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.schema.alterTable('chapters', (table) => {
    table.integer('toc_depth').defaultTo(0).notNullable()
    table.text('toc_parent_href').nullable()
    table.text('spine_href').nullable()
    table.text('toc_href').nullable()
  })
}
```

---

## 6. Gap 3 — Book Metadata Completeness

### Missing fields in the `Books` collection

The EPUB OPF (Open Packaging Format) metadata provides fields that are not currently stored:

| EPUB OPF field | epubjs access | Proposed Payload field | Notes |
|---|---|---|---|
| `dc:description` | `book.loaded.metadata` then `.description` | `description` (textarea) | Synopsis/blurb for display |
| `dc:language` | `book.loaded.metadata.language` | `language` (text, BCP 47) | Critical for CJK/Vietnamese text |
| `dc:publisher` | `book.loaded.metadata.publisher` | `publisher` (text) | |
| `dc:date` | `book.loaded.metadata.pubdate` | `publicationDate` (date) | |
| `dc:identifier` (ISBN) | `book.loaded.metadata.identifier` | `isbn` (text, indexed) | Multiple identifiers possible |
| `dc:subject` | `book.loaded.metadata.subject` | `subjects` (array of text) | Genre/topic tags |
| `belongs-to-collection` (EPUB3) | metadata object | `seriesName` / `seriesPosition` | Book series support |
| none | computed | `totalWordCount` (number) | Sum of chapter word counts |
| none | computed | `chapterCount` (number) | Denormalized count |
| none | metadata | `epubVersion` (select: `2`, `3`) | For rendering decisions |

### Language field impact

The `language` field is particularly important:
- `slugify` in `createImportedBookSlug` already passes `locale: 'vi'` hardcoded. This is wrong for English books (it causes Vietnamese diacritic stripping to be applied to English text). The locale should come from the EPUB `language` field.
- Vietnamese books (`Gatsby Vi Dai`, `The Wild Robot Escapes vi`) need `locale: 'vi'`. English books need `locale: 'en'`. The importer should pass the detected language to `slugify`.

### Field additions to `Books` collection

```typescript
{
  name: 'description',
  type: 'textarea',
  admin: { description: 'Synopsis or blurb from the EPUB metadata or manually authored.' },
},
{
  name: 'language',
  type: 'text',
  admin: {
    position: 'sidebar',
    description: 'BCP 47 language tag (e.g., "en", "vi", "ja"). Affects slug generation and rendering.',
  },
},
{
  name: 'publisher',
  type: 'text',
  admin: { position: 'sidebar' },
},
{
  name: 'publicationDate',
  type: 'date',
  admin: { position: 'sidebar' },
},
{
  name: 'isbn',
  type: 'text',
  index: true,
  admin: { position: 'sidebar', description: 'Primary ISBN or dc:identifier from EPUB.' },
},
{
  name: 'subjects',
  type: 'array',
  admin: { description: 'Genre/topic tags from EPUB dc:subject.' },
  fields: [{ name: 'subject', type: 'text', required: true }],
},
{
  name: 'totalWordCount',
  type: 'number',
  admin: { position: 'sidebar', readOnly: true },
},
{
  name: 'epubVersion',
  type: 'select',
  options: ['2', '3'],
  admin: { position: 'sidebar', readOnly: true },
},
```

### Import changes

In `EpubImporter.tsx`, when building the initial book POST payload:

```typescript
const metadata = await book.loaded.metadata
const bookLanguage = typeof metadata.language === 'string'
  ? metadata.language.toLowerCase().trim()
  : 'en'

const bookPayload = {
  title: importedTitle,
  author: metadata.creator,
  language: bookLanguage,
  description: metadata.description ?? null,
  publisher: metadata.publisher ?? null,
  publicationDate: metadata.pubdate ?? null,
  isbn: metadata.identifier ?? null,
  subjects: Array.isArray(metadata.subject)
    ? metadata.subject.map((s: string) => ({ subject: s }))
    : metadata.subject ? [{ subject: metadata.subject }] : [],
  // ... existing fields
}
```

Also fix slug locale:

```typescript
export const createImportedBookSlug = (title: string, language = 'en'): string => {
  const normalizedTitle = trimToNull(title)
  if (!normalizedTitle) return ''
  return slugify(normalizedTitle, {
    lower: true,
    strict: true,
    locale: language.startsWith('vi') ? 'vi' : language.startsWith('ja') ? 'ja' : 'en',
    trim: true,
  })
}
```

---

## 7. Gap 4 — Image Pipeline Robustness

### Current state

`MEDIA_UPLOAD_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])`

`ensureSupportedMediaBlob` already has a canvas conversion fallback (`convertImageBlobToJpeg`) that handles most raster formats not in the allowlist by converting them to JPEG via `HTMLCanvasElement`. This means WebP and GIF images *are* theoretically handled in a browser context. The actual remaining gaps are:

### Remaining Gap A — Empty MIME type blobs are silently dropped

When a blob has `type === ""` (which happens when epubjs fetches an image blob from an `createUrl + fetch` path without a proper Content-Type header), the canvas conversion path is never reached:

```typescript
// Current code in ensureSupportedMediaBlob:
const normalizedMimeType = blob.type.toLowerCase()  // ""
// MEDIA_UPLOAD_ALLOWED_MIME_TYPES.has("") → false
// "".startsWith('image/') → false → return null (image dropped!)
```

The fix is magic-byte sniffing to identify the format when `blob.type` is empty:

```typescript
export const sniffMimeTypeFromBytes = (buffer: ArrayBuffer): string | null => {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  const riff = String.fromCharCode(...Array.from(bytes.slice(0, 4)))
  const webp = String.fromCharCode(...Array.from(bytes.slice(8, 12)))
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  const header = new TextDecoder().decode(bytes.slice(0, 64))
  if (header.trimStart().startsWith('<svg') || header.includes('<?xml')) return 'image/svg+xml'
  return null
}

// In ensureSupportedMediaBlob, after the null guard:
let resolvedMimeType = blob.type.toLowerCase()
if (!resolvedMimeType || resolvedMimeType === 'application/octet-stream') {
  const headerBytes = await blob.slice(0, 64).arrayBuffer()
  resolvedMimeType = sniffMimeTypeFromBytes(headerBytes) ?? resolvedMimeType
}
```

### Remaining Gap B — SVG is replaced with a text placeholder

The Lexical walker's `case 'svg':` returns `[makeParagraph([makeText('[Image: SVG diagram]', 2)])]`. SVG images, which are common in technical books for diagrams, equations, and code flow charts, are permanently lost.

**Fix:** Upload inline SVG content as a media file. SVG blobs can be uploaded to Payload if the Media collection's `mimeTypes` config allows `image/svg+xml`. Update the Media collection:

```typescript
mimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
```

Then in the Lexical walker's `case 'svg':`, serialize the SVG element to a Blob and pass it to the image upload pipeline via a new `uploadInlineSvg` callback:

```typescript
case 'svg': {
  // If a callback for inline SVG upload is provided (browser context), use it
  if (ctx.uploadInlineSvg) {
    const svgBlob = new Blob([el.outerHTML], { type: 'image/svg+xml' })
    const uploadedId = await ctx.uploadInlineSvg(svgBlob)
    if (uploadedId) return [makeUploadNode(ctx, 'media', uploadedId, 'SVG diagram')]
  }
  // Fallback: text placeholder
  return [makeParagraph([makeText('[Image: SVG diagram]', 2)])]
}
```

This requires extending `WalkContext` with an optional async callback and making `walkNode` async, which is a larger refactor. Phase this into Tier 2.

### Remaining Gap C — WebP uploads preserved as JPEG with quality loss

Even though WebP is handled via canvas conversion to JPEG, the quality loss is unnecessary. Sharp (used by Payload's image resizer) supports WebP natively. Add `'image/webp'` to `MEDIA_UPLOAD_ALLOWED_MIME_TYPES` directly to skip canvas roundtripping:

```typescript
export const MEDIA_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',  // add: Sharp handles WebP, no conversion needed
])

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',  // add
}
```

---

## 8. Gap 5 — Structural Content Fidelity

### 8.1 Footnotes and Endnotes

EPUBs represent footnotes in two patterns:
- **EPUB2**: a `<a href="notes.xhtml#fn1">1</a>` reference in the body, and a matching `<p id="fn1">` or `<li id="fn1">` in a separate notes spine file.
- **EPUB3**: `<a epub:type="noteref" href="#fn1">1</a>` inline, and `<aside epub:type="footnote" id="fn1">` either in the same file or in a companion file.

Currently both patterns result in the footnote content being dropped: EPUB2 reference links are unwrapped (Gap 1), and EPUB3 `epub:type` attributes are ignored by the sanitizer.

**Goal:** When a reader hovers over a footnote reference number in the rendered chapter, a popover shows the footnote text inline — matching the experience of physical books and modern e-readers.

**Import side — custom `footnote` Lexical block:**

Add a `footnote` block type to `createChapterLexicalEditor()`:

```typescript
BlockFeature({
  blocks: [
    {
      slug: 'footnote',
      fields: [
        { name: 'marker', type: 'text', required: true },   // "1", "*", "†"
        { name: 'content', type: 'textarea', required: true }, // footnote text
      ],
    },
  ],
})
```

And a corresponding `footnote-ref` inline node (registered as a custom Lexical node):

```typescript
const makeFootnoteRef = (marker: string, noteId: string): AnyNode => ({
  type: 'footnote-ref',
  version: 1,
  fields: { marker, noteId },
  children: [],
})
```

During the Lexical walk, the import pipeline performs a pre-pass over the chapter HTML before walking:

1. Collect all `<aside epub:type="footnote" id="...">` elements, record their `id` → text content mappings, and remove them from the DOM. For EPUB2, collect the notes from the companion spine file during the preflight step.
2. Walk the remaining DOM. When a `<a epub:type="noteref">` or a superscript `<a>` whose href matches a known note id is encountered, emit a `footnote-ref` node carrying the `marker` text and a `noteId`.
3. After the walk, append one `footnote` block node at the end of the root for each collected note, keyed by `noteId`.

**Renderer side — hover popover:**

The `footnote-ref` node renders as a superscript with a `data-note-id` attribute. The `footnote` block renders as a hidden `<span>` or `<div role="note">` element. A lightweight renderer hook wires them together:

```tsx
// FootnoteRef renderer component
export const FootnoteRefRenderer = ({ node }: { node: FootnoteRefNode }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <sup
          className="footnote-ref cursor-help underline decoration-dotted"
          data-note-id={node.fields.noteId}
        >
          {node.fields.marker}
        </sup>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm text-sm">
        <FootnoteContentLookup noteId={node.fields.noteId} />
      </PopoverContent>
    </Popover>
  )
}
```

`FootnoteContentLookup` finds the corresponding `footnote` block node in the same Lexical tree (passed via context) and renders its `content` field. No network call is needed — the note text is already embedded in the chapter's Lexical state.

On touch devices where hover is unavailable, the popover triggers on tap; on keyboard, it triggers on focus. This makes the behavior accessible without JS-only hover state.

**Fallback for unsupported books:** If no `epub:type` attributes are present (EPUB2 without semantic markup), footnotes remain as plain text links that scroll the reader to the notes section at the bottom of the chapter, which is still a usable experience.

### 8.2 Sidebars and Callout Boxes

The current walker maps `<aside>` to `makeQuote(...)`. This is semantically wrong — a blockquote represents quoted speech, whereas an aside is a sidebar or callout.

Payload's Lexical editor supports custom block features. A `callout` or `sidebar` block could be added:

```typescript
// In createChapterLexicalEditor():
BlockFeature({
  blocks: [
    {
      slug: 'callout',
      fields: [
        { name: 'type', type: 'select', options: ['note', 'tip', 'warning', 'sidebar'] },
        { name: 'content', type: 'richText' },
      ],
    },
  ],
})
```

Until then, distinguish `<aside epub:type="sidebar">` from `<aside epub:type="footnote">` in the walker:
- Sidebar → `makeQuote` (existing behavior, acceptable approximation)
- Footnote/endnote → inline note text (see 8.1)
- No epub:type → `makeQuote` (current behavior)

### 8.3 Horizontal Rules / Typographic Separators

Many books use `<hr>` to indicate a scene break or section separator. The current walker's `case 'hr': return []` drops these silently.

**Impact:** Scene breaks in novels (e.g., Coraline's chapter separations) are lost. Readers cannot see where scenes end.

**Proposed fix:** Represent `<hr>` as a paragraph containing a Unicode em-dash separator (`—`) or as a custom `divider` Lexical block. The simplest approach:

```typescript
case 'hr':
  return [makeParagraph([makeText('* * *', 2)])] // italic asterism
```

This is lossless enough for most reading experiences and requires no custom node.

### 8.4 Code Block Language Detection

The current `makeCodeBlock(code, 'plaintext')` always uses `'plaintext'`. In technical books, the language is often inferrable:

1. From `<code class="language-python">` — common in modern EPUBs generated by tools like Asciidoctor or Sphinx.
2. From `<pre data-language="python">` — Manning books use this pattern.
3. From the file type being processed — a Python book defaults to Python.

**Fix:** Update `case 'pre':` to extract language from class attributes or data attributes:

```typescript
case 'pre': {
  const codeEl = el.querySelector('code')
  const langClass = (codeEl ?? el).className
  const langMatch = langClass.match(/(?:language-|lang-)(\w+)/)
  const dataLang = el.getAttribute('data-language') ?? el.getAttribute('data-lang')
  const language = dataLang ?? langMatch?.[1] ?? 'plaintext'
  // ... rest of pre handling
  return [makeCodeBlock(code, language)]
}
```

### 8.5 Tables with Complex Structure

The current table walker handles `colspan` and `rowspan` correctly, but does not handle:
- `<caption>` elements (table titles)
- Nested tables (rare but present in some books)
- Tables used for layout purposes (which should be unwrapped to their content)

**Fix:** Add `case 'caption':` to the walker, converting it to a paragraph before the table. For layout tables (detected by having no `<th>` elements and only one column), unwrap to flat content.

### 8.6 Definition Lists

`<dl>/<dt>/<dd>` are used in technical books for term definitions and API references. The current walker falls through to `default: return walkChildren(el, ctx)` for `<dl>`, `<dt>`, `<dd>`, which collapses all term/definition pairs into a flat sequence of text nodes.

**Fix:** Map `<dl>` to a bullet list where each `<dt>` becomes a bold list item and each `<dd>` becomes an indented continuation:

```typescript
case 'dl': {
  const items: AnyNode[] = []
  let value = 1
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase()
    if (tag === 'dt') {
      const boldCtx = { ...ctx, format: ctx.format | 1 }
      items.push(makeListItem(value++, walkChildren(child as Element, boldCtx)))
    } else if (tag === 'dd') {
      items.push(makeListItem(value++, walkChildren(child as Element, { ...ctx, listDepth: ctx.listDepth + 1 })))
    }
  }
  return items.length > 0 ? [makeList('bullet', 'ul', items, ctx.listDepth)] : []
}
```

---

## 9. Gap 6 — Import Reliability and Partial Resumption

### Current state

The importer tracks progress via `importBatchId`, `importCompletedChapters`, and `importStatus`. If the browser tab is closed mid-import, the `importStatus` remains `'importing'` and subsequent re-uploads of the same EPUB will detect the existing book via `findExistingBooksBySourceHashes` and resume by calling `findExistingChaptersByBook`.

However, there are several reliability gaps:

### 9.1 Chapter retry does not re-upload failed images

The `processPreparedChapterWithRetry` retry loop re-runs `processPreparedChapter`, which re-queries the image list from `chapterDocument`. However, if the first attempt uploaded some images and set `data-lexical-upload-id` on the DOM nodes, the second attempt starts from the *original* `preparedChapter.chapterHTML` (re-parsed fresh), so the upload IDs from the first attempt are lost and the same images are re-uploaded (causing duplicate media records) or fail again.

**Fix:** Pass `chapterDocument` (the mutated DOM with upload IDs already set) through retry attempts rather than re-parsing from scratch each time.

### 9.2 Media cache is in-memory only

The `mediaCache: Map<string, UploadedMedia>` is a closure variable in `EpubImporter`. If the page refreshes, the cache is gone. On resume, `findExistingMediaByFilename` recovers media correctly (it checks by stable filename), but the recovery happens per-image within the chapter loop, adding latency.

**Enhancement:** Pre-warm the media cache at resume time by fetching all existing media with filenames matching the `sourceHash` namespace prefix before starting the import loop.

### 9.3 No fine-grained checkpoint per chapter

The `importCompletedChapters` field tracks a count but not *which* chapters succeeded. On resume, the importer calls `findExistingChaptersByBook` which returns all existing chapters sorted by order. The `existingChaptersByOrder` map prevents duplicate creation but does not skip chapters that previously failed (they are not in the map since they were never created).

This means failed chapters are always retried on resume, which is correct behavior. However, there is no way for the user to see *which specific chapters* failed. `importErrorSummary` only stores a count.

**Enhancement:** Store a structured `importFailureLog` JSON field on `Books` that records per-chapter failures: `[{ order: 5, reason: "Image upload failed", timestamp: "..." }]`. This allows the admin UI to show a per-chapter status list rather than just a total skipped count.

### 9.4 Race condition in parallel batch processing

`createChapterBatches` splits chapters into batches. Up to `MAX_PARALLEL_BATCHES = 5` batches run concurrently. Each batch updates `importCompletedChapters` via `updateBookProgress`. Because these PATCH requests are concurrent, the `completedChapters` counter can race — two batches may both read `importCompletedChapters = 4` and both write `importCompletedChapters = 5`, effectively losing one count.

**Fix:** Change `importCompletedChapters` updates to use an increment operation (`$inc` semantics) rather than a full-document patch. With Payload's REST API, one approach is to run the batch PATCH for chapter counts sequentially (after all batches complete) rather than after each batch.

### 9.5 Abort signal not propagated to book state PATCH

When the user clicks "Cancel", `abortControllerRef.current.abort()` is called. The `processPreparedChapter` call eventually throws an `AbortError`, which propagates up. However, the `patchBookFailureState` call in the catch block does *not* distinguish between user cancellation and an actual failure — it sets `importStatus: 'failed'` for a canceled import. This misleads the UI into showing a failed book that the user intentionally canceled.

**Fix:** Add `'canceled'` to `BOOK_IMPORT_STATUSES` and patch `importStatus: 'canceled'` when the AbortError source is a user abort:

```typescript
} catch (error) {
  if (isAbortError(error)) {
    await patchBookCanceledState(bookID)
  } else {
    await patchBookFailureState(bookID, message)
  }
}
```

---

## 10. Implementation Roadmap

The fixes are grouped into three tiers by effort and impact.

### Tier 1: Bug fixes (immediate — no data model changes)

These require changes only to `epubImport.ts`, `epubLexical.ts`, and `EpubImporter.tsx`. They fix active failures and can ship in one PR.

| Item | File(s) | Effort |
|------|---------|--------|
| 3.2: Magic-byte MIME sniffer for empty-type blobs | `epubImport.ts` | S |
| 3.3: Extract image src values before epubjs mutates the DOM | `EpubImporter.tsx` | S |
| 3.5: Cover blob resolution using `readArchiveBlob` helper | `EpubImporter.tsx` | S |
| 7C: Add WebP directly to allowed MIME types (avoid canvas roundtrip) | `epubImport.ts` | XS |
| 8.3: `<hr>` → asterism paragraph instead of empty | `epubLexical.ts` | XS |
| 8.4: Language detection for code blocks | `epubLexical.ts` | S |
| 8.6: `<dl>/<dt>/<dd>` mapping | `epubLexical.ts` | S |
| 9.5: Distinguish cancel from failure in book status | `EpubImporter.tsx`, `Books.ts` | S |

**PR 1 checklist:**
- [ ] Magic-byte sniffer for empty-type blobs (`sniffMimeTypeFromBytes` in `epubImport.ts`)
- [ ] Add WebP to `MEDIA_UPLOAD_ALLOWED_MIME_TYPES` and `MIME_EXTENSION_MAP`
- [ ] Extract `chapterImageSrcs` list during preflight pass (before DOM mutation)
- [ ] Cover resolution via archive blob path
- [ ] `<hr>` → `* * *` paragraph
- [ ] Code block language from class/data attribute
- [ ] `<dl>` handling
- [ ] `importStatus: 'canceled'` distinction
- [ ] `epub-probe.ts` updated to validate all of the above

### Tier 2: Data model additions (one migration, moderate effort)

These require a DB migration and matching changes to collection schemas, the importer, and the probe script.

| Item | Migration needed | Effort |
|------|-----------------|--------|
| 6.3: Book metadata fields (language, description, publisher, ISBN, etc.) | Yes | M |
| 5 Option C: `tocDepth`, `tocParentHref`, `spineHref`, `tocHref` on Chapters | Yes | M |
| 4 Internal link: persist `spineHref` on Chapters | Part of above | XS |
| 9.5: `'canceled'` import status | Minor enum change | XS |

**PR 2 checklist:**
- [ ] Migration: add `language`, `description`, `publisher`, `publicationDate`, `isbn`, `subjects`, `totalWordCount`, `epubVersion` to `Books`
- [ ] Migration: add `tocDepth`, `tocParentHref`, `spineHref`, `tocHref` to `Chapters`
- [ ] Update `EpubImporter.tsx` to populate new metadata fields from `book.loaded.metadata`
- [ ] Fix `createImportedBookSlug` to accept a `language` parameter and use it in `slugify`
- [ ] Populate `tocDepth` from `flattenTocItems` result during chapter creation
- [ ] Populate `spineHref` and `tocHref` from `PreparedChapter` during chapter creation
- [ ] Update `epub-probe.ts` to print depth and metadata for each chapter
- [ ] Update chapter list admin view to indent by `tocDepth`

### Tier 3: Internal link resolution (significant effort, two-pass import)

This is the most impactful change for reading experience but also the most architecturally complex.

| Step | Description | Effort |
|------|-------------|--------|
| T3-1 | Persist `spineHref` on Chapters (done in Tier 2) | — |
| T3-2 | Build `spineHref → { chapterId, chapterSlug, bookSlug }` map after all chapters are created | S |
| T3-3 | Identify chapters whose Lexical content contains internal link candidates (hrefs pointing to EPUB paths) | M |
| T3-4 | Two-pass PATCH: rewrite internal link hrefs to resolved Payload paths | M |
| T3-5 | Add `makeInternalLink` node factory in `epubLexical.ts` | S |
| T3-6 | Modify Lexical walker to emit a sentinel placeholder node for internal links (instead of unwrapping) | M |
| T3-7 | Add heading `id` propagation to `makeHeading` for in-page anchor targets | S |
| T3-8 | Update `isSubstantiveChapterContent` to recognize sentinel nodes | XS |
| T3-9 | Frontend: resolve sentinel nodes or `linkType: 'internal'` doc links at render time | M |

**PR 3 checklist:**
- [ ] Sentinel node type `epub-internal-link` in Lexical walker (carries original EPUB href, text content)
- [ ] Post-import two-pass PATCH utility function in `EpubImporter.tsx`
- [ ] `makeInternalLink` with `linkType: 'internal'` pointing to chapter relationship
- [ ] Heading walker emits `data-section-id` for fragment resolution
- [ ] Frontend chapter renderer resolves internal link doc refs

---

## 11. Testing Strategy

### Existing tooling

`scripts/epub-probe.ts` provides offline validation of the Lexical conversion for all EPUBs in `data/`. It reports:
- `OK` — converted and validated
- `SKIP` — non-substantive (empty or nav-only)
- `ISSUES` — conversion errors or unsupported node types

Run: `pnpm tsx scripts/epub-probe.ts`

### Additions to `epub-probe.ts`

1. **Report metadata extraction** for each EPUB:
   ```
   === Coraline (Neil G Gaiman).epub ===
   Metadata: title="Coraline", author="Neil Gaiman", language="en", publisher="HarperCollins"
   ```

2. **Report ToC depth statistics**:
   ```
   ToC depth: max=1, avg=0.8, spine=35, toc_entries=22
   ```

3. **Report internal link count** per chapter:
   ```
   Chapter 5 (Contents): 27 internal links, 0 external links
   ```

4. **Validate that no blob: URLs remain** in the Lexical output (already exists in `validateLexicalState`).

5. **Validate that `<hr>` elements produce asterism paragraphs** rather than empty output.

6. **Validate that code blocks carry a language tag** when the source `<pre>` has a language class.

### Unit tests in `tests/int/`

Add `tests/int/epubLexical.int.spec.ts`:

```typescript
describe('htmlToPayloadLexical', () => {
  it('converts <hr> to asterism paragraph', () => {
    const state = htmlToPayloadLexical('<p>Scene 1</p><hr /><p>Scene 2</p>')
    const children = state.root.children
    expect(children[1].type).toBe('paragraph')
    expect((children[1] as any).children[0].text).toBe('* * *')
  })

  it('strips blob: URLs from img src', () => {
    const state = htmlToPayloadLexical('<img src="blob:https://example.com/abc" />')
    // Should produce no upload node (no data-lexical-upload-id set)
    expect(state.root.children.length).toBe(1) // single empty paragraph
  })

  it('converts <dl><dt><dd> to list', () => {
    const state = htmlToPayloadLexical('<dl><dt>Term</dt><dd>Definition</dd></dl>')
    const list = (state.root.children[0] as any)
    expect(list.type).toBe('list')
    expect(list.children.length).toBe(2)
  })

  it('detects code block language from class', () => {
    const state = htmlToPayloadLexical('<pre><code class="language-python">x = 1</code></pre>')
    const block = (state.root.children[0] as any)
    expect(block.type).toBe('block')
    expect(block.fields.language).toBe('python')
  })

  it('preserves internal link text when href is relative', () => {
    const state = htmlToPayloadLexical('<a href="../Text/01.htm#section">Chapter 1</a>')
    // Text is preserved (not dropped), even if link is unwrapped
    const text = collectLexicalText(state)
    expect(text).toContain('Chapter 1')
  })
})
```

Add `tests/int/epubImport.int.spec.ts` (or extend the existing `epub-import-utils.int.spec.ts`):

```typescript
describe('sniffMimeTypeFromBytes', () => {
  it('identifies PNG from magic bytes', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMimeTypeFromBytes(pngHeader.buffer)).toBe('image/png')
  })

  it('identifies WebP from RIFF header', () => {
    const webpHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (dummy)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ])
    expect(sniffMimeTypeFromBytes(webpHeader.buffer)).toBe('image/webp')
  })

  it('returns null for unknown bytes', () => {
    const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    expect(sniffMimeTypeFromBytes(unknown.buffer)).toBeNull()
  })
})

describe('ensureSupportedMediaBlob', () => {
  // Null guard already tested in existing spec
  it('identifies PNG blob with empty MIME type via sniffing', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...new Array(56).fill(0)])
    const blob = new Blob([pngHeader], { type: '' }) // empty MIME type
    const result = await ensureSupportedMediaBlob(blob)
    expect(result?.mimeType).toBe('image/png')
  })
})

describe('createImportedBookSlug', () => {
  it('uses vi locale for Vietnamese titles', () => {
    const slug = createImportedBookSlug('Gatsby Vĩ Đại', 'vi')
    expect(slug).toBe('gatsby-vi-dai')
  })

  it('uses en locale for English titles', () => {
    const slug = createImportedBookSlug('Fast Python', 'en')
    expect(slug).toBe('fast-python')
  })
})
```

### E2E test additions

Add to `tests/e2e/`:

```typescript
// book-import.e2e.spec.ts
test('imports Coraline epub and creates chapters with correct depth', async ({ page }) => {
  // Navigate to admin, upload Coraline, wait for import to complete
  // Assert: book record exists with language='en', chapter count >= 10
  // Assert: no chapter has importStatus='failed'
  // Assert: chapter 5 (Contents) has internal links as text, not blank
})
```

---

*This document reflects the state of the codebase as of April 2026 based on analysis of all four EPUBs in `data/` and a complete review of `EpubImporter.tsx`, `epubLexical.ts`, `epubImport.ts`, `Books.ts`, `Chapters.ts`, and `epub-probe.ts`.*
