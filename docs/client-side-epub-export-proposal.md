# Client-Side EPUB Export: Validation and Revised Implementation Plan

> Context reviewed on 2026-04-29 against the current codebase, not against the generated proposal.
>
> Current export path:
> `src/components/admin/books/DownloadEpubButton.tsx`
> → GraphQL mutation `generateEpub`
> → signed URL
> → `src/app/api/epub-download/[token]/route.ts`
> → `lexicalToHtml()`
> → `epub-gen-memory`
>
> Current import reference path:
> `src/components/admin/books/EpubImporter.tsx`
> → `src/utils/epubPipeline.ts`

## 1. Decision

The generated proposal is directionally correct on one major point: binary EPUB assembly should move out of the serverless route and into the browser.

The generated proposal is not implementation-ready as written. It makes several incorrect assumptions about the current serializer, media resolution, internal-link fidelity, and ZIP-library behavior.

The recommended implementation is:

1. Keep authorization and export data shaping on the server via new GraphQL queries.
2. Move chapter serialization, asset downloads, and EPUB ZIP assembly into a browser-only pipeline.
3. Add an EPUB-specific serializer instead of treating `src/utils/lexicalToHtml.ts` as a drop-in export engine.
4. Roll out behind a feature flag while keeping the legacy route as a fallback until the new path is verified.

## 2. Validation of the Generated Proposal

### 2.1 What the proposal got right

- The current server route does all heavy work in one invocation and is exposed to timeout and memory pressure. This is visible in `src/app/api/epub-download/[token]/route.ts`.
- `src/utils/epubPipeline.ts` is a good architectural reference for long-running browser-side work: async generator, progress events, and cancellation.
- `src/utils/lexicalToHtml.ts` is browser-safe today. It uses standard JavaScript only and no Node or DOM APIs.

### 2.2 What is wrong or incomplete

#### A. `mediaIds` alone are not enough for client export

The generated proposal says the browser can:

1. fetch chapter Lexical JSON,
2. run `lexicalToHtml()` with no media lookup,
3. rewrite image URLs later,
4. separately download assets from `mediaIds`.

That does not match the current serializer contract.

`src/utils/lexicalToHtml.ts` resolves upload nodes like this:

- if `mediaById` contains a record with `optimizedUrl` or `url`, it emits `<img src="...">`
- if no media record is available, it emits a placeholder paragraph like `[Image: ...]`

That means the proposed “convert first, rewrite image src later” flow cannot work with the current serializer. Without a media map, the serializer does not leave behind a rewritable `<img>` tag.

#### B. Renaming chapter files will break `epub-internal-link` nodes unless export resolves them

Imported books can contain `epub-internal-link` nodes. The current serializer emits raw `fields.epubHref` back into `<a href="...">`.

If export writes chapters as generated archive names such as `chapter-01.xhtml`, then raw imported hrefs like `../Text/chapter02.xhtml#s3` will no longer match the files inside the new EPUB unless export explicitly resolves them.

The repo already has the normalization rules documented in `docs/internal-link-impl-plan.md`. Export should reuse the same `chapterSourceKey`-based resolution idea when producing archive-local links.

#### C. The proposal assumes direct browser image fetches will “just work”

The repo generates public R2 URLs when `R2_PUBLIC_BASE_URL` is configured in `src/payload.config.ts`, but CORS policy for those asset responses is infrastructure-level, not enforced in this repo.

The proposal treats this as low-risk. It is not safe to assume that. The implementation must either:

- verify that browser `GET` from the CMS origin to the public R2 origin is allowed, or
- fail fast with a clear error telling the operator to fix bucket/CDN CORS.

#### D. `JSZip streamFiles` is not a full streaming download solution

The generated proposal implies that `streamFiles: true` can be used as a scalable answer for large books.

That is not what the library guarantees. `streamFiles: true` reduces per-entry buffering, but `generateAsync()` still returns a complete result object such as a `Blob` or `Uint8Array`. It does not change this architecture into a true incremental browser download pipeline.

This matters because the proposal understates large-book browser memory risk.

#### E. The proposal removes legacy code too early

Deleting the current mutation and route immediately is unnecessary risk. The codebase already has tests around:

- `generateEpub`
- `DownloadEpubButton`
- `epubExport` token helpers

The new export path should ship behind a flag first, then remove the legacy path once the new path has proven compatibility with real books.

#### F. The proposal ignores book cover and EPUB 3 navigation requirements

The current server export does not appear to include the book cover, and the generated proposal keeps that omission.

It also proposes only `toc.ncx` in examples. For EPUB 3, `nav.xhtml` should be the primary navigation document. `toc.ncx` can be included as a compatibility fallback, but it should not be the only navigation artifact in a new implementation.

#### G. The proposal does not account for current media access rules

`publishedMediaReadAccess` in `src/utils/access.ts` does not explicitly model chapter rich-text uploads as readable references. After ownership is established at the book level, the export resolver should fetch needed media with `overrideAccess: true` and return only whitelisted export-safe fields.

That is safer and more deterministic than making the browser perform ad hoc media lookups.

## 3. Recommended Architecture

### 3.1 Layer decisions

- GraphQL ownership checks and export data shaping belong in `src/graphql/queries/`.
- EPUB packaging helpers belong in `src/utils/`.
- Browser orchestration belongs in a browser-only utility in `src/utils/`.
- The admin progress UI belongs in `src/components/admin/books/`.

Do not put export orchestration in a collection config, route handler, or React component.

### 3.2 High-level flow

```text
Admin button
  -> fetch manifest query (book metadata + chapter index)
  -> iterate paged chapter-export query
  -> for each page:
       - collect media map from server payload
       - serialize Lexical -> EPUB XHTML
       - fetch asset blobs
       - add files to ZIP
  -> build package files (container.xml, content.opf, nav.xhtml, optional toc.ncx, CSS)
  -> generate Blob
  -> trigger browser download
```

### 3.3 Why this is better than the generated plan

- It keeps the server responsible for auth and data shaping only.
- It avoids the broken “serialize without media, rewrite later” assumption.
- It resolves imported internal links correctly.
- It supports incremental chapter fetching instead of assuming one giant GraphQL response.
- It preserves a safe rollback path.

## 4. Data Contract

The client should not fetch the full export in one request.

Use two custom GraphQL queries:

1. `bookExportManifest`
2. `bookExportChunk`

This is a better contract than one all-in-one query because internal-link resolution needs a global chapter index, while content and media payloads are the heavy part and should be paged.

### 4.1 Query 1: `bookExportManifest(bookId: ID!)`

Purpose:

- ownership/auth gate
- lightweight metadata
- complete chapter index for link resolution and filename planning

Suggested response shape:

```graphql
query BookExportManifest($bookId: ID!) {
  bookExportManifest(bookId: $bookId) {
    filename
    pageSize
    totalChapters
    totalPages
    book {
      id
      title
      slug
      author
      description
      language
      publisher
      publicationDate
      isbn
      epubVersion
      updatedAt
      cover {
        id
        filename
        mimeType
        url
        optimizedUrl
        alt
      }
    }
    chapterIndex {
      id
      order
      title
      slug
      chapterSourceKey
    }
  }
}
```

Resolver notes:

- Reuse the same owner-only rule as `generateEpubResolver`.
- Fetch the book with `overrideAccess: false` and `req`.
- Fetch all sibling chapter summaries sorted by `order`.
- Return only fields needed for export.
- `pageSize` should be server-defined, not user-defined. Start with `25`.

### 4.2 Query 2: `bookExportChunk(bookId: ID!, page: Int!, limit: Int!)`

Purpose:

- fetch actual chapter content in pages
- fetch the media records referenced in that page

Suggested response shape:

```graphql
query BookExportChunk($bookId: ID!, $page: Int!, $limit: Int!) {
  bookExportChunk(bookId: $bookId, page: $page, limit: $limit) {
    page
    totalPages
    chapters {
      id
      order
      title
      content
    }
    media {
      id
      filename
      mimeType
      url
      optimizedUrl
      alt
    }
  }
}
```

Resolver notes:

- Perform the same owner check again. Do not trust the client to only call chunks for allowed books.
- Fetch chapter docs sorted by `order`, paginated.
- Use `collectUploadIdsFromLexicalState()` from `src/utils/lexicalToHtml.ts` to derive the page’s referenced media IDs.
- Fetch media with `overrideAccess: true` after ownership is already proven.
- Return only whitelisted fields.

### 4.3 Why not fetch media records lazily from the browser

Do not have the client call `/api/media/:id` for every image.

That would:

- multiply request count,
- depend on media access behavior that was not built for this use case,
- duplicate ownership logic,
- make retry behavior worse.

The export chunk query should already contain the media manifest needed for that page.

## 5. New Utility Surface

### 5.1 `src/utils/lexicalToEpubHtml.ts` (new)

Create a new pure serializer instead of extending `lexicalToHtml.ts` with export-only conditionals.

Reason:

- the current serializer is generic HTML output for the existing server route
- EPUB export needs archive-local asset paths, XHTML wrappers, and internal-link resolution
- mixing both contracts into one file will make the serializer harder to reason about

Suggested API:

```ts
import type { SerializedEditorState } from 'lexical'

export type EpubImageRef = {
  id: string
  archivePath: string
  alt: string
}

export type LexicalToEpubHtmlOptions = {
  resolveImage: (uploadId: string) => EpubImageRef | null
  resolveInternalHref: (epubHref: string) => string | null
}

export function lexicalToEpubHtml(
  state: SerializedEditorState,
  options: LexicalToEpubHtmlOptions,
): string
```

Behavior by node type:

- `text`, `paragraph`, `heading`, `list`, `quote`, `table`, `code`, `linebreak`, `horizontalrule`: same conceptual handling as current serializer
- `upload`: emit archive-local `<img src="../images/...">` or a readable fallback paragraph if unresolved
- `epub-internal-link`: rewrite to local chapter filename plus fragment when resolvable
- `footnote-ref`, `Footnote` blocks, `epub-callout`, `youtube`: preserve current semantic output, but keep emitted markup XHTML-safe

### 5.2 `src/utils/epubPackage.ts` (new)

Pure helpers for package file generation.

Suggested exports:

```ts
export function buildContainerXml(): string
export function buildContentOpf(input: BuildContentOpfInput): string
export function buildNavDocument(input: BuildNavDocumentInput): string
export function buildTocNcx(input: BuildTocNcxInput): string
export function buildChapterDocument(input: BuildChapterDocumentInput): string
export function buildSharedStylesheet(): string
export function sanitizeArchivePathSegment(value: string): string
```

Responsibilities:

- manifest entries
- spine order
- metadata
- navigation documents
- XHTML chapter wrappers
- shared stylesheet

### 5.3 `src/utils/epubExport.ts` (repurpose gradually)

This file currently contains token helpers for the legacy route.

After the new client export path is stable, use this file for shared export-domain helpers such as:

- `buildExportFilename(bookSlug: string): string`
- `createChapterArchiveName(order: number, slug: string | null, title: string): string`
- `createMediaArchiveName(id: string, filename: string, mimeType?: string | null): string`
- `splitEpubHref()`
- `normalizeEpubPath()`
- `spineHrefFromSourceKey()`
- `resolveEpubHrefToArchivePath()`

The internal-link normalization rules already exist in `docs/internal-link-impl-plan.md` and should be reused here.

### 5.4 `src/utils/epubExportPipeline.ts` (new, browser-only)

This is the client orchestrator.

Suggested event contract:

```ts
export type ExportPhase =
  | 'Idle'
  | 'Fetching Manifest'
  | 'Fetching Chapters'
  | 'Serializing Chapters'
  | 'Downloading Assets'
  | 'Packaging'
  | 'Done'
  | 'Failed'
  | 'Canceled'

export type EpubExportEvent =
  | { type: 'phase'; phase: ExportPhase }
  | { type: 'status'; message: string }
  | { type: 'chapters-known'; totalChapters: number }
  | { type: 'chapter-serialized'; completed: number; total: number }
  | { type: 'asset-downloaded'; completed: number; total: number }
  | { type: 'warning'; message: string }
  | { type: 'done'; blob: Blob; filename: string }
```

Suggested config:

```ts
export type EpubExportPipelineConfig = {
  bookId: string | number
  signal: AbortSignal
}
```

## 6. Internal-Link Resolution During Export

This is a required part of the implementation, not a later enhancement.

### 6.1 Input available today

The manifest query can expose:

- `chapterIndex[].chapterSourceKey`
- `chapterIndex[].order`
- `chapterIndex[].title`
- `chapterIndex[].slug`

That is enough to build an export-time resolution map.

### 6.2 Resolution rule

For each `epub-internal-link` node:

1. split raw `epubHref` into `{ path, fragment }`
2. if `path === ''`, keep it as `#fragment`
3. match `path` against `chapterSourceKey` spine hrefs using the normalization rules already documented in `docs/internal-link-impl-plan.md`
4. rewrite the href to the archive filename for the matched chapter
5. append `#fragment` unchanged

Example:

```text
stored node href: ../Text/chapter02.xhtml#s3
matched chapterSourceKey spine href: OEBPS/Text/chapter02.xhtml
derived archive filename: chapter-0002-my-chapter.xhtml
exported href: chapter-0002-my-chapter.xhtml#s3
```

If no match is found:

- emit a warning event
- preserve visible text
- output a non-link fallback such as `<span>...</span>` instead of a broken href

## 7. Packaging Rules

### 7.1 Target format

Target EPUB 3 as the primary format.

Package entries should include:

```text
mimetype
META-INF/container.xml
OEBPS/content.opf
OEBPS/nav.xhtml
OEBPS/toc.ncx                # compatibility fallback, recommended
OEBPS/styles/book.css
OEBPS/chapters/*.xhtml
OEBPS/images/*
```

### 7.2 Chapter file naming

Do not rely on chapter slug alone because chapter slugs are not unique per book by contract.

Use a deterministic archive name such as:

```text
chapter-0001-introduction.xhtml
chapter-0002-the-forest.xhtml
```

Suggested rule:

```ts
chapter-${String(order).padStart(4, '0')}-${safeSlug}.xhtml
```

### 7.3 Navigation files

Generate:

- `nav.xhtml` as the primary EPUB 3 navigation document
- `toc.ncx` as a compatibility fallback

Both should point to the generated archive chapter filenames, not raw source hrefs.

### 7.4 Cover handling

If the book has `cover`, include it when possible.

Rules:

- prefer `optimizedUrl` if it preserves a supported raster format for EPUB readers
- otherwise use `url`
- add it to the manifest with `properties="cover-image"`
- include metadata references required by the chosen OPF structure

If the cover fetch fails:

- emit a warning
- continue export without a cover image

### 7.5 CSS

Ship a minimal shared stylesheet inside the EPUB.

This is needed so exported custom content remains readable:

- callouts
- footnotes
- tables
- code blocks

Keep CSS minimal and reader-safe. Do not depend on JavaScript inside the EPUB.

## 8. ZIP Strategy

### 8.1 Library choice for v1

Use `JSZip` for the first implementation.

Reason:

- straightforward API
- adequate for expected export sizes
- lower implementation risk than introducing a more specialized streaming ZIP writer immediately

### 8.2 Constraints to document honestly

Do not claim that `JSZip` makes export truly streamed end-to-end.

Reality for v1:

- chapter content and asset fetches can be incremental
- the final ZIP still becomes a complete browser object before download
- very large books can still pressure browser memory

### 8.3 Compression settings

Use:

- `STORE` for already compressed assets such as JPEG and PNG
- `DEFLATE` for XHTML, XML, and CSS

This reduces wasted CPU during packaging.

### 8.4 Future optimization path

Only if profiling shows UI stalls or memory problems:

- move the packaging phase into a dedicated Worker, or
- replace the zipper implementation with a worker-capable streaming-oriented library

That optimization is optional for v1. The architecture above keeps it possible later.

## 9. Browser Pipeline Walkthrough

### Phase 1: Fetch manifest

1. call `bookExportManifest(bookId)`
2. build:
   - `chapterIndex`
   - chapter archive filename map
   - internal-link resolver map
3. emit `chapters-known`

### Phase 2: Iterate chapter chunks

For `page = 1..totalPages`:

1. call `bookExportChunk(bookId, page, pageSize)`
2. build a page-local `mediaById` map from the query response
3. for each chapter:
   - serialize `content` with `lexicalToEpubHtml()`
   - wrap it with `buildChapterDocument()`
   - add `OEBPS/chapters/<filename>` to the zip
   - emit `chapter-serialized`
4. add discovered media records to a global asset registry keyed by media ID

### Phase 3: Download assets

For each unique asset in the registry:

1. choose `optimizedUrl ?? url`
2. fetch with `AbortSignal`
3. if successful, add `OEBPS/images/<archiveName>` to the zip
4. if unsuccessful:
   - emit warning
   - leave the serialized chapter fallback text in place

### Phase 4: Package metadata files

Generate and add:

- `mimetype`
- `META-INF/container.xml`
- `OEBPS/content.opf`
- `OEBPS/nav.xhtml`
- `OEBPS/toc.ncx`
- `OEBPS/styles/book.css`

### Phase 5: Finalize

1. generate zip blob
2. emit `done`
3. caller triggers browser download via `URL.createObjectURL()`

## 10. UI Plan

### 10.1 `src/components/admin/books/EpubExporter.tsx` (new)

This should mirror the import UI pattern:

- phase label
- status text
- serialized chapter count
- downloaded asset count
- warnings list
- cancel button

The component should remain a thin shell:

- create `AbortController`
- iterate `runEpubExportPipeline()`
- update React state
- trigger blob download on `done`

### 10.2 `src/components/admin/books/DownloadEpubButton.tsx` (modify)

Current behavior:

- call mutation
- redirect browser to signed URL

New behavior:

- open or render `EpubExporter`
- keep the legacy button path behind a feature flag during rollout

Do not move pipeline logic into the button component.

## 11. Rollout Plan

### Phase 1: Introduce client export path

Create:

- `src/graphql/queries/BookExportManifest/`
- `src/graphql/queries/BookExportChunk/`
- `src/utils/lexicalToEpubHtml.ts`
- `src/utils/epubPackage.ts`
- `src/utils/epubExportPipeline.ts`
- `src/components/admin/books/EpubExporter.tsx`

Modify:

- `src/graphql/queries/index.ts`
- `src/components/admin/books/DownloadEpubButton.tsx`

Keep:

- `src/graphql/mutations/GenerateEpub/`
- `src/app/api/epub-download/[token]/route.ts`
- current token helpers

Gate the new path with a client-safe feature flag such as:

```ts
const USE_CLIENT_EPUB_EXPORT =
  process.env.NEXT_PUBLIC_CLIENT_EPUB_EXPORT === 'true'
```

### Phase 2: Verify on real books

Verify with:

- imported books with images
- imported books with `epub-internal-link` nodes
- manual books with upload nodes
- books with and without covers

### Phase 3: Remove legacy server export

After the new path is stable:

- remove `generateEpub` mutation
- remove the signed download route
- delete token-signing code from `src/utils/epubExport.ts`
- update tests accordingly

## 12. Testing Plan

### 12.1 Unit tests

Add targeted tests for:

- `src/utils/lexicalToEpubHtml.ts`
- `src/utils/epubPackage.ts`
- export-time internal-link resolution helpers

Important cases:

- upload node resolves to local archive asset path
- unresolved upload node degrades cleanly
- `epub-internal-link` fragment-only href stays local
- `epub-internal-link` cross-chapter href rewrites to archive filename
- callout, footnote, and YouTube nodes preserve readable output

### 12.2 Integration tests

Add resolver tests for:

- `bookExportManifest`
- `bookExportChunk`

Cover:

- unauthorized user
- non-owner user
- chapter ordering
- media deduplication within a chunk
- whitelisted media field exposure only

### 12.3 Component tests

Add tests for `EpubExporter`:

- progress updates as events stream in
- cancel aborts active export
- warning rendering
- success triggers a blob download

### 12.4 End-to-end validation

Use at least one real imported EPUB from `data/` to validate round-trip behavior:

1. import the EPUB
2. export it with the new client path
3. inspect the produced `.epub` in an EPUB reader or validator
4. verify:
   - chapters open
   - images render
   - ToC works
   - internal links navigate

## 13. Migration and Env Impact

Migration required: no.

Reason:

- no collection shape changes are required for this plan

Env update required: optional.

Only add env if the rollout uses `NEXT_PUBLIC_CLIENT_EPUB_EXPORT`.

Build-mode exception applies: no.

## 14. Cross-Repo Impact

No required changes are needed in:

- the Better Auth service repo
- the `next-blog` repo

Reason:

- export is initiated from the Payload admin
- auth already exists through the current Payload session
- the generated EPUB is built entirely client-side after authorized CMS queries

Optional later follow-up:

- if the public or private reader experience in `next-blog` ever needs “download this book as EPUB”, reuse the same manifest/chunk export contract instead of rebuilding export logic there

## 15. File Change Plan

### Create

- `src/graphql/queries/BookExportManifest/index.ts`
- `src/graphql/queries/BookExportManifest/resolver.ts`
- `src/graphql/queries/BookExportChunk/index.ts`
- `src/graphql/queries/BookExportChunk/resolver.ts`
- `src/utils/lexicalToEpubHtml.ts`
- `src/utils/epubPackage.ts`
- `src/utils/epubExportPipeline.ts`
- `src/components/admin/books/EpubExporter.tsx`

### Modify

- `src/graphql/queries/index.ts`
- `src/components/admin/books/DownloadEpubButton.tsx`
- `tests/int/download-epub-button.int.spec.ts`
- add new resolver, utility, and component tests

### Keep for phase 1, delete later

- `src/graphql/mutations/GenerateEpub/index.ts`
- `src/graphql/mutations/GenerateEpub/resolver.ts`
- `src/app/api/epub-download/[token]/route.ts`
- token logic in `src/utils/epubExport.ts`

## 16. Final Recommendation

Implement client-side export, but do not implement the generated proposal literally.

The critical corrections are:

1. use a paged server manifest/chunk contract
2. create an EPUB-specific serializer
3. resolve `epub-internal-link` nodes against `chapterSourceKey`
4. treat direct asset fetch CORS as an explicit prerequisite
5. keep the legacy route during rollout

That is the smallest plan that is both safer than the current server route and detailed enough to implement cleanly in this codebase.

## 17. Serializer Audit: Lexical -> EPUB XHTML

This section is the implementation checklist for the serializer work. It is the easiest place for a weak plan to lose fidelity.

The export implementation should not begin with ZIP assembly. It should begin with a serializer audit.

### 17.1 Source of truth for chapter content shape

Review these files together before writing `lexicalToEpubHtml.ts`:

- `src/utils/chapterRichText.ts`
- `src/utils/chapterLexicalNodes.ts`
- `src/features/epub-heading/nodes/EpubHeadingNode.ts`
- `src/features/epub-internal-link/nodes/EpubInternalLinkNode.ts`
- `src/features/epub-callout/nodes/EpubCalloutNode.ts`
- `src/features/epub-footnote-ref/nodes/FootnoteRefNode.tsx`
- `src/utils/epubLexical.ts`
- `src/utils/lexicalToHtml.ts`

Important note:

- `chapterRichText.ts` defines the enabled editing features.
- `epubLexical.ts` defines what imported EPUB HTML can become in stored Lexical JSON.
- `lexicalToHtml.ts` is only a partial reference, not the EPUB serializer contract.

### 17.2 Node-by-node review matrix

#### Text node

Current data to care about:

- `text`
- `format`

Required output:

- escape XHTML entities
- preserve bold, italic, underline, strike, code, subscript, superscript nesting

Easy to miss:

- XHTML-safe escaping everywhere, not only text content
- empty text nodes around inline decorator nodes

#### Paragraph node

Current data to care about:

- `children`
- possibly `direction`, `indent`, `format`

Required output:

- `<p>...</p>`

Easy to miss:

- whether empty paragraphs should be preserved for spacing
- whether a paragraph containing only an inline image fallback should still remain a paragraph

#### Heading node

Current data to care about:

- `tag`
- `id`
- `fields.anchorIds`
- `children`

Required output:

- emit `<h1>` through `<h4>` as stored
- preserve primary heading `id`
- preserve additional anchor aliases in a machine-readable way if useful

Easy to miss:

- the current serializer drops heading `id` and `anchorIds`
- imported EPUB internal links may target heading anchors, so losing heading ids breaks navigation inside the exported EPUB

Implementation rule:

- `lexicalToEpubHtml.ts` must emit the primary `id` on the heading element
- if multiple anchor aliases exist, pick one primary `id` and preserve aliases as `data-anchor-ids` only if EPUB readers tolerate them; otherwise preserve them only for testing and omit them from final XHTML

#### Quote node

Current data to care about:

- `children`

Required output:

- `<blockquote>...</blockquote>`

Easy to miss:

- imported definition lists and sidebars may already have been normalized into quote structures by `epubLexical.ts`
- do not assume all quote nodes came from literal `<blockquote>`

#### List node

Current data to care about:

- `tag`
- `children`
- `indent`

Required output:

- `<ol>` or `<ul>`

Easy to miss:

- nested list depth is represented structurally; do not flatten nested lists
- checklist items may exist in stored JSON even if not central to the import path

#### List item node

Current data to care about:

- `children`
- possibly `checked`

Required output:

- `<li>...</li>` for ordinary list items

Easy to miss:

- checklist semantics

Decision for v1:

- if `checked` exists, either:
  - render a semantic checkbox marker inside the item, or
  - explicitly document that checklists are normalized to plain list items in EPUB export

Do not silently discard `checked` if chapter content can contain checklist nodes.

#### Link node

Current data to care about:

- `fields.url`
- `fields.newTab`
- `children`

Required output:

- `<a href="...">...</a>`

Easy to miss:

- remove browser-specific `target="_blank"` behavior if not useful in EPUB
- preserve only safe protocols

Decision for v1:

- preserve `href`
- omit `target` unless there is a specific reader-compatibility reason to keep it

#### `epub-internal-link` node

Current data to care about:

- `fields.epubHref`
- `children`

Required output:

- resolved local archive href when possible
- plain text fallback when not resolvable

Easy to miss:

- this is not a normal link node
- raw `epubHref` values point to the source EPUB spine, not to exported archive filenames
- fragment-only links like `#note1` must stay local

This node requires a resolver callback. It must not be serialized in isolation.

#### Upload node

Current data to care about:

- `value`
- `fields.alt`
- media record lookup by id

Required output:

- local EPUB asset path, not CMS URL
- `<img src="../images/...">`

Easy to miss:

- the current serializer emits remote URLs or placeholder text
- export must download the asset and rewrite the source to a packaged file
- if media lookup fails, the fallback behavior must be intentional and visible in tests

Decision for v1:

- preserve `alt`
- do not preserve remote `src`
- use archive-local image paths only

#### Table node

Current data to care about:

- rows and cells

Required output:

- semantic XHTML table

Easy to miss:

- import preserves actual table semantics, including header-state and spans
- the current serializer handles `th` vs `td` but does not emit `colSpan`/`rowSpan`

Implementation rule:

- `lexicalToEpubHtml.ts` must emit `colspan` and `rowspan` when greater than 1

#### Table row node

Required output:

- `<tr>`

Easy to miss:

- nothing major if structural nesting is preserved correctly

#### Table cell node

Current data to care about:

- `headerState`
- `colSpan`
- `rowSpan`
- `children`

Required output:

- `<th>` or `<td>`
- emit `colspan` and `rowspan` attributes when needed

Easy to miss:

- current serializer already loses span metadata
- some imported educational books rely on merged cells for readable tables

#### Code block node

Current data to care about:

- `fields.blockType === 'Code'`
- `fields.code`
- `fields.language`

Required output:

- `<pre><code>...</code></pre>`

Easy to miss:

- class naming should be harmless if reader ignores syntax styles
- preserve raw code text exactly

#### Footnote reference node

Current data to care about:

- `fields.marker`
- `fields.noteId`

Required output:

- clickable or at least semantically labeled reference

Easy to miss:

- current generic serializer emits `href="#fn-..."`, but that only works if the corresponding footnote block ids are emitted consistently
- imported books may use repeated marker text with distinct note ids across chapters

Implementation rule:

- generate deterministic footnote target ids within the chapter document
- keep reference and block naming synchronized

#### Footnote block

Current data to care about:

- `fields.blockType === 'Footnote'`
- `fields.noteId`
- `fields.marker`
- `fields.content`

Required output:

- chapter-local footnote block with stable id target

Easy to miss:

- current serializer uses a simple `<aside epub:type="footnote">`
- if references use `#fn-${noteId}`, the block ids must match exactly

#### `epub-callout` node

Current data to care about:

- `fields.variant`
- `children`

Required output:

- semantic block wrapper

Easy to miss:

- variant-specific styling should survive with CSS classes inside the EPUB
- if CSS is omitted, note/tip/warning/important become visually indistinguishable

Implementation rule:

- emit stable class names
- include matching CSS in `book.css`

#### YouTube node

Current repo reality:

- serializer support exists
- chapter editor config in `src/utils/chapterRichText.ts` does not currently register `YouTubeFeature`

This still needs a policy, because stored data could contain the node from historical or manual insertion paths.

Options:

1. export as plain external link to YouTube
2. export as reader-visible placeholder paragraph
3. strip the node with a warning

Recommended for v1:

- export as a plain link such as `Watch on YouTube`

Do not embed `<iframe>` in EPUB XHTML as the main strategy. Reader support is inconsistent and often disabled.

#### Horizontal rule

Required output:

- `<hr />`

Easy to miss:

- ensure XHTML-compatible empty-element syntax

#### Line break

Required output:

- `<br />`

### 17.3 Structural fields that are easy to ignore

The serializer review must explicitly decide what to do with these fields:

- `direction`
- `indent`
- `format` on block nodes
- `checked` on list items
- `colSpan`
- `rowSpan`
- `id` and `fields.anchorIds` on headings

If a field is intentionally ignored, document that choice and test it.

### 17.4 Required serializer tests before packaging work

Create tests before implementing ZIP assembly for:

- heading id preservation
- multi-anchor heading preservation policy
- cross-chapter `epub-internal-link` rewriting
- fragment-only `epub-internal-link` preservation
- upload-node asset path rewriting
- unresolved upload fallback behavior
- footnote ref/block linking
- table `colspan` / `rowspan`
- callout class preservation
- YouTube fallback policy
- checklist policy if checklist nodes can exist in chapter data

## 18. EPUB Capability Matrix: What To Support vs What Not To Promise

This section answers the “font size, page heading, page number, book name across all pages” questions.

### 18.1 User-configurable font size

Do not make font size a CMS export configuration in v1.

Reason:

- reflowable EPUB readers already let the end user control font size
- hard-coding font-size choices in export fights the reader’s accessibility controls
- per-export font size settings are much more useful for PDF than for EPUB

What export should do instead:

- ship a conservative base stylesheet
- avoid hard-coded absolute font sizes where possible
- use relative sizing for headings and callouts

Good v1 controls:

- optional theme stylesheet choice, if needed later
- maybe “compact vs spacious” CSS preset, but only if there is a strong product need

### 18.2 Running headers, running footers, page numbers, book title on every page

This is the critical terminology:

- these are running headers / running footers
- page numbers are part of paged layout behavior

Do not promise this for reflowable EPUB.

Reason:

- EPUB readers paginate dynamically per device, per font, per orientation, and per user setting
- page numbers are not stable like in PDF or print
- running headers/footers are not reliably controllable across mainstream EPUB readers

Decision:

- out of scope for reflowable EPUB v1
- if the product needs fixed page furniture, that is a different output target:
  - PDF, or
  - fixed-layout EPUB

Both are materially different projects.

### 18.3 Link resolving

This does belong in v1.

There are three link classes to handle:

1. External web links
2. Chapter-local fragment links
3. Cross-chapter imported EPUB links

Required behavior:

- external links: preserve safe `http`, `https`, `mailto`, `tel`
- local fragments: preserve if target ids are emitted
- cross-chapter internal links: resolve to exported archive filenames using `chapterSourceKey`

Easy to miss:

- external links may still need escaping and protocol validation
- local fragment links break if heading ids or footnote ids are dropped
- cross-chapter internal links break if chapter filenames are generated without a mapping layer

### 18.4 Table of contents

This belongs in v1.

Support:

- machine-readable nav document
- visible navigation document if desired
- deterministic chapter order from `chapters.sort(order)`

Easy to miss:

- ToC titles should come from chapter titles, not from generated filenames
- ToC hrefs must use final archive filenames

### 18.5 Cover image

This belongs in v1 if `book.cover` exists.

Easy to miss:

- cover metadata in OPF
- actual cover asset inclusion
- cover fetch failure handling without aborting the whole export

### 18.6 Images

This belongs in v1.

Policy decisions needed:

- preserve original raster formats when already reader-friendly
- avoid unnecessary recompression in export
- include alt text
- decide whether missing images become warnings with visible fallback text

### 18.7 Footnotes and endnotes

This belongs in v1 because the import path already models them explicitly.

Easy to miss:

- cross-reference correctness between reference and note body
- chapter-local id collisions
- styling that keeps notes readable but not dominant

### 18.8 Callouts

This belongs in v1 because imported technical books use them.

Support:

- note
- tip
- warning
- important

Easy to miss:

- CSS class mapping inside the EPUB
- fallback readability when CSS is stripped or minimized

### 18.9 Embedded media / YouTube

This should not be treated as full rich embed support in v1.

Recommended v1 policy:

- degrade to a normal external link

Reason:

- iframe/script support in EPUB readers is inconsistent
- offline packaged readers may ignore or block embeds entirely

### 18.10 RTL / language-specific typography

This is easy to forget but important for long-term correctness.

Inputs already available:

- `book.language`

What to do in v1:

- write correct language metadata into OPF
- set document-level `lang` where useful

What not to over-promise yet:

- full RTL layout tuning
- language-specific hyphenation or advanced typography settings

Those can be phased later if the content set requires them.

## 19. Implementation Order For The Hard Parts

If implementation starts in the wrong order, the team will get false confidence from producing a ZIP that opens but has broken content.

Correct order:

1. Audit stored Lexical node shapes.
2. Write `lexicalToEpubHtml.ts` tests first.
3. Implement internal-link resolution helpers.
4. Implement upload-node asset rewrite behavior.
5. Implement footnote and heading-anchor correctness.
6. Implement package-file generators.
7. Only then add ZIP assembly and UI progress orchestration.

Wrong order:

1. add JSZip
2. fetch chapters
3. generate a blob
4. discover later that anchors, tables, notes, and internal links are broken

## 20. Dump-Model Failure Modes To Guard Against

This is the explicit “what a dump model would miss” list.

- Assuming `lexicalToHtml.ts` can be reused unchanged.
- Forgetting that heading ids matter for local navigation.
- Forgetting that `epub-internal-link` points to source EPUB spine paths, not exported filenames.
- Forgetting `colSpan` and `rowSpan`.
- Ignoring checklist state if checklist nodes can exist.
- Treating YouTube iframe output as EPUB-safe.
- Confusing remote CMS asset URLs with packaged EPUB asset paths.
- Assuming browser asset fetch CORS is already correct because the blog can render images.
- Promising running headers, running footers, or page numbers in reflowable EPUB.
- Adding font-size controls that fight reader accessibility behavior.
- Deleting the legacy route before validating export on real imported books.

## 21. Step-by-Step Implementation Checklist

This section is the execution plan.

It is intentionally ordered by dependency. Follow this order unless there is a concrete reason to change it.

## 21.1 Phase 0: Preflight and Scope Lock

### Goal

Confirm the exact supported chapter-content surface before writing export code.

### Files to inspect

- `src/utils/chapterRichText.ts`
- `src/utils/epubLexical.ts`
- `src/utils/lexicalToHtml.ts`
- `src/features/epub-heading/nodes/EpubHeadingNode.ts`
- `src/features/epub-internal-link/nodes/EpubInternalLinkNode.ts`
- `src/features/epub-callout/nodes/EpubCalloutNode.ts`
- `src/features/epub-footnote-ref/nodes/FootnoteRefNode.tsx`
- `src/features/youtube/nodes/YouTubeNode.tsx`

### Decisions to record before coding

- checklist policy:
  - either preserve `checked`, or flatten intentionally
- YouTube policy:
  - export as plain external link
- unresolved upload policy:
  - warning + visible fallback text
- unresolved internal-link policy:
  - warning + plain text fallback
- cover policy:
  - include when fetchable, warn and continue when not

### Easy-to-miss checks

- verify whether chapter content can contain YouTube nodes even though `createChapterLexicalEditor()` does not currently register `YouTubeFeature`
- verify whether checklist nodes can exist in saved content
- verify whether imported heading anchor ids are required for in-book navigation

### No code change yet

This phase ends with a written decision set in the doc or task notes.

## 21.2 Phase 1: Build and Test the Export Helper Surface First

Do not start with React or GraphQL. Start with pure helpers.

### File: `src/utils/epubExport.ts`

#### Add or repurpose these helpers

```ts
export function buildExportFilename(bookSlug: string): string
export function createChapterArchiveName(order: number, title: string, slug?: string | null): string
export function createMediaArchiveName(id: string, filename: string, mimeType?: string | null): string
export function splitEpubHref(epubHref: string): { path: string; fragment: string }
export function normalizeEpubPath(path: string): string
export function spineHrefFromSourceKey(chapterSourceKey: string): string | null
export function resolveEpubHrefToArchivePath(
  epubHref: string,
  chapters: ExportChapterIndexEntry[],
  archivePathByChapterId: Map<string, string>,
): string | null
```

#### Input types to add

```ts
export type ExportChapterIndexEntry = {
  id: string
  order: number
  title: string
  slug: string
  chapterSourceKey: string | null
}
```

#### Responsibilities

- produce stable archive filenames
- normalize imported EPUB hrefs
- resolve `epub-internal-link` raw source paths to final chapter archive paths

#### Easy-to-miss details

- chapter slugs are not sufficient as unique archive filenames
- preserve fragment identifiers unchanged
- support basename fallback when normalized full-path matching fails
- return `null` instead of a broken href when not resolvable

### Tests for Phase 1

Create:

- `tests/int/epub-export-utils.int.spec.ts`

Add cases for:

- `buildExportFilename('my-book') -> 'my-book.epub'`
- archive filename stability by order + title
- duplicate-ish titles still remain unique because order is included
- `splitEpubHref('#s3')`
- `splitEpubHref('../Text/ch2.xhtml#s3')`
- `normalizeEpubPath('./chapter02.xhtml')`
- `normalizeEpubPath('../Text/chapter02.xhtml?foo=1#bar')`
- `spineHrefFromSourceKey('toc-1::OEBPS/Text/chapter02.xhtml::3')`
- full-path internal-link resolution
- basename fallback internal-link resolution
- unresolved href returns `null`

### Verification for Phase 1

- `pnpm tsc --noEmit`
- targeted Vitest for `tests/int/epub-export-utils.int.spec.ts`

## 21.3 Phase 2: Build the EPUB Package Generators

### File: `src/utils/epubPackage.ts`

Create this as a pure module with no browser APIs.

#### Add these functions

```ts
export function buildContainerXml(): string
export function buildSharedStylesheet(): string
export function buildChapterDocument(input: BuildChapterDocumentInput): string
export function buildNavDocument(input: BuildNavDocumentInput): string
export function buildTocNcx(input: BuildTocNcxInput): string
export function buildContentOpf(input: BuildContentOpfInput): string
```

#### Add these types

```ts
export type ExportedChapterFile = {
  id: string
  order: number
  title: string
  href: string
}

export type ExportedAssetFile = {
  id: string
  href: string
  mediaType: string
  properties?: string[]
}
```

#### Responsibilities

- generate EPUB 3 package files
- centralize manifest and spine generation
- generate a shared stylesheet for callouts, tables, code, notes

#### Easy-to-miss details

- `mimetype` is not generated here, but package helpers should assume EPUB-compliant paths
- `nav.xhtml` should use final archive chapter hrefs
- `toc.ncx` should use final archive chapter hrefs
- OPF metadata should include language when available
- if cover exists, include cover manifest entry and cover metadata references consistently
- output XHTML-safe markup

### Tests for Phase 2

Create:

- `tests/int/epub-package.int.spec.ts`

Add cases for:

- `buildContainerXml()` points to `OEBPS/content.opf`
- chapter document includes XML declaration or XHTML wrapper chosen by implementation
- chapter document includes stylesheet reference
- nav document includes ordered links
- NCX includes ordered navPoints
- OPF includes manifest items for chapters
- OPF includes spine items in order
- OPF includes cover metadata when cover asset is present
- stylesheet includes classes for `epub-callout` variants

### Verification for Phase 2

- `pnpm tsc --noEmit`
- targeted Vitest for `tests/int/epub-package.int.spec.ts`

## 21.4 Phase 3: Build the EPUB-Specific Lexical Serializer

This is the highest-risk implementation phase.

### File: `src/utils/lexicalToEpubHtml.ts`

Create a new serializer instead of mutating `src/utils/lexicalToHtml.ts` into two conflicting contracts.

#### Add these types

```ts
export type EpubImageRef = {
  id: string
  archivePath: string
  alt: string
}

export type LexicalToEpubHtmlOptions = {
  resolveImage: (uploadId: string) => EpubImageRef | null
  resolveInternalHref: (epubHref: string) => string | null
  onWarning?: (message: string) => void
}
```

#### Add the main export

```ts
export function lexicalToEpubHtml(
  state: SerializedEditorState,
  options: LexicalToEpubHtmlOptions,
): string
```

#### Internal functions to implement

```ts
function serializeNode(node: AnyNode, options: LexicalToEpubHtmlOptions): string
function serializeHeadingNode(node: AnyNode, options: LexicalToEpubHtmlOptions): string
function serializeInternalLinkNode(node: AnyNode, options: LexicalToEpubHtmlOptions): string
function serializeUploadNode(node: AnyNode, options: LexicalToEpubHtmlOptions): string
function serializeTableCellNode(node: AnyNode, options: LexicalToEpubHtmlOptions): string
function serializeFootnoteRefNode(node: AnyNode): string
function serializeFootnoteBlockNode(node: AnyNode): string
```

#### Required node handling

- `text`
- `paragraph`
- `heading`
- `list`
- `listitem`
- `link`
- `quote`
- `table`
- `tablerow`
- `tablecell`
- `block` with `Code`
- `block` with `Footnote`
- `epub-callout`
- `footnote-ref`
- `epub-internal-link`
- `upload`
- `youtube`
- `horizontalrule`
- `linebreak`

#### Critical serializer rules

- headings must preserve anchor ids
- upload nodes must emit archive-local image paths
- internal links must resolve through `resolveInternalHref`
- unresolved links must degrade visibly and warn
- table cells must emit `colspan` and `rowspan`
- YouTube must degrade to a plain external link, not an iframe
- all output must be XHTML-safe

#### Easy-to-miss details

- if `heading.fields.anchorIds` exists, primary `id` must survive
- if both `node.id` and `fields.anchorIds` exist, normalize consistently
- do not emit browser-specific attributes like `target="_blank"` unless deliberate
- preserve footnote marker text and target id coherence
- check whether empty paragraphs should remain for spacing

### Tests for Phase 3

Create:

- `tests/int/lexical-to-epub-html.int.spec.ts`

Add cases for:

- heading node preserves `id`
- heading with multiple anchor ids preserves primary `id`
- `epub-internal-link` fragment-only href becomes `#fragment`
- `epub-internal-link` cross-chapter href becomes local archive href
- unresolved `epub-internal-link` returns non-link fallback and warning
- upload node emits `../images/...`
- unresolved upload emits visible fallback and warning
- footnote ref and footnote block use matching ids
- table cell emits `colspan`
- table cell emits `rowspan`
- callout variants emit stable classes
- YouTube node emits plain external link
- horizontal rule and line break are XHTML-safe

### Verification for Phase 3

- `pnpm tsc --noEmit`
- targeted Vitest for `tests/int/lexical-to-epub-html.int.spec.ts`

## 21.5 Phase 4: Add Export GraphQL Queries

Only after the pure helpers and serializer are in place.

### File: `src/graphql/queries/BookExportManifest/index.ts`

#### Add query field

- `bookExportManifest(bookId: ID!): BookExportManifestResult!`

### File: `src/graphql/queries/BookExportManifest/resolver.ts`

#### Add resolver responsibilities

- require authenticated user
- verify owner access using the same logic as current export mutation
- fetch book summary fields
- fetch all chapter index entries in `order` sequence
- calculate `totalChapters`
- choose `pageSize`
- calculate `totalPages`
- return optional cover media fields

### File: `src/graphql/queries/BookExportChunk/index.ts`

#### Add query field

- `bookExportChunk(bookId: ID!, page: Int!, limit: Int!): BookExportChunkResult!`

### File: `src/graphql/queries/BookExportChunk/resolver.ts`

#### Add resolver responsibilities

- require authenticated user
- verify owner access again
- fetch paginated chapters in `order`
- collect referenced media ids using `collectUploadIdsFromLexicalState()`
- fetch media docs with `overrideAccess: true`
- return only whitelisted media fields

### File: `src/graphql/queries/index.ts`

#### Register both queries

- `bookExportManifest`
- `bookExportChunk`

### Easy-to-miss details

- do not expose raw media docs wholesale
- do not rely on collection-level media read access for this export pathway
- do not let client-provided `limit` become unbounded
- keep chapter ordering deterministic

### Tests for Phase 4

Create:

- `tests/int/book-export-manifest-resolver.int.spec.ts`
- `tests/int/book-export-chunk-resolver.int.spec.ts`

Add cases for:

- unauthenticated request rejected
- non-owner rejected
- owner receives chapter index in order
- `totalPages` calculation correct
- chunk returns only page subset requested
- chunk deduplicates media ids
- chunk returns only allowed media fields

### Verification for Phase 4

- `pnpm tsc --noEmit`
- targeted Vitest for both resolver specs

## 21.6 Phase 5: Build the Browser Export Pipeline

### File: `src/utils/epubExportPipeline.ts`

Create this as a browser-only orchestration module.

#### Add types

```ts
export type ExportPhase =
  | 'Idle'
  | 'Fetching Manifest'
  | 'Fetching Chapters'
  | 'Serializing Chapters'
  | 'Downloading Assets'
  | 'Packaging'
  | 'Done'
  | 'Failed'
  | 'Canceled'
```

```ts
export type EpubExportEvent =
  | { type: 'phase'; phase: ExportPhase }
  | { type: 'status'; message: string }
  | { type: 'chapters-known'; totalChapters: number }
  | { type: 'chapter-serialized'; completed: number; total: number }
  | { type: 'asset-downloaded'; completed: number; total: number }
  | { type: 'warning'; message: string }
  | { type: 'done'; blob: Blob; filename: string }
```

#### Add main export

```ts
export async function* runEpubExportPipeline(
  config: EpubExportPipelineConfig,
): AsyncGenerator<EpubExportEvent>
```

#### Internal pipeline steps

1. fetch manifest query
2. build archive filename map for every chapter
3. fetch each chunk
4. serialize chapters with `lexicalToEpubHtml()`
5. accumulate unique asset registry
6. fetch asset blobs
7. add chapter and asset files to ZIP
8. add package files
9. generate final blob

#### Support functions to add

```ts
async function fetchManifest(bookId: string | number, signal: AbortSignal): Promise<...>
async function fetchChunk(bookId: string | number, page: number, limit: number, signal: AbortSignal): Promise<...>
async function fetchAssetBlob(url: string, signal: AbortSignal): Promise<Blob>
function chooseExportMediaURL(media: ExportMediaRecord): string | null
function chooseEpubMediaType(media: ExportMediaRecord): string | null
```

#### Easy-to-miss details

- do not fetch the same asset more than once
- use `STORE` for PNG/JPEG assets when packaging if possible
- warnings from serializer should flow to UI through pipeline events
- abort checks should happen before and after each network boundary
- do not hold unnecessary duplicate chapter strings after they are added to ZIP

### Tests for Phase 5

Create:

- `tests/int/epub-export-pipeline.int.spec.ts`

Add cases for:

- pipeline fetches manifest first
- pipeline serializes chunked chapters in order
- pipeline deduplicates asset downloads
- pipeline forwards warnings
- pipeline aborts cleanly
- pipeline emits `done` with filename and blob

### Verification for Phase 5

- `pnpm tsc --noEmit`
- targeted Vitest for `tests/int/epub-export-pipeline.int.spec.ts`

## 21.7 Phase 6: Build the Admin UI Shell

### File: `src/components/admin/books/EpubExporter.tsx`

Create a thin stateful UI shell.

#### State to manage

- `phase`
- `statusMessage`
- `warnings`
- `isExporting`
- `serializedChapters`
- `totalChapters`
- `downloadedAssets`
- `totalAssets` if tracked
- `errorMessage`

#### Responsibilities

- create `AbortController`
- iterate `runEpubExportPipeline()`
- update UI state from events
- trigger browser download on `done`
- revoke object URL after download

#### Easy-to-miss details

- ensure export cannot be started twice concurrently
- preserve warnings for user inspection
- distinguish canceled from failed
- avoid putting packaging logic in the component

### File: `src/components/admin/books/DownloadEpubButton.tsx`

#### Modify behavior

- feature-flag between:
  - legacy server export path
  - new client export UI path

#### Easy-to-miss details

- preserve the current UX for users until the new path is enabled
- do not delete the mutation call path in phase 1

### Tests for Phase 6

Create:

- `tests/int/epub-exporter.int.spec.tsx`

Modify:

- `tests/int/download-epub-button.int.spec.ts`

Add cases for:

- exporter shows progress updates
- cancel button aborts active export
- warning list renders
- success triggers blob download
- feature flag switches between legacy and client path

### Verification for Phase 6

- `pnpm tsc --noEmit`
- targeted Vitest for both component specs

## 21.8 Phase 7: Real-Book Validation

This phase is mandatory before deleting legacy export.

### Validation corpus

Use at least:

- one imported EPUB with images
- one imported EPUB with internal links / ToC links
- one imported EPUB with callouts and notes if available
- one manually authored book with upload nodes

### Manual validation checklist

Open exported EPUB in at least one real reader and one editor/validator workflow.

Check:

- book opens successfully
- ToC works
- chapter order is correct
- images render
- cover renders if present
- footnote refs jump to footnote blocks
- internal chapter links work
- heading fragment links work
- tables remain readable
- callouts remain readable
- YouTube nodes degrade acceptably

### Easy-to-miss details

- a file can open successfully while internal links are still broken
- a file can open successfully while heading anchors are missing
- a file can open successfully while merged table cells are flattened

## 21.9 Phase 8: Cleanup After Feature Validation

Only do this after the real-book validation phase passes.

### Files to modify or remove

- `src/graphql/mutations/GenerateEpub/index.ts`
- `src/graphql/mutations/GenerateEpub/resolver.ts`
- `src/graphql/mutations/index.ts`
- `src/app/api/epub-download/[token]/route.ts`
- token-specific helpers from `src/utils/epubExport.ts`
- legacy tests that only cover the signed download path

### Cleanup tasks

- remove token-generation logic
- remove legacy route
- remove feature flag if rollout is complete
- update docs to mark client export as default

### Tests for Phase 8

Adjust:

- `tests/int/generate-epub-resolver.int.spec.ts`
- `tests/int/download-epub-button.int.spec.ts`

### Verification for Phase 8

- `pnpm tsc --noEmit`
- relevant targeted Vitest export specs

## 21.10 Final Execution Summary

If implementation is delegated across multiple PRs or tasks, split by these boundaries:

1. pure export helpers + tests
2. package builders + tests
3. Lexical EPUB serializer + tests
4. GraphQL manifest/chunk queries + tests
5. browser pipeline + tests
6. admin UI + tests
7. real-book validation
8. legacy cleanup

That split keeps the riskiest work isolated and reviewable.
