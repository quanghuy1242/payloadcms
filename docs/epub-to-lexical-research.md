# EPUB → Payload Lexical: Research & Design Document

> **Status:** Draft — April 2026  
> **Scope:** Full analysis of the EPUB-to-Lexical conversion pipeline, root-cause diagnosis of the broken importer, and a redesign plan that is concrete enough to implement without ambiguity.

---

## Table of Contents

1. [Context & Goals](#1-context--goals)
2. [EPUB Format Analysis](#2-epub-format-analysis)
3. [Payload Lexical JSON Format](#3-payload-lexical-json-format)
4. [Current Implementation Audit](#4-current-implementation-audit)
5. [Root-Cause Diagnosis](#5-root-cause-diagnosis)
6. [Proposed Architecture](#6-proposed-architecture)
7. [Element-by-Element Mapping Rules](#7-element-by-element-mapping-rules)
8. [Image Handling Pipeline](#8-image-handling-pipeline)
9. [Testing Strategy](#9-testing-strategy)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Open Questions & Risks](#11-open-questions--risks)

---

## 1. Context & Goals

### 1.1 What We Are Trying to Achieve

The goal is a **seamless, lossless-enough** import pipeline for EPUB books into PayloadCMS.
"Seamless" means an admin user can drop an `.epub` file into the UI and walk away with a complete set of `Chapter` records whose `content` field renders correctly in the Payload Lexical editor and (more importantly) in the frontend reader.
"Lossless-enough" means we preserve all semantically meaningful content — headings, paragraphs, emphasis, links, images, lists, code blocks — while gracefully discarding purely presentational artefacts (CSS classes, decorative horizontal rules, publisher-specific wrappers).

The four EPUB files in `data/` represent the breadth of formats we must handle:

| File | Genre | EPUB Version | Structure Notes |
|---|---|---|---|
| `Coraline (Neil G Gaiman)` | Fiction | EPUB 2 | Calibre-generated flat `.html` splits, heavy CSS class reliance, sparse images |
| `The_Wild_Robot_Escapes_vi_book.epub` | Fiction (Vietnamese translation) | EPUB 2/3 | Standard structure, UTF-8 accented text, no images |
| `Manning.Fast.Python…epub` | Technical | EPUB 2 (Calibre) | OEBPS structure, many `<pre>` code blocks, inline images, side-bar divs |
| `Disrupting the Game` | Non-fiction | EPUB 3 | HarperCollins/IBooks structure, subchapters, tables |

### 1.2 Constraints That Shape the Design

**Browser-only processing.** Because the deployment target is Vercel Free Tier (4.5MB request body limit, 10-second serverless timeout), all heavy work — EPUB unzipping, HTML parsing, HTML-to-Lexical conversion, image upload — must run in the browser. Server endpoints only receive finished JSON payloads and `FormData` uploads. This is non-negotiable and already implemented; the bug is not the constraint but the incorrect implementation inside the browser.

**Payload Lexical JSON must be exact.** The `Chapter.content` field is a Payload `richText` field backed by `@payloadcms/richtext-lexical`. Payload validates the JSON against its own registered node set on every `POST /api/chapters` and `PATCH /api/chapters/:id`. If a single node has the wrong shape (wrong top-level keys, wrong version number, non-enumerated type) Payload rejects the **entire document** with `"The following field is invalid: Content"`. There is no partial acceptance.

**epubjs is the only viable EPUB library for browsers.** Server-side alternatives (epub-parser, node-epub) don't run in the browser. `epubjs` is the de-facto standard.

**The collections are fixed.** `Books` and `Chapters` are already deployed with their current schema. Any fix must work within the existing schema or propose a migration alongside code changes.

### 1.3 What "Working" Means Concretely

A working importer must produce zero `"Skipped chapter N: The following field is invalid: Content"` lines for any of the four test EPUBs. Acceptable warnings are:

- Unsupported image format (e.g., SVG with complex paths that can't convert to JPEG)
- Decorative-only page-break anchors stripped
- Cover image not present in archive (some EPUBs reference it externally)

Unacceptable warnings that indicate failure:

- Any chapter skipped due to invalid `Content`
- Any image producing `Cannot read properties of undefined`
- Any blob URL surviving into the final Lexical JSON

---

## 2. EPUB Format Analysis

### 2.1 EPUB Container Structure

An EPUB file is a ZIP archive. Understanding its internal structure is essential for correctly extracting content without relying on epubjs's opinionated rendering pipeline (which introduces the blob URL problem described later).

```
my-book.epub
├── mimetype                        ← must be first, uncompressed: "application/epub+zip"
├── META-INF/
│   └── container.xml               ← points to the OPF file
├── content.opf                     ← or OEBPS/content.opf — the "Package Document"
│   ├── metadata                    ← dc:title, dc:creator, dc:language, cover meta
│   ├── manifest                    ← lists every file with id, href, media-type
│   └── spine                       ← ordered list of idref → manifest items that form the reading order
├── toc.ncx                         ← EPUB 2 NCX navigation (tree ToC)
├── nav.xhtml                       ← EPUB 3 NAV document (tree ToC in HTML)
└── OEBPS/
    ├── Text/
    │   ├── chapter01.xhtml
    │   └── chapter02.xhtml
    └── Images/
        ├── cover.jpg
        └── figure1.png
```

**Key OPF fields we extract:**

- `//metadata/dc:title` → Book title
- `//metadata/dc:creator` → Author
- `//metadata/dc:language` → Language code (affects slug transliteration)
- `//metadata/meta[@name="cover"]/@content` → id of the cover image in the manifest (EPUB 2)
- `//metadata/meta[@property="cover-image"]/@id` → cover image id (EPUB 3)
- `//spine/itemref/@idref` → ordered chapter ids; only those without `linear="no"` are reading content
- `//manifest/item` → maps id → href → media-type for asset resolution

**Why `linear="no"` matters:** EPUB spines contain supplementary items (cover page, copyright notice, index) marked `linear="no"`. These are not reading content. The current importer filters them with `spineItem.linear !== 'no'` which is correct, but still processes items that are purely navigational (empty ToC pages) — these need a minimum-content check.

### 2.2 Common HTML Patterns in the Test EPUBs

Analysis of the four test files reveals four distinct pattern families that the converter must handle:

**Pattern A: Calibre Fiction (Coraline)**

Calibre-generated EPUBs shatter a novel into many small `.html` files (35 files for Coraline). The HTML is XHTML with heavy CSS class scaffolding:

```html
<!-- Heading with nested spans and an anchor with no href (page-break marker) -->
<h1 class="calibre16">
  <span class="calibre17">
    <span class="bold">
      <a href="toc.html#chapter1" class="calibre18"><span class="calibre2">I.</span></a>
    </span>
  </span>
</h1>

<!-- Chapter divider (decorative empty div) -->
<div class="calibre6"> </div>

<!-- Standard paragraph -->
<p class="calibre26">Coraline discovered the door...</p>

<!-- Italic text via span class, not <em> -->
<span class="italic">oompah oompah</span>

<!-- Page-break anchor inserted by Calibre — no content, no href -->
<a class="calibre1"><span class="calibre2"></span></a>

<!-- Small caps -->
<small class="calibre20">ORALINE DISCOVERED</small>
```

**Key challenges:** (a) Italic/bold via CSS class not semantic elements, (b) empty anchors as page breaks, (c) `<small>` used for typographic decoration, (d) one "chapter" spread across multiple spine items with tiny content.

**Pattern B: Calibre OEBPS Technical (Fast Python)**

Manning technical books from Calibre use the OEBPS directory layout and have rich structural elements:

```html
<!-- Heading with empty anchor IDs for PDF cross-references — very common in Manning books -->
<h2 class="fm-head">
  <a id="pgfId-1011875" class="calibre6 pcalibre..."></a>
  8.1 A unified interface for file access: fsspec
</h2>

<!-- Inline code -->
<code class="fm-code-in-text">conda install fsspec zarr pyarrow</code>

<!-- Preformatted code block — each line wrapped in its own anchor -->
<pre class="programlisting">
  <a id="pgfId-1011978" class="calibre6..."></a>from fsspec.implementations.github import GithubFileSystem
  <a id="pgfId-1011997" class="calibre6..."></a>
  <a id="pgfId-1011992" class="calibre6..."></a>git_user = "tiagoantao"
</pre>

<!-- Sidebar box as a div -->
<div class="fm-sidebar-block">
  <p class="fm-sidebar-title">fsspec interface limitations</p>
  <p class="copyrightbody">...</p>
  <ul class="calibre19"><li class="fm-list-bullet2"><p class="list">...</p></li></ul>
</div>
```

**Key challenges:** (a) Hundreds of empty `<a id="pgfId-...">` anchors that must be stripped, (b) `<pre>` code blocks with per-line anchor wrappers, (c) `<div>` sidebar wrappers that don't map to a Lexical block type, (d) `<li>` containing nested `<p>` which confuses standard list parsing.

**Pattern C: EPUB3 Non-fiction (Disrupting the Game)**

EPUB3 uses `epub:type` attributes and proper semantic HTML5:

```html
<section epub:type="chapter" id="chapter-1">
  <h1>Chapter 1: The Beginning</h1>
  <p>...</p>
  <figure>
    <img src="../Images/figure1.jpg" alt="Description"/>
    <figcaption>Figure 1.1: Caption text</figcaption>
  </figure>
</section>
```

**Key challenges:** (a) `<figure>/<figcaption>` grouping that maps to an image + paragraph pair, (b) `epub:type` attributes (harmless but must not propagate to Lexical).

**Pattern D: Vietnamese Fiction (The Wild Robot Escapes)**

Standard EPUB with UTF-8 Vietnamese content. The main challenges are correct text extraction (no issues here) and slug generation (handled by `createImportedBookSlug` with `locale: 'vi'`).

### 2.3 epubjs Rendering Pipeline & The Blob URL Problem

This is the most critical source of bugs and deserves a thorough explanation.

When the importer calls `section.render(book.load.bind(book))`, epubjs does the following internally:

1. Loads the raw XHTML from the archive
2. Parses it into a DOM
3. **Rewrites all relative asset URLs to `blob:` Object URLs** — this is epubjs's mechanism for enabling inline rendering in its `<iframe>` viewer. epubjs calls `URL.createObjectURL()` on each image blob and replaces the `src` attribute.
4. Returns the rewritten HTML string (or a reference to the section document)

This means by the time the importer gets the rendered HTML, every `<img src="images/cover.jpg">` has become `<img src="blob:https://payload.quanghuy.dev/1d5e307f...">`.

**What the importer does with this:**

```
rendered HTML: <img src="blob:https://payload.quanghuy.dev/1d5e307f-...">
                              ↓
         resolveEpubAssetPath("OEBPS/ch08.xhtml", "blob:https://...") 
                              ↓
         Returns the blob URL as-is (because it matches /^(https?:\/\/|data:|blob:)/)
                              ↓
         readArchiveBlob(book, "blob:https://...") → fails or returns corrupted blob
                              ↓
         ensureSupportedMediaBlob(blob) → blob.type is undefined → returns null
                              ↓  
         "Skipped image N: Cannot read properties of undefined (reading 'type')"
```

The `sanitizeChapterHTML` function then removes the blob URLs from the original HTML before Lexical conversion:
```
sanitized HTML: <img> (src attribute removed entirely)
```

This means:
1. Images fail to upload → no Media document created
2. The `<img>` tag survives in the HTML without a `src`, which then confuses `$generateNodesFromDOM`
3. Even if an image uploaded successfully via a different path, the HTML used for Lexical conversion no longer references it

**The correct approach** is to intercept before `section.render()`. Before calling `render()`, scan the raw section HTML for `<img src="...">` tags, resolve those relative paths through `resolveEpubAssetPath`, upload them via `readArchiveBlob` → `uploadAssetAsMedia`, then substitute the real Payload media URLs into the HTML — all before calling `render()` (which rewrites URLs) or by using `section.load()` to get the raw un-rendered document.

Actually, there's an even better approach: use `section.load()` then read `section.document` directly (which gives the raw unmodified DOM), process images from there, then manually convert the DOM to Lexical JSON — skipping `section.render()` entirely.

### 2.4 Table of Contents Tree Problem

EPUB has two ToC formats:

**NCX (EPUB 2):** `toc.ncx` contains a `<navMap>` with `<navPoint>` elements that can nest arbitrarily. Each `navPoint` has a `<content src="chapter.html#section-id"/>` pointing to a specific location within a content document.

**NAV (EPUB 3):** `nav.xhtml` contains `<nav epub:type="toc">` with nested `<ol>/<li>/<a>` elements.

The **spine** is linear and flat. The **ToC** is hierarchical and describes how those spine items group into parts and chapters.

Problem: the current importer uses `spine.spineItems` directly, creating one Chapter record per spine item. This loses the hierarchy:

```
Spine items (flat):    [cover, toc, part1-intro, ch1, ch2, part2-intro, ch3]
ToC structure (tree):  
  ├── Part I
  │   ├── Chapter 1
  │   └── Chapter 2
  └── Part II
      └── Chapter 3
```

The ideal import maps each meaningful ToC leaf node to a Chapter record, using the spine order for `order` and the ToC title for `title`. This is a Phase 4 improvement; the immediate fix does not require it.

---

## 3. Payload Lexical JSON Format

### 3.1 Root Structure

Every Payload Lexical `richText` field stores a `SerializedEditorState` object:

```json
{
  "root": {
    "type": "root",
    "version": 1,
    "format": "",
    "indent": 0,
    "direction": "ltr",
    "children": [ /* block nodes */ ]
  }
}
```

The `root` node is the only node of type `"root"` and may only contain **block-level** nodes as direct children. Inline nodes (text, link) must always be inside a block. Payload validates this invariant on every write.

### 3.2 Node Type Catalogue

The `Chapters` collection uses `createChapterLexicalEditor()` which registers the following features via `chapterRichTextFeatureProviders()`. Each feature registers a node type with a **specific serialized shape** that must be matched exactly.

**Complete feature list registered in `chapterRichText.ts` (verified):**

| Feature | Impact on Serialization |
|---|---|
| `ParagraphFeature()` | `paragraph` node |
| `HeadingFeature({ enabledHeadingSizes: ['h1','h2','h3','h4'] })` | `heading` node |
| `BlockquoteFeature()` | `quote` node |
| `OrderedListFeature()` / `UnorderedListFeature()` | `list` / `listitem` nodes |
| `ChecklistFeature()` | `listitem` with `checked: true/false` — enables checklist semantics |
| `EXPERIMENTAL_TableFeature()` | `table` / `tablerow` / `tablecell` nodes |
| `BoldFeature()` / `ItalicFeature()` / `UnderlineFeature()` | Toolbar-only; do not add new node types — format bitmasks on `text` nodes |
| **`LinkFeature()`** | Registers Payload's custom `LinkNode` (version 3, `fields`-based) in the **editor**. This replaces `@lexical/link`'s `LinkNode` for the admin editor and for server-side validation. |
| `FixedToolbarFeature()` / `InlineToolbarFeature()` | Toolbar-only; no effect on serialization |

> **Critical note on `LinkFeature`:** When `LinkFeature()` is registered, Payload's `richtext-lexical` swaps in its own `LinkNode` implementation (version 3, `fields`-based) for the editor. The headless converter in `epubLexical.ts` does NOT use this feature set — it uses the raw `@lexical/link` `LinkNode` via `chapterLexicalNodes`. This is the exact mismatch causing import failures.

**ParagraphNode** (from `ParagraphFeature`)

```json
{
  "type": "paragraph",
  "version": 1,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "children": [],
  "textFormat": 0,
  "textStyle": ""
}
```

**HeadingNode** (from `HeadingFeature`)

```json
{
  "type": "heading",
  "tag": "h1",
  "version": 1,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "children": []
}
```
Only `h1`, `h2`, `h3`, `h4` are configured — see `HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] })`. An `h5` or `h6` in the source HTML must be downgraded to `h4`.

**TextNode** (base node, part of all features)

```json
{
  "type": "text",
  "version": 1,
  "format": 0,
  "mode": "normal",
  "style": "",
  "detail": 0,
  "text": "hello world"
}
```

`format` is a **bitmask**: `0` = normal, `1` = bold, `2` = italic, `4` = strikethrough, `8` = underline, `16` = code, `32` = subscript, `64` = superscript. Multiple formats combine with bitwise OR: bold+italic = `3`.

**QuoteNode** (from `BlockquoteFeature`)

```json
{
  "type": "quote",
  "version": 1,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "children": []
}
```

**ListNode** (from `OrderedListFeature` or `UnorderedListFeature`)

```json
{
  "type": "list",
  "version": 1,
  "listType": "bullet",
  "tag": "ul",
  "start": 1,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "children": []
}
```
`listType` is `"bullet"`, `"number"`, or `"check"`. `tag` is `"ul"` or `"ol"`.

**ListItemNode** (child of ListNode)

```json
{
  "type": "listitem",
  "version": 1,
  "value": 1,
  "checked": false,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "children": []
}
```

**TableNode / TableRowNode / TableCellNode** (from `EXPERIMENTAL_TableFeature`)

```json
{ "type": "table", "version": 1, "direction": "ltr", "format": "", "indent": 0, "children": [] }
{ "type": "tablerow", "version": 1, "direction": "ltr", "format": "", "indent": 0, "children": [] }
{ "type": "tablecell", "version": 1, "colSpan": 1, "rowSpan": 1, "headerState": 0, "width": null, "backgroundColor": null, "direction": "ltr", "format": "", "indent": 0, "children": [] }
```

### 3.3 The Payload LinkNode Schema — Critical

This is the most important incompatibility between the current implementation and what Payload expects.

**Standard `@lexical/link` LinkNode** (what `createHeadlessEditor` in `epubLexical.ts` produces):

```json
{
  "type": "link",
  "version": 1,
  "url": "https://example.com",
  "rel": "noreferrer",
  "target": "_blank",
  "title": null,
  "children": []
}
```

**Payload `@payloadcms/richtext-lexical` LinkNode** (what `/api/chapters` expects):

```json
{
  "type": "link",
  "version": 3,
  "format": "",
  "indent": 0,
  "direction": "ltr",
  "fields": {
    "linkType": "custom",
    "url": "https://example.com",
    "newTab": false
  },
  "children": []
}
```

The differences are:
1. `version: 1` vs `version: 3`
2. `url` at the top level vs nested inside `fields`
3. `rel`/`target` replaced by `fields.newTab` (boolean)
4. `fields.linkType` is always `"custom"` for external URLs; `"internal"` would mean a Payload document relation

When `$generateNodesFromDOM` processes an `<a href="https://...">` using the standard `LinkNode` class from `@lexical/link`, it produces the old format. Payload's API validator then reads this with `SerializedLinkNode.importJSON`, which calls `$createLinkNode({})` — Payload's own constructor — and fails to find `fields`, causing the entire content to be rejected.

**Even a chapter with no links fails** if there's a heading node that has a different `version` or missing `direction`/`format` fields. Payload's node type registry uses `importJSON` on every node, and standard Lexical nodes set `version: 1` with all required fields — so `ParagraphNode`, `HeadingNode`, `TextNode` etc. mostly work. The fatal case is the `LinkNode` version mismatch.

### 3.4 Payload Validation Logic

When you `POST` or `PATCH` a Chapter with a `content` richText field, Payload does the following server-side:

1. Receives the `content` as a raw JSON object
2. Tries to reconstruct the Lexical editor state by calling `editorSchema.parse(content)` using its registered feature set
3. Each node type in `root.children` (and recursively) calls `NodeClass.importJSON(serializedNode)`
4. If any `importJSON` call throws or if the overall schema check fails, Payload wraps the error as `"The following field is invalid: Content"`

The error is non-specific by design — it catches all Lexical node validation failures under a single message. This makes debugging hard without tracing the error through Payload's internal Zod schema validation.

Note: even though `@lexical/headless` can round-trip nodes it doesn't know about (it skips them), Payload's server-side validation is stricter — unknown node types cause the entire field to be marked invalid.

---

## 4. Current Implementation Audit

### 4.1 File Inventory

| File | Role | Status |
|---|---|---|
| `src/utils/epubLexical.ts` | HTML → Lexical JSON conversion | **Broken** — uses wrong LinkNode format |
| `src/utils/epubImport.ts` | HTML sanitization, asset path utilities, import helpers | Mostly correct, minor gaps |
| `src/utils/chapterLexicalNodes.ts` | Node class array for headless editor | Partially correct — uses wrong LinkNode |
| `src/utils/chapterRichText.ts` | Payload feature registry for Chapters editor | Correct — defines the server-side schema |
| `src/components/admin/books/EpubImporter.tsx` | Browser orchestrator component | Broken — image extraction happens after render |
| `src/collections/Chapters.ts` | Payload collection config | Correct |
| `src/collections/Books.ts` | Payload collection config | Correct |
| `src/utils/books.ts` | Import lifecycle hooks | Correct |

### 4.2 `epubLexical.ts` — The Conversion Layer

The entire conversion relies on two libraries:

```typescript
import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
```

`createHeadlessEditor` creates a Lexical editor instance without a DOM render target (originally designed for server-side use in Node.js, but it also works in the browser). `$generateNodesFromDOM` takes a parsed DOM document and a Lexical editor instance and produces a tree of Lexical nodes by walking the DOM recursively, mapping HTML elements to node types using the editor's registered node classes.

**The fundamental problem:** the node registry passed to `createHeadlessEditor` is `chapterLexicalNodes` from `chapterLexicalNodes.ts`:

```typescript
import { AutoLinkNode, LinkNode } from '@lexical/link'   // ← standard @lexical/link (both nodes)
```

`@lexical/link`'s `LinkNode.exportJSON()` produces the version-1 format. When Payload's API receives this, it validates it with Payload's own `LinkNode.importJSON()` which expects version 3 with `fields`. The mismatch causes validation failure.

**Important: `normalizeLexicalLinks` pre-pass (currently exists, not documented):**
Before `$generateNodesFromDOM` runs, `convertHtmlToChapterLexicalState` calls `normalizeLexicalLinks(dom)`. This traverses all `<a>` tags in the DOM and calls `sanitizeLexicalLinkURLValue` on each `href`. URLs failing the allowlist (blob:, relative paths, fragment-only `#...`, javascript:) have their `<a>` element **unwrapped** — the `<a>` tag is removed and its children are promoted to the parent. This means only `<a href="https://...">` with genuine external URLs survive to `$generateNodesFromDOM`. Those surviving external links are what produce the wrong `version: 1` LinkNode format.

> **Implication for the fix:** `normalizeLexicalLinks` already handles empty anchors, page-break markers, and fragment links. The new `htmlToPayloadLexical` converter in Phase 1 should incorporate equivalent logic — it is **not** safe to delete `normalizeLexicalLinks` before the new converter is in place. Also note `AutoLinkNode` is registered in `chapterLexicalNodes` but has no role in EPUB import; it should remain in the node list to avoid `$generateNodesFromDOM` errors on any auto-detected URLs.

Additionally, `$generateNodesFromDOM` uses its built-in HTML element → node mappings, which don't know about:
- `<pre>` blocks with nested anchor IDs → loses structure
- `<code>` inside `<p>` → should become inline code format (format bit 16)
- `<figure>/<figcaption>` → no built-in mapping, gets unwrapped to paragraph
- `<div>` containers → partial handling by `normalizeWrapperDivs` in sanitization

### 4.3 `EpubImporter.tsx` — The Orchestrator Flow

The current flow (abbreviated):

```
1. section.load()          ← loads raw HTML from archive
2. section.render()        ← epubjs rewrites <img src> to blob: URLs  ← BUG ENTRY POINT
3. get chapterHTML         ← HTML now has blob: URLs
4. push to preparedChapters[], section.unload()
   ↓ (Phase 2: processPreparedChapter)
5. for each <img>:
   a. read src (blob: URL)        ← resolveEpubAssetPath returns blob: URL unchanged
   b. readArchiveBlob(blob: URL)  ← tries to fetch blob: URL from book.archive  ← fails
   c. warning appended, CONTINUE ← chapter is NOT failed here; only image is skipped
6. sanitizeChapterHTML     ← removes remaining blob: URLs as side effect of URL allowlist
7. convertHtmlToChapterLexicalState ← normalizeLexicalLinks strips fragment/invalid <a> tags;
                                       valid external <a href="https://…"> survive and produce
                                       standard @lexical/link LinkNode (version 1) ← BUG
8. POST to /api/chapters   ← Lexical LinkNode version 1 rejected by Payload validator  ← fails
```

**Key architectural constraint:** `section.load()` is called in **Phase 1** (`prepareChaptersForImport`), but image uploads happen in **Phase 2** (`processPreparedChapter`) via closures (`readArchiveBlob`, `uploadAssetAsMedia`) that have access to the media cache and signal. By the time Phase 2 runs, `section.unload()` has already been called and `section.document` is gone.

The correct flow must capture the raw HTML **before `render()` and before `unload()`** in Phase 1: simply replace:
```typescript
await section.render(...)          // ← remove this line
const chapterHTML = section.document?.documentElement?.outerHTML ?? ''
```
This gives Phase 2 the original HTML with relative `src` paths that `resolveEpubAssetPath` + `readArchiveBlob` can correctly resolve.

### 4.4 `epubImport.ts` — Utility Belt

Most utilities in this file are correct:

- `sanitizeChapterHTML` — correctly removes disallowed tags, unsafe attributes, event handlers
- `resolveEpubAssetPath` — correctly resolves relative paths with `..` traversal
- `ensureSupportedMediaBlob` — correctly converts non-PNG/JPEG images to JPEG via canvas
- `buildStableHash` / `buildStableBinaryHash` — deterministic FNV-1a hashing
- `createStableMediaFilename` — prevents duplicate uploads via stable naming
- `estimateWordCountFromHTML` — adequate for batch size estimation

**Gap in `resolveEpubAssetPath`:** the function correctly returns blob URLs unchanged (because they match the HTTP protocol check), but this is wrong behavior in the context of image extraction — blob URLs should never reach `readArchiveBlob`. The fix is in the orchestrator (intercept before render), not in this utility.

**Gap in `sanitizeChapterHTML`:** `normalizeWrapperDivs` handles simple `<div>` cases but does not handle:
- `<div>` elements containing only block children (should unwrap, not convert to `<p>`)
- Calibre-specific empty spacer divs with only whitespace (should be removed)

**Missing utility:** There is no `isNavigationOnlyChapter()` helper to detect and skip NCX/ToC spine items (chapters with only navigation links and no prose content).

### 4.5 Known Error Log Taxonomy

From the error log in `docs/book-importer.md`, here is the complete classification:

| Error Message | Count | Root Cause | Fix Location |
|---|---|---|---|
| `"Skipped chapter N: The following field is invalid: Content"` | ~20 | Payload LinkNode v3 format mismatch | `epubLexical.ts` |
| `"Skipped image N in chapter M: Cannot read properties of undefined (reading 'type')"` | ~50 | `blob.type` is undefined because `readArchiveBlob` received a blob: URL | `EpubImporter.tsx` (intercept before render) |
| `"Chapter M: Removed unsafe src URL: blob:https://..."` | ~50 | `sanitizeChapterHTML` correctly strips blob: URLs that survived image processing | Consequence of previous bug |
| `"Cover upload failed for Fast Python"` | 1 | Cover path from `book.loaded.cover` is either empty, a blob: URL, or misresolved | `EpubImporter.tsx` → `processBookCover` |

The "Content is invalid" error is the single most impactful bug: all 23 chapters of Fast Python are skipped because each contains at least one `<a>` tag (the Manning-style `<a id="pgfId-...">` cross-reference anchors), and every `<a>` with `href` produces an invalid Payload LinkNode.

---

## 5. Root-Cause Diagnosis

### 5.1 "The following field is invalid: Content" — Primary Cause

**Cause:** `epubLexical.ts` creates a headless Lexical editor with `chapterLexicalNodes`, which includes `LinkNode` from `@lexical/link` (version 1 format). When `$generateNodesFromDOM` encounters an `<a href="...">` in the EPUB HTML, it creates a standard `LinkNode` instance. The `LinkNode.exportJSON()` method on this class produces:

```json
{ "type": "link", "version": 1, "url": "https://example.com", "rel": "noreferrer", "target": "_blank" }
```

When this JSON is sent to `POST /api/chapters`, Payload's server runs `SerializedPayloadLinkNode.importJSON(data)`. The Payload `LinkNode` constructor sees no `fields` property and no version 3 header, and the Zod schema for the `content` field rejects the document.

**Why even "simple" chapters without links can fail:** The Manning Fast Python book includes `<a id="pgfId-...">` anchors everywhere — including inside headings. While `normalizeLexicalLinks` already strips these (no `href` → unwrapped), the valid cross-book external links in technical books survive the pre-pass and produce version-1 LinkNodes.

Note: `normalizeLexicalLinks` already handles empty anchors, fragment-only links, and relative links via `sanitizeLexicalLinkURLValue`. The **only** links that survive to `$generateNodesFromDOM` are those with genuine `https://` external URLs. These produce the wrong version-1 LinkNode format — this is the single remaining cause of validation failure for most chapters.

**Why fixing the LinkNode format fixes everything:** Once the converter produces version-3 `fields`-based link JSON, the entire content field passes Payload's validation for all chapters that contain only standard prose elements.

### 5.2 "Cannot read properties of undefined (reading 'type')" — Image Blob Problem

**Cause:** `section.render()` in epubjs transforms all relative image paths to `blob:` Object URLs. The importer then calls:

```typescript
const rawBlob = await readArchiveBlob(book, resolvedAssetPath) // resolvedAssetPath is a blob: URL
```

But `readArchiveBlob` uses `book.archive.getBlob(candidatePath)`. The epubjs archive implementation does not maintain a key-by-blob-URL index — blobs are stored by their original relative path. A blob URL as the key produces `undefined`.

```typescript
const normalizedBlob = await ensureSupportedMediaBlob(rawBlob)
// rawBlob is undefined
// undefined.type throws "Cannot read properties of undefined (reading 'type')"
```

The `ensureSupportedMediaBlob` function (correctly) accesses `blob.type` but doesn't guard against `undefined` input.

### 5.3 "Removed unsafe src URL: blob:https://…" — Downstream Consequence

**Cause:** After the image upload fails and is skipped, `sanitizeChapterHTML` runs on the HTML that still contains `<img src="blob:https://...">` attributes. The `sanitizeURLAttributeValue` function correctly identifies `blob:` as a disallowed protocol and removes the `src` attribute, logging `"Removed unsafe src URL: blob:..."`. The image is now completely lost — not just unsupported, but silently dropped.

**The correct approach** is to intercept before `section.render()`. Before calling `render()`, scan the raw section HTML for `<img src="...">` tags, resolve those relative paths through `resolveEpubAssetPath`, upload them via `readArchiveBlob` → `uploadAssetAsMedia`, then substitute the real Payload media URLs into the HTML — all before calling `render()` (which rewrites URLs). Concretely:

1. Call `section.load()` which populates `section.document` with the raw (unrewritten) DOM
2. Query `section.document.querySelectorAll('img[src]')` to get all image elements
3. For each image, read its original `src`, resolve against the spine item's `href` via `resolveEpubAssetPath`
4. Upload the image and replace the `src` with the Payload media URL
5. Serialize the modified `section.document` to HTML
6. Proceed with sanitization + Lexical conversion

### 5.4 Cover Upload Failure

`book.loaded.cover` resolves with the cover image path. In epubjs, this path is also processed through epubjs's URL replacement pipeline, so it may return a blob URL by the time the importer reads it.

Additionally, the current `processBookCover` calls `resolveEpubAssetPath('', coverPath)` — passing an **empty string** as the chapter `href`. This works for flat paths (`cover.jpg`) but silently fails for paths with `../` traversal (e.g., `../images/cover.jpg`), because there are no directory segments to pop from. This is a latent bug that affects some EPUB structures.

The cover in some EPUBs is referenced via a special `titlepage.xhtml` spine item rather than a direct image path. `book.loaded.cover` returns the path to the *image file* in the archive, not the title page. For EPUBs where the cover is stored at `cover.jpeg` at the root level (Coraline, Fast Python), the path resolution works but the MIME type detection from the raw extension must be explicit.

The fix: read `book.loaded.cover` → resolve against the archive manifest → extract the raw blob using `book.archive.getBlob(path)` (not through epubjs's URL rewriting). For `processBookCover`, replace `resolveEpubAssetPath('', coverPath)` with a manifest-based lookup that uses the OPF cover meta item's `href` directly.

### 5.5 Empty Chapter Nodes & Required Field Rejection

Some EPUB spine items contain no prose content:
- Navigation pages (ToC pages that are readable spine items per spec but contain only nav lists)
- Copyright/colophon pages with only a few words
- Part-separator pages with just a title heading

For these, `convertHtmlToChapterLexicalState` may return an empty root (`children: []`) or a root with a single paragraph containing only whitespace. Payload's `content` field is marked `required: true`. An empty Lexical state (root with no children) is technically valid JSON but Payload may reject it if the required check operates at content level, not just JSON presence.

**Observed behavior:** Chapters 1 and 2 in the log are skipped with "Content is invalid" without corresponding image errors. These are likely navigation-only or nearly-empty chapters from the EPUB.

**Fix:** Add a minimum-content check after conversion: if `lexicalState.root.children.length === 0` or all children are empty paragraphs, either (a) skip the chapter with a warning, or (b) inject a fallback paragraph with the chapter title.

---

## 6. Proposed Architecture

### 6.1 Design Principles

**Abandon `$generateNodesFromDOM` in favour of a direct JSON builder.**

`$generateNodesFromDOM` is a generic utility designed for converting arbitrary HTML to Lexical using whatever nodes the editor has registered. It works well when the registered nodes map 1:1 to the HTML structure you're importing. In our case:

1. The node set in `chapterLexicalNodes` uses standard library classes (`@lexical/link`'s `LinkNode`) whose `exportJSON()` doesn't match Payload's expected format.
2. Even if we fix the node classes, `$generateNodesFromDOM` still relies on the editor library's internal HTML→node mapping which doesn't handle EPUB-specific patterns (empty `<a>` anchors, Calibre CSS classes, `<pre>` with per-line anchor wrappers).
3. Every time Payload's `richtext-lexical` updates, there's a risk the serialized format changes — if we use `createHeadlessEditor` with our own nodes, we're always one version behind.

**The alternative is to write a pure function `htmlToPayloadLexical(html: string): SerializedEditorState`** that: (a) parses the HTML string with `DOMParser`, (b) walks the DOM tree recursively, (c) produces the exact JSON structures documented in Section 3 directly, without going through Lexical's editor instance at all.

This approach:
- Has zero dependency on `@lexical/headless`, `@lexical/html`, or any Lexical class
- Produces exactly the JSON Payload expects because we write the serializers
- Is trivially testable: input HTML string → output JSON, no async, no DOM side effects
- Can be extended for new node types without understanding Lexical internals
- Is deterministic and debuggable

**The trade-off:** we lose automatic forward-compatibility with Lexical's own HTML converter. But since Payload's `richtext-lexical` already diverges from standard Lexical (custom nodes, version numbers), this compat was always an illusion.

### 6.2 New Module Layout

```
src/utils/
├── epubImport.ts          ← HTML sanitization, asset utilities (keep, minimal changes)
├── epubLexical.ts         ← REWRITE: htmlToPayloadLexical() direct JSON builder
├── chapterLexicalNodes.ts ← Keep for test environment headless editor setup only
├── chapterRichText.ts     ← Unchanged (Payload feature registry)
└── epubManifest.ts        ← NEW: epub manifest parsing, asset path lookup by manifest id

src/components/admin/books/
└── EpubImporter.tsx       ← MODIFY: image extraction before render, manifest-based lookup
```

**New file: `src/utils/epubManifest.ts`**

This utility builds a lookup table from the epub OPF manifest. It provides two operations:
1. `buildManifestAssetMap(book)` → `Map<string, string>` mapping normalised archive path → MIME type
2. `lookupAssetInManifest(manifestMap, rawHref)` → string | null for looking up the original archive path from an image's resolved relative href

This lets the importer resolve image paths without relying on epubjs's URL rewriting.

### 6.3 Phase 1 — Rewrite the Conversion Layer (`epubLexical.ts`)

Replace the headless-editor approach with a recursive DOM walker that outputs Payload JSON directly.

**Core function signature:**

```typescript
export function htmlToPayloadLexical(html: string): SerializedEditorState
```

**Internal recursive walker:**

```typescript
type LexicalBlock = SerializedParagraphNode | SerializedHeadingNode | SerializedListNode | SerializedQuoteNode | SerializedTableNode

type LexicalInline = SerializedTextNode | SerializedPayloadLinkNode | SerializedLineBreakNode

function walkNode(node: Node, context: WalkContext): (LexicalBlock | LexicalInline)[]
```

The walker keeps a `WalkContext` that tracks current text format bitmask (accumulated as we descend into `<strong>`, `<em>`, `<u>`, etc.) and current indent level (for lists). This avoids the need to pass format state through every recursive call.

**Key design choice:** The walker is **block-aware**. When descending into a `<div>`, it peeks at its children to decide whether to treat the div as a block container (unwrap it) or as a paragraph. This mirrors the existing `normalizeWrapperDivs` logic but operates at the JSON generation level rather than at the DOM mutation level.

### 6.4 Phase 2 — Fix the Image Pipeline (`EpubImporter.tsx`)

**Architectural constraint:** `EpubImporter.tsx` is structured as a strict two-phase pipeline:
- **Phase 1 (`prepareChaptersForImport`):** serial. Calls `section.load()`, captures HTML, calls `section.unload()` in `finally`. By the time Phase 1 finishes, `section.document` is gone.
- **Phase 2 (`processPreparedChapter`):** parallel batches. Has access to `mediaCache`, `mediaInFlight`, `signal`, and the `readArchiveBlob` / `uploadAssetAsMedia` closures — but no longer has a live `section` object.

`readArchiveBlob` and `uploadAssetAsMedia` are **component-scoped closures**, not standalone utilities. They depend on the component's `appendWarnings`, `setProgress`, React state refs, and `abortController`. This is why moving image extraction fully into Phase 1 requires significant refactoring of these closures. The plan for `epubManifest.ts` is still valuable for manifest lookups, but the closures constraint should be understood.

**Minimal surgical fix (recommended for Step 2):**

In `prepareChaptersForImport`, the only change needed is removing the `section.render()` call:

```typescript
// BEFORE:
await Promise.resolve(section.load(book.load.bind(book)))
const renderedSection = await Promise.resolve(section.render(book.load.bind(book)))
const chapterHTML = typeof renderedSection === 'string'
  ? renderedSection
  : section.document?.documentElement?.outerHTML ?? ''

// AFTER:
await Promise.resolve(section.load(book.load.bind(book)))
// Skip render() entirely — section.document now has original relative src paths
const chapterHTML = section.document?.documentElement?.outerHTML ?? ''
```

This single-line removal is sufficient because:
1. `section.document` is populated by `section.load()` and has unmodified relative `src` paths
2. In Phase 2, `resolveEpubAssetPath(spineItem.href, rawSrc)` will now receive the actual relative path (e.g., `../Images/cover.jpg`) instead of a `blob:` URL
3. `readArchiveBlob` will successfully fetch from `book.archive` using the resolved path

**Phase 2 image loop remains unchanged** except that it now actually works. The loop already calls `resolveEpubAssetPath`, `readArchiveBlob`, and `uploadAssetAsMedia` in the right sequence — the only reason it failed before was receiving blob: URLs.

**What the full corrected Phase 2 flow looks like (for documentation purposes):**

```
1. book.open() + book.ready
2. [Optional: Build manifestAssetMap from book.package.manifest for MIME lookup]
3. Phase 1: For each spine item:
   a. section.load(book.load.bind(book))      ← populates section.document with raw HTML
   b. chapterHTML = section.document.documentElement.outerHTML  ← original relative paths
   c. section.unload() in finally
4. Phase 2 (batched): For each preparedChapter:
   a. Parse chapterHTML DOM
   b. For each img[src]:
      - rawSrc = element.getAttribute('src')    ← now a real relative path, not blob:
      - resolvedPath = resolveEpubAssetPath(spineItem.href, rawSrc)  ← works correctly
      - blob = await readArchiveBlob(book, resolvedPath)  ← succeeds
      - uploadedMedia = await uploadAssetAsMedia(...)  ← succeeds
      - element.setAttribute('src', uploadedMedia.url)
   c. sanitizeChapterHTML(modifiedHtml)
   d. htmlToPayloadLexical(sanitized.html)
   e. POST /api/chapters
```

**Also handle `<image href>` and `<image xlink:href>`:** Some EPUBs embed SVG `<image>` elements. The DOM query must be `querySelectorAll('img[src], image[href], image[xlink\\:href]')` to cover these cases.

**`readArchiveBlob` improvement:** The function receives the raw `Blob` from `book.archive.getBlob()` but the epub manifest knows the MIME type for each asset. Instead of inferring MIME type from the file extension (which is error-prone for assets named without extensions), look up the MIME type from the pre-built manifest map.

### 6.5 Phase 3 — Fix Link Serialization (in the new `epubLexical.ts`)

The new converter handles `<a>` tags with three cases:

**Case 1: External link with href** — produces a Payload v3 LinkNode:
```json
{
  "type": "link", "version": 3,
  "format": "", "indent": 0, "direction": "ltr",
  "fields": { "linkType": "custom", "url": "https://example.com", "newTab": false },
  "children": [{ "type": "text", "text": "link text", ... }]
}
```

**Case 2: Anchor-only (no href, has id)** — strip the `<a>` element entirely (it's a cross-reference marker). Its text/child content is promoted to the parent context. This handles Manning's `<a id="pgfId-...">` markers and Calibre's `<a class="calibre1"><span class="calibre2"></span></a>` page-break anchors.

**Case 3: Internal fragment link (href="#section-id")** — The current `sanitizeLexicalLinkURLValue` correctly returns `null` for fragment-only URLs (`value.startsWith('#')`). These should be unwrapped to their text content (the anchor text without the link). This is correct for imported EPUB content where chapter-internal anchors are meaningless in a multi-page web context.

### 6.6 Phase 4 — Table of Contents as Chapter Hierarchy (Future)

This phase is out of scope for the immediate fix but documents the design:

Parse the epub's NCX (`toc.ncx`) or NAV (`nav.xhtml`) to build the full ToC tree. For each ToC leaf node, find the corresponding spine item. Instead of creating one Chapter per spine item, create one Chapter per ToC leaf, potentially merging multiple small spine items into one chapter if the ToC indicates they belong together.

The `chapterSourceKey` field on the Chapter collection is designed exactly for this — it stores the NCX navPoint id or NAV `<a>` href. This allows re-importing to match up against previously imported chapters even if the order changes.

This phase would also enable setting better chapter titles (from the ToC text rather than from the first heading in the HTML) and chapter hierarchy (parts containing chapters).

---

## 7. Element-by-Element Mapping Rules

The mapping is defined as a set of rules applied recursively by the new `htmlToPayloadLexical` converter. Rules are applied in order; the first matching rule wins.

### 7.1 Block-Level Elements

| HTML Element | Conditions | Payload Lexical Node | Notes |
|---|---|---|---|
| `<p>` | any | `paragraph` | Standard paragraph |
| `<h1>` | any | `heading` tag: `h1` | |
| `<h2>` | any | `heading` tag: `h2` | |
| `<h3>` | any | `heading` tag: `h3` | |
| `<h4>` | any | `heading` tag: `h4` | |
| `<h5>` | any | `heading` tag: `h4` | Downgrade — h5 not in feature set |
| `<h6>` | any | `heading` tag: `h4` | Downgrade — h6 not in feature set |
| `<blockquote>` | any | `quote` | |
| `<pre>` | any | `paragraph` with `code` format (16) | All text children get format `16` applied; nested `<a id="...">` stripped |
| `<ul>` | any | `list` listType: `bullet` tag: `ul` | |
| `<ol>` | any | `list` listType: `number` tag: `ol` | |
| `<li>` | inside `ul/ol` | `listitem` | Children walked normally |
| `<li>` | has checkbox input | `listitem` checked: true/false | Checklist item |
| `<table>` | any | `table` | Wraps rows |
| `<tr>` | any | `tablerow` | Direct child of table |
| `<td>` | any | `tablecell` headerState: 0 | |
| `<th>` | any | `tablecell` headerState: 1 | |
| `<hr>` | any | **Drop silently** | No horizontal rule node in the chapter feature set |
| `<figure>` | contains `<img>` | Process `<img>` as block image node (see §8), emit `figcaption` as paragraph | |
| `<figcaption>` | inside figure | `paragraph` with italic text | Treat as image caption |
| `<section>` | any | **Unwrap** (process children) | epub:type="chapter" is just a wrapper |
| `<article>` | any | **Unwrap** | |
| `<div>` | has only block children | **Unwrap** | Pass-through wrapper |
| `<div>` | has direct text content, no block children | `paragraph` | Calibre text wrapper |
| `<div>` | all whitespace content | **Drop** | Calibre spacer: `<div class="calibre6"> </div>` |
| `<nav>` | any | **Drop silently** | Navigation elements have no content value |
| `<aside>` | any | `quote` | Closest semantic equivalent for sidebars |

**Special case: `<pre>` with per-line anchor wrappers (Manning pattern)**

Manning technical books produce `<pre>` like:
```html
<pre>
  <a id="pgfId-1">from fsspec import GithubFileSystem</a>
  <a id="pgfId-2">fs = GithubFileSystem(...)</a>
</pre>
```

Rule: when walking a `<pre>`, strip all child `<a>` elements, normalize leading/trailing blank lines, and emit a Payload `block` node using the built-in `CodeBlock` feature (`blockType: 'Code'`, `language: 'plaintext'`, `code: ...`).

The chapter editor must register both `InlineCodeFeature` and `BlocksFeature({ blocks: [CodeBlock({ defaultLanguage: 'plaintext' })] })` so imported code samples render and edit correctly.

### 7.2 Inline Elements

| HTML Element | Format Bit | Notes |
|---|---|---|
| `<strong>`, `<b>` | 1 (bold) | Add to accumulated format bitmask |
| `<em>`, `<i>` | 2 (italic) | Add to accumulated format bitmask |
| `<u>` | 8 (underline) | Add to accumulated format bitmask |
| `<s>`, `<del>`, `<strike>` | 4 (strikethrough) | Add to accumulated format bitmask |
| `<code>` (inside `<p>`) | 16 (code) | Inline code formatting |
| `<sub>` | 32 (subscript) | |
| `<sup>` | 64 (superscript) | |
| `<span>` | Inspect class | See class-based format detection below |
| `<br>` | — | Emit a `linebreak` node |
| `<small>` | 2 (italic) | No `small` in Lexical; italic is closest reasonable fallback — or strip format |
| `<abbr>` | 0 | Strip element, keep text |
| `<time>` | 0 | Strip element, keep text |
| `<mark>` | 0 | Strip element, keep text |

**Span class detection (Calibre-specific):**

Calibre uses CSS classes instead of semantic HTML for formatting. The converter should check the class attribute:

```typescript
function getFormatFromClassList(classList: DOMTokenList): number {
  let format = 0
  for (const cls of classList) {
    const lower = cls.toLowerCase()
    if (lower === 'bold' || lower.includes('bold')) format |= 1
    if (lower === 'italic' || lower.includes('italic') || lower === 'calibre-italic') format |= 2
    if (lower === 'underline') format |= 8
  }
  return format
}
```

This must be a best-effort heuristic, not a comprehensive CSS parser. Unknown classes are ignored.

### 7.3 List Elements

**Flat lists** (`<ul>` or `<ol>` with `<li>` children containing only inline content):

```json
{
  "type": "list",
  "listType": "bullet",
  "tag": "ul",
  "start": 1,
  "version": 1,
  "format": "", "indent": 0, "direction": "ltr",
  "children": [
    { "type": "listitem", "version": 1, "value": 1, "checked": false,
      "format": "", "indent": 0, "direction": "ltr",
      "children": [{ "type": "text", "text": "item text", ... }] }
  ]
}
```

**Nested lists** (`<li>` containing a sub-`<ul>/`<ol>`):

Lexical represents nested lists by making the sub-list a child of the `listitem`. The `indent` on the nested `list` node indicates depth. The converter must handle this recursively.

**Manning-style `<li>` with nested `<p>`:**

Manning EPUBs often have:
```html
<li class="co-summary-bullet">
  <p class="list">Item text with <em>emphasis</em></p>
</li>
```

Rule: if a `<li>` contains only a single `<p>` element, unwrap the `<p>` and use its children as the `listitem` children directly. This avoids creating a `paragraph` inside a `listitem` which Lexical doesn't allow.

### 7.4 Table Elements

Tables map directly to Payload's `EXPERIMENTAL_TableFeature` nodes. The converter must handle:

- `<thead>/<tbody>/<tfoot>` wrappers → unwrap, process `<tr>` children
- `<th>` → `tablecell` with `headerState: 1`
- `colspan`/`rowspan` attributes → `colSpan`/`rowSpan` properties
- Tables with no `<tbody>` (direct `<tr>` children of `<table>`) → handle gracefully

Any text or inline elements that appear directly inside `<table>` outside `<td>/<th>` are dropped (malformed HTML).

### 7.5 Media Elements

The chapter feature set does **not** include `UploadFeature` or any image node. This means images cannot be represented in the Lexical state as first-class nodes — there is no `upload` or `image` node type in the registered features.

**Options:**
1. **Drop images from Lexical content** (current implicit behaviour after all bugs): images exist in the Media collection but are not embedded in chapters. The chapter is text-only.
2. **Inline images as HTML in a custom node**: requires adding a custom node to the feature registry and the schema — significant scope increase.
3. **Keep images as figure captions only**: extract alt text + figcaption as a paragraph italic note `"[Image: alt text]"` as a placeholder.

**Recommended approach for Phase 1:** Option 3 — preserve the semantic intent of the image as a text note. This is lossless for accessibility-focused content (the alt text is preserved) while staying within the current schema. The image is still uploaded to the Media collection; it just isn't embedded in the Lexical content.

```html
<!-- Source: -->
<figure><img src="figure1.jpg" alt="Performance comparison chart"/><figcaption>Figure 3.1</figcaption></figure>

<!-- Lexical output: -->
{ "type": "paragraph", "children": [
  { "type": "text", "text": "[Image: Performance comparison chart — Figure 3.1]", "format": 2 }
]}
```

When `UploadFeature` is eventually added to the chapter editor, a migration can be written to replace these placeholder paragraphs with proper upload nodes.

### 7.6 Unsupported / Drop Elements

Elements that should be **silently stripped** (their children may still be processed):
- `<a>` with no `href` and non-empty content → unwrap, keep children
- `<a>` with only an `id` attribute and empty children → drop entirely (cross-reference anchor)
- `<span>` with no recognized format class → unwrap, keep children
- `<svg>` → emit `[Image: SVG diagram]` placeholder paragraph
- `<video>`, `<audio>`, `<object>`, `<embed>` → drop silently
- `<form>`, `<input>`, `<select>` → drop silently
- `<script>`, `<style>` → drop silently (already handled by sanitizer)
- Empty `<p>` and `<div>` with only whitespace → drop silently
- `<ins>` → unwrap, keep children
- `<cite>` → unwrap, keep children (apply italic formatting optionally)

Elements that should be **warned about** if encountered (they indicate content loss):
- `<math>` — mathematical notation has no equivalent
- `<ruby>/<rt>` — ruby annotations (East Asian text) not representable

---

## 8. Image Handling Pipeline

### 8.1 The Two-Phase Strategy

Image handling must complete in two distinct phases that do not overlap:

**Phase A — Pre-scan and upload (before Lexical conversion)**

Before any HTML-to-Lexical conversion happens, all images in the chapter must be:
1. Located (via `section.document` DOM, before epubjs URL rewriting)
2. Path-resolved (via `resolveEpubAssetPath`)
3. Fetched from the EPUB archive (via `book.archive.getBlob(path)`)
4. Normalised to JPG/PNG (via `ensureSupportedMediaBlob`)
5. Uploaded to the Payload Media collection (via `POST /api/media`)
6. Their `src` attributes in the DOM replaced with the Payload media URL

**Phase B — Lexical conversion (after all image src attributes are resolved)**

Only after Phase A completes does the HTML get extracted and passed to `htmlToPayloadLexical`. At this point, every `<img>` in the HTML either has a valid `https://` Payload media URL (successfully uploaded) or has no `src` attribute (failed/skipped). The converter handles both cases gracefully:
- `<img src="https://cdn.payload.dev/media/...">` → rendered as image placeholder paragraph with alt text
- `<img>` without src → dropped silently

### 8.2 `resolveEpubAssetPath` Correctness

The existing implementation is correct for well-formed relative paths. Edge cases to verify:

**URL-encoded characters in paths:**
```
resolveEpubAssetPath("OEBPS/Text/ch01.xhtml", "Images/figure%201.png")
→ "OEBPS/Text/Images/figure%201.png"  ← keeps encoding
→ book.archive.getBlob(path) may fail
→ try decodeURIComponent: "OEBPS/Text/Images/figure 1.png"  ← try this too
```

The `readArchiveBlob` function already attempts both encoded and decoded variants. This should cover most cases.

**Absolute paths starting with `/`:**
```
resolveEpubAssetPath("OEBPS/Text/ch01.xhtml", "/OEBPS/Images/fig.png")
→ current code returns "/OEBPS/Images/fig.png" unchanged
→ book.archive.getBlob("/OEBPS/Images/fig.png") may fail
→ try without leading slash: "OEBPS/Images/fig.png"
```

**Recommended fix:** in the importer, after `resolveEpubAssetPath`, also try the path without an initial `/` prefix if the first attempt fails.

**SVG images referenced via `<image>` tag (SVG spec):**
Some ebooks embed small SVG files that use `<image xlink:href="...">` or `<image href="...">` (SVG namespace). The DOM walker must check both `<img src>` and `<image href>` / `<image xlink:href>`.

### 8.3 `readArchiveBlob` Robustness

The current implementation tries `getBlob(path)` and `getBlob(decodeURIComponent(path))`, then falls through to `createUrl()` + fetch. This is adequate but has one gap:

**Manifest path normalisation mismatch:** epubjs stores archive entries using the path exactly as it appears in the OPF manifest. If the manifest says `href="OEBPS/Images/Figure_1.png"` but the HTML references `../Images/Figure_1.png` (relative from the chapter file), `resolveEpubAssetPath` correctly resolves it to `OEBPS/Images/Figure_1.png`. However, if the manifest uses a different casing or encoding, the lookup fails.

**Proposed enhancement:** Build a case-insensitive manifest path index alongside the standard index. When a path doesn't match in the case-sensitive index, try the case-insensitive index. This handles Windows-authored EPUBs.

### 8.4 Media Deduplication

`createStableMediaFilename` generates a filename that is a function of the original archive path. This means:

- The same image in the archive always produces the same filename
- If the same EPUB is re-imported, existing media is reused (found by `findExistingMediaByFilename`)
- If two different EPUBs have images at the same path but with different content, there will be a collision

For practicality, the collision risk is acceptable. The stable filename only needs to be unique enough to avoid re-uploading within the same import session and across re-imports of the same EPUB.

**Deduplication flow:**
```
1. createStableMediaFilename(resolvedPath, mimeType, index) → "cover-1a2b3c4d56.jpg"
2. GET /api/media?where[filename][equals]=cover-1a2b3c4d56.jpg
   - If found: return existing {id, url}
   - If not found: POST /api/media with the blob
3. Cache result in mediaCache Map (for within-chapter and cross-chapter dedup in same import)
```

### 8.5 Unsupported Formats

**GIF:** Not in `MEDIA_UPLOAD_ALLOWED_MIME_TYPES`. The `ensureSupportedMediaBlob` function attempts `convertImageBlobToJpeg` for unrecognised image MIME types. GIF → JPEG conversion via canvas loses animation (first frame only). This is acceptable.

**WebP:** Same path as GIF → JPEG via canvas. Acceptable.

**SVG:** `image/svg+xml` is not an image/* type that Canvas can load without special handling. `convertImageBlobToJpeg` will fail for SVG (canvas.toBlob returns empty). Current code returns `null` from `ensureSupportedMediaBlob`, the image is skipped with a warning. For simple SVGs, a better approach would be: detect SVG, convert to data URI, embed as `<img>` src for canvas loading. But this is complex. **Recommended: skip SVGs in Phase 1, log a warning.**

**Base64 data URIs:** If an EPUB has `<img src="data:image/png;base64,...">`, `resolveEpubAssetPath` should detect `data:` as a special case (it already returns the value unchanged for absolute URLs). The importer should then decode the base64 data into a Blob and upload it. This is rare but possible in some auto-generated EPUBs.

**Recommended check for base64:**
```typescript
if (rawSrc.startsWith('data:image/')) {
  const [header, base64Data] = rawSrc.split(',', 2)
  const mimeType = header.split(':')[1].split(';')[0]
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: mimeType })
  // proceed with ensureSupportedMediaBlob → upload
}
```

---

## 9. Testing Strategy

### 9.1 Test Architecture Overview

The test suite already has a solid foundation in `tests/int/epub-import-utils.int.spec.ts`. The Vitest configuration uses `jsdom` as the test environment, which provides `DOMParser`, `URL`, `Blob`, and `FormData` — the exact browser APIs the importer relies on.

**Three test levels are needed:**

| Level | Where | What it tests | Speed |
|---|---|---|---|
| Unit | `tests/int/epub-import-utils.int.spec.ts` | Pure functions: converter, sanitizer, path resolver | < 500ms |
| Integration (fixture) | New `tests/int/epub-lexical.int.spec.ts` | `htmlToPayloadLexical()` with realistic EPUB HTML snippets | < 1s |
| Integration (real epub) | Existing `tests/int/epub-import-utils.int.spec.ts` — extend | Full epub load → Lexical state for each test book | 1–5s each |
| E2E | `tests/e2e/` | Actual browser import via EpubImporter component | ~30-60s |

> **Required config change:** `vitest.config.mts` has no `testTimeout` configured; the default is **5000ms**. Loading real EPUBs via `book.open(base64, 'base64')` takes 1–5s, leaving near-zero headroom. Before writing any new real-epub integration tests, add `testTimeout: 30_000` to `vitest.config.mts`.

**Existing test coverage (verified):**
- `epub-import-utils.int.spec.ts` — covers `resolveEpubAssetPath`, `sanitizeChapterHTML`, `createStableMediaFilename`, `buildStableHash`, `createImportedBookSlug` (with Vietnamese), and a smoke test for `convertHtmlToChapterLexicalState` (basic structures + relative link dropping)
- `epub-importer.int.spec.ts` — tests the `EpubImporter` React component with **fully mocked** epubjs and epubLexical; validates React rendering, progress states, and fetch/retry flow
- **Gap:** No existing test validates the Lexical node schema — no assertion on `link.version === 3`, no assertion that `blob:` URLs are absent from serialized output

### 9.2 Probe Script: `scripts/epub-probe.ts`

A standalone script that exercises the full conversion pipeline on all four test EPUB files. It prints the Lexical JSON output chapter by chapter, along with any warnings. This is the primary debugging tool during development.

**Proposed interface:**

```bash
# Run the probe on all test EPUBs:
pnpm tsx scripts/epub-probe.ts

# Run on a specific epub, specific chapter:
pnpm tsx scripts/epub-probe.ts --epub "data/Coraline (Neil G Gaiman) (Z-Library).epub" --chapter 6

# Output formats:
pnpm tsx scripts/epub-probe.ts --epub "data/Fast Python.epub" --output json > fast-python-ch1.json
pnpm tsx scripts/epub-probe.ts --epub "data/Fast Python.epub" --output summary
```

**What the script must validate for each chapter:**
1. `lexicalState.root.children.length > 0` — not empty
2. All `link` nodes have `version: 3` and `fields.linkType`
3. No `blob:` URLs anywhere in the JSON (recursively search all string values)
4. No node type that isn't in the supported set
5. Text content is preserved (compare plain text extracted from HTML vs from Lexical)

**Why this can run outside the browser (Node.js):**
The new `htmlToPayloadLexical` function will use `DOMParser` which is also available in Node via `jsdom`. The probe script must set up jsdom globals before calling any DOM-dependent code:

```typescript
import { JSDOM } from 'jsdom'
const dom = new JSDOM('')
global.DOMParser = dom.window.DOMParser as unknown as typeof DOMParser
global.Node = dom.window.Node as unknown as typeof Node
global.Element = dom.window.Element as unknown as typeof Element
```

> **Note:** `tests/helpers/jsdom-setup` does **not** currently exist in the codebase. The probe script must either define this inline or create `tests/helpers/jsdom-setup.ts` as part of Step 3.

Note: `book.archive.getBlob()` and `section.load()` require epubjs's browser-mode archive. In the probe script context, we use epubjs in its Node mode (which uses `jszip` directly) — the same as the integration tests which already work with real epub files via `book.open(base64, 'base64')`.

**Script structure:**

```typescript
// scripts/epub-probe.ts
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import ePub from 'epubjs'
import { htmlToPayloadLexical } from '../src/utils/epubLexical'
import { sanitizeChapterHTML } from '../src/utils/epubImport'

// Polyfill browser globals required by DOMParser-dependent code
const { window: jsdomWindow } = new JSDOM('')
Object.assign(global, {
  DOMParser: jsdomWindow.DOMParser,
  Node: jsdomWindow.Node,
  Element: jsdomWindow.Element,
})

const EPUB_FILES = [
  'data/Coraline (Neil G Gaiman) (Z-Library).epub',
  'data/The_Wild_Robot_Escapes_vi_book.epub',
  'data/Manning.Fast.Python.High.performance.techniques.for.large.datasets.1617297933.epub',
  "data/Disrupting the Game -- Reggie Fils-Aimé -- 1, 2022 -- HarperCollins Leadership -- 9781400226672 -- 5aea5b2983514cee72fd02de03337658 -- Anna's Archive.epub",
]

for (const epubPath of EPUB_FILES) {
  console.log(`\n=== ${epubPath} ===`)
  const buffer = await readFile(epubPath)
  const base64 = buffer.toString('base64')
  const book = ePub({ replacements: 'none' })
  await book.open(base64, 'base64')
  await book.ready

  const spine = await book.loaded.spine as any
  const spineItems = spine.spineItems.filter((item: any) => item.linear)
  let importedCount = 0, skippedCount = 0

  for (const [index, item] of spineItems.entries()) {
    const section = book.section(item.index)
    try {
      await section.load(book.load.bind(book))
      const html = section.document?.documentElement?.outerHTML ?? ''
      const sanitized = sanitizeChapterHTML(html)
      const lexical = htmlToPayloadLexical(sanitized.html)
      
      const issues = validateLexicalState(lexical)
      if (issues.length > 0) {
        console.log(`  Chapter ${index + 1}: ISSUES — ${issues.join(', ')}`)
        skippedCount++
      } else {
        console.log(`  Chapter ${index + 1}: OK (${lexical.root.children.length} blocks)`)
        importedCount++
      }
    } catch (err) {
      console.log(`  Chapter ${index + 1}: ERROR — ${err}`)
      skippedCount++
    } finally {
      section.unload()
    }
  }

  console.log(`  TOTAL: ${importedCount} ok, ${skippedCount} failed of ${spineItems.length}`)
  book.destroy()
}
```

### 9.3 Unit Tests for the Converter

New test file: `tests/int/epub-lexical.int.spec.ts`

**Test cases to write:**

```typescript
describe('htmlToPayloadLexical', () => {
  // Basic structure
  it('produces a valid SerializedEditorState root', ...)
  it('converts a paragraph to a paragraph node', ...)
  it('converts h1-h4 to heading nodes', ...)
  it('downgrades h5/h6 to h4', ...)
  
  // Text formatting
  it('converts <strong> to format bitmask 1', ...)
  it('converts <em> to format bitmask 2', ...)
  it('combines <strong><em> to format bitmask 3', ...)
  it('converts <code> inside paragraph to format bitmask 16', ...)
  it('detects italic from Calibre class names', ...)
  
  // Links — critical
  it('converts external <a href="https://..."> to Payload v3 link node', ...)
  it('sets fields.linkType = "custom" for external URLs', ...)
  it('sets fields.newTab = false by default', ...)
  it('unwraps <a> with no href attribute', ...)
  it('unwraps <a id="anchor"> with no href', ...)  // Manning pattern
  it('unwraps <a href="#fragment"> fragment-only links', ...)  // Calibre pattern
  it('strips empty <a class="calibre1"><span></span></a> entirely', ...)  // Calibre page breaks
  
  // Lists
  it('converts <ul> to bullet list', ...)
  it('converts <ol> to numbered list', ...)
  it('converts <li> with nested <p> to flat listitem', ...)  // Manning pattern
  it('handles nested <ul> inside <li>', ...)
  
  // Block special cases
  it('converts <blockquote> to quote node', ...)
  it('converts <pre> to code-formatted paragraph', ...)  
  it('strips anchor IDs from inside <pre>', ...)  // Manning pattern
  it('drops <nav> elements silently', ...)
  it('drops <hr> elements silently', ...)
  it('converts Calibre spacer divs (whitespace-only) to nothing', ...)
  
  // Tables
  it('converts basic <table> to table node', ...)
  it('marks <th> cells with headerState: 1', ...)
  it('unwraps <thead>/<tbody>/<tfoot>', ...)
  
  // Edge cases
  it('returns empty root children for content-free spine items', ...)
  it('handles deeply nested spans without stack overflow', ...)
  it('handles UTF-8 multibyte text correctly', ...)
  it('does not produce blob: URLs in output', ...)
})
```

### 9.4 Snapshot Tests for Lexical Output

For each test EPUB, snapshot the Lexical JSON of selected chapters. Snapshots catch regressions automatically after converter changes.

**Selection strategy:** Pick 2-3 chapters per EPUB that cover different content patterns:
- A prose-heavy chapter (tests paragraph/heading/italic)
- A chapter with lists (tests list parsing)
- A chapter with code/technical content (for Fast Python)

Store snapshots in `tests/int/snapshots/` as `.json` files (Vitest's `toMatchSnapshot` stores in `__snapshots__` by default, which is also fine).

**When to update snapshots:** Only when the converter intentionally changes its output. The process should be: `pnpm vitest run --update-snapshots` followed by manual review of the diff.

### 9.5 Integration Test with Real EPUBs

Extend `tests/int/epub-import-utils.int.spec.ts` with tests for each EPUB file:

```typescript
const EPUB_FIXTURES = [
  {
    name: 'Coraline',
    path: 'data/Coraline (Neil G Gaiman) (Z-Library).epub',
    expectations: {
      minChapters: 15,
      chapterIndex: 5,
      expectedTextFragment: 'Coraline discovered',
    }
  },
  // ... other EPUBs
]

for (const fixture of EPUB_FIXTURES) {
  it(`converts a substantive chapter from ${fixture.name} without errors`, async () => {
    const lexical = await loadFirstSubstantiveChapter(fixture.path)
    
    // Structure checks
    expect(lexical.root.children.length).toBeGreaterThan(0)
    
    // No blob URLs
    const json = JSON.stringify(lexical)
    expect(json).not.toContain('blob:')
    
    // All link nodes are v3
    const links = findAllNodesOfType(lexical, 'link')
    for (const link of links) {
      expect(link.version).toBe(3)
      expect(link.fields).toBeDefined()
      expect(link.fields.linkType).toMatch(/^(custom|internal)$/)
    }
    
    // Text round-trip
    const lexicalText = collectAllText(lexical)
    expect(lexicalText).toContain(fixture.expectations.expectedTextFragment)
  })
}
```

### 9.6 Why Not Test the Full React Component With Real EPUBs

`EpubImporter.tsx` (the React component) uses `fetch` to call `/api/books` and `/api/chapters`. Testing it end-to-end in Vitest requires mocking the entire Payload API. The existing `epub-importer.int.spec.ts` does this well for component-level behavior (error handling, progress states, retry logic). 

The important invariant — that the Lexical JSON we send to the API is always valid — is guaranteed by testing `htmlToPayloadLexical` in isolation. The component tests should mock `convertHtmlToChapterLexicalState` (as they already do) and focus on the orchestration logic.

---

## 10. Implementation Roadmap

Each step is self-contained and can be merged independently. Dependencies are noted.

---

### Step 1 — Rewrite `epubLexical.ts`: Custom HTML→Lexical JSON Builder

**Files changed:** `src/utils/epubLexical.ts`

**What to implement:**

Replace the entire file. Remove the `@lexical/headless` and `@lexical/html` imports. Implement `htmlToPayloadLexical(html: string): SerializedEditorState` as a pure function (no async, no editor instance).

The function's structure:

```typescript
// Helper: build a fresh root node
function makeRoot(children: SerializedLexicalNode[]): SerializedEditorState

// Helper: make node shells with all required fields
function makeParagraph(children: SerializedInlineNode[], format?: string, indent?: number): SerializedParagraphNode
function makeHeading(tag: 'h1'|'h2'|'h3'|'h4', children: SerializedInlineNode[]): SerializedHeadingNode
function makeQuote(children: SerializedInlineNode[]): SerializedQuoteNode
function makeList(listType: 'bullet'|'number'|'check', tag: 'ul'|'ol', items: SerializedListItemNode[]): SerializedListNode
function makeListItem(children: SerializedLexicalNode[], value: number, checked?: boolean): SerializedListItemNode
function makeTable(rows: SerializedTableRowNode[]): SerializedTableNode
function makeTableRow(cells: SerializedTableCellNode[]): SerializedTableRowNode
function makeTableCell(children: SerializedInlineNode[], headerState: number, colSpan?: number, rowSpan?: number): SerializedTableCellNode

// Link node — the critical one
function makePayloadLink(url: string, newTab: boolean, children: SerializedInlineNode[]): SerializedPayloadLinkNode

// Text node
function makeText(text: string, format: number): SerializedTextNode
function makeLineBreak(): SerializedLineBreakNode

// Main walker
type WalkContext = { format: number; insidePre: boolean; insideListItem: boolean }
function walkElement(el: Element, ctx: WalkContext): SerializedLexicalNode[]
function walkInline(node: Node, ctx: WalkContext): SerializedTextNode | SerializedPayloadLinkNode | SerializedLineBreakNode | null

// Entry point
export function htmlToPayloadLexical(html: string): SerializedEditorState {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  const children = walkChildren(body, { format: 0, insidePre: false, insideListItem: false })
  const blocks = children.filter(isBlockNode)
  return makeRoot(blocks.length > 0 ? blocks : [makeParagraph([])])
}
```

**Key invariants to enforce:**
- Every node has `version`, `format`, `indent`, `direction` set
- `direction` is always `"ltr"` (we don't do RTL detection at import time)
- Link nodes always have `version: 3` and `fields.linkType`
- `root` always has at least one child (inject an empty paragraph if needed)
- No string value in the output contains `blob:`

**Success criterion:** `pnpm tsx scripts/epub-probe.ts` reports 0 issues for all four test EPUBs.

---

### Step 2 — Fix Image Extraction in `EpubImporter.tsx`

**Files changed:** `src/components/admin/books/EpubImporter.tsx`

**What to change in `prepareChaptersForImport`:**

Currently:
```typescript
await Promise.resolve(section.load(book.load.bind(book)))
const renderedSection = await Promise.resolve(section.render(book.load.bind(book)))
const chapterHTML = typeof renderedSection === 'string' ? renderedSection : section.document?.documentElement?.outerHTML ?? ''
```

Change to:
```typescript
await Promise.resolve(section.load(book.load.bind(book)))
// Use the raw document, skip render() to avoid blob: URL rewriting
const chapterHTML = section.document?.documentElement?.outerHTML ?? ''
```

**What to add to `processPreparedChapter`:**

Move image extraction to work directly on `section.document` elements (which have original relative paths). This requires passing the section's `document` object to `processPreparedChapter` or making the image extraction a separate pass before `prepareChaptersForImport`.

Simplest backward-compatible approach: in `prepareChaptersForImport`, after `section.load()`, extract and immediately replace image src attributes in `section.document` before serializing to `chapterHTML`:

```typescript
// Process images while we have the raw document (original src paths)
const imageElements = Array.from(section.document.querySelectorAll('img[src]'))
for (const [imageIndex, imageElement] of imageElements.entries()) {
  const rawSrc = imageElement.getAttribute('src') ?? ''
  const resolvedAssetPath = resolveEpubAssetPath(spineItem.href ?? '', rawSrc)
  if (!resolvedAssetPath || resolvedAssetPath.startsWith('blob:')) continue
  
  try {
    const uploadedMedia = await uploadAssetAsMedia(/* ... */)
    if (uploadedMedia) {
      imageElement.setAttribute('src', uploadedMedia.url)
    } else {
      imageElement.removeAttribute('src')
    }
  } catch {
    imageElement.removeAttribute('src')
  }
}

// Now serialize — all src are Payload URLs or missing
const chapterHTML = section.document.documentElement.outerHTML
```

**Success criterion:** Zero `"Cannot read properties of undefined"` errors, zero `"Removed unsafe src URL: blob:..."` warnings.

---

### Step 3 — Add the Probe Script

**Files created:** `scripts/epub-probe.ts`

Implement the script as described in Section 9.2. This script should be added to `package.json` as:

```json
"scripts": {
  "epub:probe": "tsx scripts/epub-probe.ts"
}
```

Run it manually as a sanity check. It does not upload anything — it only reads EPUBs and validates the Lexical output.

**Success criterion:** Running `pnpm epub:probe` exits with code 0 and shows 0 ISSUES for all four test EPUBs.

---

### Step 4 — Add Unit Tests for `htmlToPayloadLexical`

**Files created:** `tests/int/epub-lexical.int.spec.ts`

Implement the test cases from Section 9.3. These tests exercise the converter in isolation with manually crafted HTML strings — no EPUB files needed.

**Success criterion:** All tests pass with `pnpm test:int`.

---

### Step 5 — Extend Integration Tests with Real Epub Fixtures

**Files changed:** `tests/int/epub-import-utils.int.spec.ts`

Add tests from Section 9.5 that load real epub files and validate the Lexical output structure.

**Success criterion:** All four test EPUBs produce at least one chapter with valid Lexical state.

---

### Step 6 — Fix Cover Upload

**Files changed:** `src/components/admin/books/EpubImporter.tsx` → `processBookCover`

Change `processBookCover` to use the manifest lookup instead of `book.loaded.cover` directly:

```typescript
// Instead of:
coverPath = await book.loaded.cover

// Use:
const coverItem = book.packaging?.metadata?.cover  // epub 2 cover meta
const coverManifestId = book.packaging?.manifest?.[coverItem]
coverPath = coverManifestId?.href ?? ''
```

Or more robustly: search the manifest for any item with `media-type` starting with `image/` and `properties="cover-image"` (EPUB3) or matching the `<meta name="cover">` id (EPUB2).

**Success criterion:** `"Cover upload failed for Fast Python"` no longer appears in the log.

---

### Step 7 — Minimum Content Check

**Files changed:** `src/utils/epubLexical.ts` or `src/components/admin/books/EpubImporter.tsx`

Add a helper `isSubstantiveChapterContent(lexicalState)` that returns `false` if the chapter only contains empty paragraphs or whitespace-only text nodes. When a prepareChaptersForImport produces a non-substantive chapter, log it as a warning skip rather than submitting it to the API.

```typescript
export function isSubstantiveChapterContent(state: SerializedEditorState): boolean {
  const children = state.root.children
  if (children.length === 0) return false
  
  const hasNonEmptyBlock = children.some((node) => {
    if (!('children' in node)) return false
    const blockChildren = (node as any).children as Array<{type: string; text?: string}>
    return blockChildren.some((child) => 
      child.type === 'text' && typeof child.text === 'string' && child.text.trim().length > 0
    )
  })
  
  return hasNonEmptyBlock
}
```

**Success criterion:** Navigation-only chapters are skipped with a clear warning instead of being rejected by Payload.

---

### Step 8 — Snapshot Tests & CI Gate

**Files created:** `tests/int/snapshots/` directory with initial snapshots

Run `pnpm vitest run --update-snapshots` once to generate initial snapshots after all other steps are complete. Add the snapshots to git. Future changes to the converter that change output will show up as snapshot failures in CI.

---

### Dependency Graph

```
Step 1 (Converter) 
    → Step 4 (Unit tests for converter)
    → Step 5 (Real epub integration tests)
    → Step 8 (Snapshots) — depends on Step 4 + 5

Step 2 (Image extraction) 
    → Step 3 (Probe script) — probe verifies both Step 1 and Step 2 results
    → Step 5 (Real epub integration tests)

Step 6 (Cover) — independent
Step 7 (Min content) — independent, depends on Step 1 being done
```

**Minimum viable fix (must-have):** Steps 1 + 2. These two changes eliminate all three error types from the log.
**Nice to have (should-have):** Steps 3 + 4 + 5 (test coverage).
**Future (could-have):** Steps 6 + 7 + 8 + Phase 4 ToC hierarchy.

---

## 11. Open Questions & Risks

### 11.1 epubjs Version Stability

The importer uses `section.document` after calling `section.load()`. This relies on epubjs's internal document property being populated after load. **Risk:** epubjs's API for `section.document` is not documented as stable — it's an implementation detail. If epubjs changes its rendering internals, `section.document` might no longer be populated.

**Mitigation:** The `section.render()` output is also a valid fallback. If `section.document?.documentElement?.outerHTML` is empty after load, fall back to calling `section.render()` and processing the rendered HTML — accepting that some blob URLs may need to be resolved differently. Add a version pin in `package.json` for `epubjs` (`"epubjs": "^0.3.93"` — pin the minor version).

### 11.2 `$generateNodesFromDOM` vs Direct JSON: Forward Compatibility

Abandoning `@lexical/html`'s `$generateNodesFromDOM` means we miss any future improvements Lexical makes to its HTML importer. However:
- Payload's `richtext-lexical` is already diverged from standard Lexical
- The Payload team controls the feature set; if they add new nodes, we'd need to update the converter regardless
- Direct JSON construction is more transparent and easier to audit for security

**Mitigation:** Document the converter as the canonical implementation. When Payload upgrades `richtext-lexical` with breaking node format changes, run `pnpm epub:probe` to catch regressions immediately.

### 11.3 Payload Version Compatibility

The Payload `LinkNode` version 3 format (with `fields`) is the current format as of Payload 3.60 (`@payloadcms/richtext-lexical` ^3.x). Payload 4.0 may change node formats.

**Mitigation:** The probe script and snapshot tests act as a canary. When upgrading Payload, run the probe before merging the version bump.

### 11.4 Browser API Availability

The new `htmlToPayloadLexical` function uses `DOMParser` and `document.createElement`. Both are standard browser APIs and available in all modern browsers. They are NOT available in Node.js natively — but they ARE available in:
- The browser (EpubImporter runs here ✓)
- The Vitest test environment with jsdom (tests run here ✓)
- The probe script with jsdom polyfill ✓

There is no server-side usage of `htmlToPayloadLexical`, so Node.js compatibility is not required.

### 11.5 Empty `<a>` Anchor Handling

Calibre and Manning both produce `<a>` elements with only an `id` attribute and empty content. The proposed rule is to **drop them entirely**. However, some EPUBs may have `<a id="chapter-2">` at the start of a chapter as a navigation target, and other chapters may link to it with `href="#chapter-2"`. Dropping the anchor makes the internal link a dead link.

**Decision:** Internal fragment links are already stripped by `sanitizeLexicalLinkURLValue` (any `#fragment` href returns null). So both the anchor definition and the anchor reference are removed. This is consistent. Internal links don't work in the Payload reader anyway since content is split into separate Chapter records.

### 11.6 Right-to-Left Languages

The hardcoded `"direction": "ltr"` in all nodes is incorrect for Arabic or Hebrew EPUBs. For the current test set (English + Vietnamese), this is fine. Vietnamese text is LTR. If RTL ebooks are ever added, the converter needs a `detectTextDirection(text): 'ltr' | 'rtl'` helper.

### 11.7 Very Large Chapters

Some technical books have extremely long chapters (Fast Python Chapter 8 is 136KB of HTML). After conversion, the Lexical JSON can be 2-5x larger than the source HTML (because each node has many fields). A 136KB HTML chapter might produce 500KB+ of Lexical JSON. Payload's SQLite adapter stores `BLOB` for richText fields — large blobs are fine for storage but may cause slow renders in the admin editor.

**Mitigation:** The existing batch system in `createChapterBatches` already aims to limit word count per batch. Consider adding a post-conversion check: if `JSON.stringify(lexicalContent).length > 500_000`, warn the user that the chapter is very large.

### 11.8 Calibre CSS Class Detection Completeness

The proposed `getFormatFromClassList` function checks for class names containing "bold" or "italic". This is heuristic and will miss some Calibre-specific classes like `calibre25` or `fm-italics` (seen in Fast Python).

**Mitigation:** The converter should also check computed element style via `window.getComputedStyle` if available. In the browser context (where EpubImporter runs), the EPUB HTML is parsed with `DOMParser` which does NOT apply stylesheets — so computed styles are always empty. We cannot reliably detect CSS-only formatting from within `DOMParser`-created documents.

**Practical implication:** Some italic/bold text from Calibre books will lose its formatting. This is acceptable for a first implementation. A post-import correction pass (with an editor) is the expected workflow for fine formatting.

### 11.9 Concurrency and Rate Limiting

The current implementation has `MAX_PARALLEL_BATCHES = 5` concurrent batch workers. Image uploads happen serially within each chapter. Only batches run concurrently — the chapter loop within each batch runs serially. This means 5 batches process simultaneously, each working through its chapters one at a time.

**Risk:** The `mediaInFlight` Map for in-flight upload deduplication must be shared across all 5 concurrent batch workers to prevent duplicate uploads of the same image. If the Map is defined inside a per-chapter scope rather than as a shared closure, concurrent batches can race to upload the same image 5 times. Verify that `mediaInFlight` is defined at the component scope (or at least the `processImport` call scope) and passed down by reference to all batch workers.

### 11.10 `AutoLinkNode` in Headless Editor

`chapterLexicalNodes.ts` registers both `LinkNode` and `AutoLinkNode` from `@lexical/link`. The plan never mentions `AutoLinkNode`. In the new Phase 1 converter (`htmlToPayloadLexical`), which abandons the headless editor entirely, `AutoLinkNode` is irrelevant. However, `chapterLexicalNodes.ts` is kept for test environment use (Section 6.2). For tests that still use `createHeadlessEditor` with `chapterLexicalNodes`, `AutoLinkNode` is registered but produces no Payload-compatible JSON — any auto-detected URL that becomes an `AutoLinkNode` in the headless editor would fail the same way as a standard `LinkNode`. Tests should either use the new `htmlToPayloadLexical` function directly or ensure no `AutoLinkNode`s appear in test HTML fixtures.

### 11.11 Chapter Source Hash Idempotency

The `chapterSourceHash` field is computed from `sanitizedChapter.html` **after** image `src` attributes have been replaced with Payload CDN URLs. This means:
- First import: `src="https://cdn.payload.dev/media/image-abc123.jpg"` → hash includes CDN URL
- Re-import after CDN URL changes (e.g., new deployment domain): hash differs → chapter treated as modified

For idempotent re-imports to correctly detect unchanged chapters, the hash should be computed from the HTML **before** image URL substitution (i.e., from the original relative paths or archive paths). Consider computing `chapterSourceHash` from the raw sanitized HTML before image src replacement, and storing the pre-substitution HTML as the canonical hash input.

---

## Appendix A: Payload Lexical Node Reference

Quick reference for the exact JSON shape of each node type, derived from the installed `@payloadcms/richtext-lexical` source:

```typescript
// All nodes share these base fields:
type LexicalBaseNode = {
  version: number     // Usually 1, except link which is 3
  format: '' | number // String '' for block nodes, number for text nodes
  indent: number      // 0 for most
  direction: 'ltr' | 'rtl' | null
  children?: LexicalNode[]
}

// --- Block nodes ---
type SerializedParagraphNode = LexicalBaseNode & {
  type: 'paragraph'
  version: 1
  textFormat: number   // 0
  textStyle: string    // ''
}

type SerializedHeadingNode = LexicalBaseNode & {
  type: 'heading'
  version: 1
  tag: 'h1' | 'h2' | 'h3' | 'h4'
}

type SerializedQuoteNode = LexicalBaseNode & {
  type: 'quote'
  version: 1
}

type SerializedListNode = LexicalBaseNode & {
  type: 'list'
  version: 1
  listType: 'bullet' | 'number' | 'check'
  tag: 'ul' | 'ol'
  start: number        // 1
}

type SerializedListItemNode = LexicalBaseNode & {
  type: 'listitem'
  version: 1
  value: number        // 1-indexed position
  checked: boolean     // false for non-check lists
}

// --- Inline nodes ---
type SerializedTextNode = {
  type: 'text'
  version: 1
  text: string
  format: number       // bitmask: bold=1, italic=2, strikethrough=4, underline=8, code=16
  mode: 'normal' | 'token' | 'segmented'
  style: string        // ''
  detail: number       // 0
}

type SerializedLineBreakNode = {
  type: 'linebreak'
  version: 1
}

// --- Payload-specific link node (NOT @lexical/link standard) ---
type SerializedPayloadLinkNode = {
  type: 'link'
  version: 3           // Critical: must be 3, not 1
  format: ''
  indent: 0
  direction: 'ltr'
  children: SerializedInlineNode[]
  fields: {
    linkType: 'custom' | 'internal'
    url: string        // Only present when linkType === 'custom'
    newTab: boolean
    doc?: {            // Only present when linkType === 'internal'
      value: string | number
      relationTo: string
    }
  }
  id?: string
}

// --- Table nodes ---
type SerializedTableNode = LexicalBaseNode & { type: 'table'; version: 1 }
type SerializedTableRowNode = LexicalBaseNode & { type: 'tablerow'; version: 1 }
type SerializedTableCellNode = LexicalBaseNode & {
  type: 'tablecell'
  version: 1
  colSpan: number       // 1
  rowSpan: number       // 1
  headerState: number   // 0 = data cell, 1 = header cell
  width: number | null  // null
  backgroundColor: string | null  // null
}
```

---

## Appendix B: EPUB Format Quick Reference

| Property | EPUB 2 Location | EPUB 3 Location |
|---|---|---|
| Title | `content.opf > metadata > dc:title` | Same |
| Author | `content.opf > metadata > dc:creator` | Same |
| Language | `content.opf > metadata > dc:language` | Same |
| Cover image id | `content.opf > metadata > meta[name=cover]/@content` | `content.opf > metadata > meta[property=cover-image]` or manifest item with `properties="cover-image"` |
| Spine order | `content.opf > spine > itemref @idref` | Same |
| ToC file | `content.opf > manifest item[media-type=application/x-dtbncx+xml]` (NCX) | `content.opf > manifest item[properties=nav]` (NAV HTML) |
| Asset manifest | `content.opf > manifest > item @href @media-type` | Same |
| Chapter XHTML | `content.opf > manifest > item[media-type=application/xhtml+xml]` | Same; may have `epub:type` attributes |

---
*Document compiled April 2026 — based on analysis of `src/utils/epubLexical.ts`, `src/components/admin/books/EpubImporter.tsx`, `src/utils/epubImport.ts`, `src/collections/Chapters.ts`, `docs/book-importer.md`, and the four test EPUB files in `data/`.*
