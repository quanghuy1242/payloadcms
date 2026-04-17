# Internal Link: Editor Visibility, Frontend Resolution, and Manual Authoring Plan

> **Document purpose**: Tracks everything needed to turn `epub-internal-link` from an invisible
> import sentinel into a fully functional cross-chapter navigation system - covering the admin
> Lexical editor, the user-facing frontend renderer, and a manual authoring workflow for
> chapter-to-chapter links that do not originate from an EPUB import.
>
> Related documents: `docs/book_clean_code.md` (backlog T3-1), `src/features/epub-internal-link/`

---

## Table of Contents

1. [Current State and Problem Statement](#1-current-state-and-problem-statement)
   - 1.1 [What epub-internal-link is Today](#11-what-epub-internal-link-is-today)
   - 1.2 [The Three Gaps](#12-the-three-gaps)
   - 1.3 [Data Loss Risk Analysis](#13-data-loss-risk-analysis)
2. [Quick Fix: DeleteBookButton Bug](#2-quick-fix-deletebookbutton-bug)
   - 2.1 [Root Cause](#21-root-cause)
   - 2.2 [The Fix](#22-the-fix)
   - 2.3 [Acceptance Criteria](#23-acceptance-criteria)
3. [Phase 1: Editor Visibility](#3-phase-1-editor-visibility)
   - 3.1 [Goal](#31-goal)
   - 3.2 [Why ElementNode is the Right Base](#32-why-elementnode-is-the-right-base)
   - 3.3 [Implementation: CSS Styling in createDOM](#33-implementation-css-styling-in-createdom)
   - 3.4 [Tooltip via Lexical Plugin](#34-tooltip-via-lexical-plugin)
   - 3.5 [Files Changed](#35-files-changed)
   - 3.6 [Acceptance Criteria](#36-acceptance-criteria)
4. [Phase 2: Frontend Resolution Utility](#4-phase-2-frontend-resolution-utility)
   - 4.1 [Resolution Algorithm](#41-resolution-algorithm)
   - 4.2 [The Flattened TOC Problem](#42-the-flattened-toc-problem)
   - 4.3 [epubHref Normalization Rules](#43-epubhref-normalization-rules)
   - 4.4 [The resolveEpubInternalLinks Utility](#44-the-resolveepubinternallinks-utility)
   - 4.5 [Chapter Page Integration](#45-chapter-page-integration)
   - 4.6 [Files to Create and Change](#46-files-to-create-and-change)
   - 4.7 [Acceptance Criteria](#47-acceptance-criteria)
5. [Phase 3: Manual Chapter-to-Chapter Linking](#5-phase-3-manual-chapter-to-chapter-linking)
   - 5.1 [The Use Case](#51-the-use-case)
   - 5.2 [Architecture Decision: One Node or Two?](#52-architecture-decision-one-node-or-two)
   - 5.3 [Chosen Approach: Separate chapter-link Node](#53-chosen-approach-separate-chapter-link-node)
   - 5.4 [chapter-link Node Design](#54-chapter-link-node-design)
   - 5.5 [Admin Toolbar Button and Chapter Picker](#55-admin-toolbar-button-and-chapter-picker)
   - 5.6 [Frontend Rendering for chapter-link Nodes](#56-frontend-rendering-for-chapter-link-nodes)
   - 5.7 [Files to Create and Change](#57-files-to-create-and-change)
   - 5.8 [Acceptance Criteria](#58-acceptance-criteria)
6. [Interaction Between the Two Node Types](#6-interaction-between-the-two-node-types)
   - 6.1 [Serialization Contract Side-by-Side](#61-serialization-contract-side-by-side)
   - 6.2 [Frontend Renderer Decision Tree](#62-frontend-renderer-decision-tree)
   - 6.3 [Admin Editor Visual Differentiation](#63-admin-editor-visual-differentiation)
7. [Migration and Schema Considerations](#7-migration-and-schema-considerations)
8. [Test Strategy](#8-test-strategy)
   - 8.1 [Unit Tests](#81-unit-tests)
   - 8.2 [Integration Tests](#82-integration-tests)
   - 8.3 [E2E Tests](#83-e2e-tests)
9. [Implementation Order and Task Breakdown](#9-implementation-order-and-task-breakdown)

---

## 1. Current State and Problem Statement

### 1.1 What epub-internal-link is Today

During EPUB import, `htmlToPayloadLexical` in `src/utils/epubLexical.ts` encounters `<a>` tags
whose `href` is a relative EPUB path (e.g., `../Text/chapter02.xhtml#section3`). Because the
target chapter may not exist yet at import time, the importer emits a sentinel node instead of
trying to resolve the link:

```json
{
  "type": "epub-internal-link",
  "version": 1,
  "fields": { "epubHref": "../Text/chapter02.xhtml#section3" },
  "children": [{ "type": "text", "text": "Chapter 2" }]
}
```

The node class (`src/features/epub-internal-link/nodes/EpubInternalLinkNode.ts`) extends
`ElementNode`. Its `createDOM()` produces:

```html
<span data-epub-href="../Text/chapter02.xhtml#section3">Chapter 2</span>
```

The client feature (`feature.client.ts`) registers the node class but adds no editor-side
React component, plugin, or CSS. The server feature (`feature.server.ts`) serializes the node
back to the same `<span>` for any HTML export.

### 1.2 The Three Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| **G1: Editor invisibility** | The sentinel node renders as plain-looking text in the Lexical admin editor. No color, badge, icon, or tooltip distinguishes it from regular inline text. | Admin editors cannot tell which words are cross-chapter links and may unknowingly delete or rewrite them. |
| **G2: No frontend resolver** | There is no user-facing renderer that converts `epubHref` to an actual chapter URL. The book chapter page does not exist yet. | All internal links in imported books (including the entire Table of Contents chapter) silently render as unlinked plain text. |
| **G3: No manual authoring path** | There is no way for an admin to intentionally create a chapter-to-chapter link in the Lexical editor. The sentinel exists only as a byproduct of EPUB import. | Manually authored chapters, or chapters edited after import, cannot reference other chapters. |

### 1.3 Data Loss Risk Analysis

The `EpubInternalLinkNode` as an `ElementNode` behaves as follows in the Lexical editor:

- **Save/load round-trip**: safe. `exportJSON()` serializes `fields.epubHref` and all children.
  `importJSON()` reconstructs the node correctly. Clicking Save in the admin while text children
  are intact will NOT lose the node.

- **`canBeEmpty(): false`**: Lexical's node normalization removes any `ElementNode` whose
  `canBeEmpty()` returns `false` when its last child is deleted. If an admin positions their
  cursor inside the span and deletes all the text, the sentinel node is silently removed on the
  next normalization tick.

- **`canInsertTextBefore()` and `canInsertTextAfter()` returning `false`**: this prevents text
  from being inserted directly adjacent to the node inside the editor. This is the correct
  behavior for an inline container but provides no protection against the user deleting the
  content inside it.

- **Editor-level consequence**: since the node has no visual indicator, an admin editing a
  chapter has no reliable way to know a sentinel is there. Cursor movement near the span feels
  identical to moving through regular text. The risk is low for read-only imports, but increases
  when admins are asked to "clean up" chapter content after import.

**Mitigation needed**: Phase 1 (editor visibility) reduces this risk by making the node
visually distinct. Phase 3 (manual authoring) reduces it further by giving admins a way to
intentionally re-add a link if one is accidentally removed.

---

## 2. Quick Fix: DeleteBookButton Bug

### 2.1 Root Cause

`src/components/admin/books/DeleteBookButton.tsx` contains this guard:

```tsx
if (!isLoading && chapterCount === 0) {
  return null
}
```

When all chapters have been deleted, `chapterCount` reaches `0` and the button disappears
entirely. The button is also unconditionally rendered as `disabled` with no `onClick`
handler, meaning even in its visible state it is purely decorative - it tells the user why
they cannot delete, but provides no path to actually do so.

The intended behavior is:
- When `chapterCount > 0`: show disabled button with "Remove all chapters first" tooltip.
- When `chapterCount === 0`: show enabled button that triggers the Payload REST delete.
- When `isLoading`: show disabled button with "Checking..." tooltip.

### 2.2 The Fix

The fix involves three changes to `DeleteBookButton.tsx`:

1. Remove the `return null` when `chapterCount === 0`.
2. Add a `handleDelete` callback that calls `DELETE /api/books/:id` and redirects.
3. Pass `disabled` only when `isLoading || (chapterCount !== null && chapterCount > 0)`.

```tsx
'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'
import { requestJSON } from '@/utils/http'

const DeleteBookButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [chapterCount, setChapterCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(bookId != null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ... (existing useEffect hooks for fetching chapterCount remain unchanged) ...

  const handleDelete = useCallback(async () => {
    if (bookId == null || isDeleting) return
    if (!window.confirm('Delete this book? This action cannot be undone.')) return

    setIsDeleting(true)
    try {
      await requestJSON(`/api/books/${bookId}`, { method: 'DELETE' })
      router.push('/admin/collections/books')
    } catch {
      setIsDeleting(false)
    }
  }, [bookId, isDeleting, router])

  if (bookId == null) {
    return null
  }

  const canDelete = !isLoading && !isDeleting && chapterCount === 0
  const isDisabled = !canDelete

  const tooltip = isLoading || isDeleting
    ? 'Checking chapter count before deleting this book.'
    : chapterCount !== null && chapterCount > 0
      ? 'Remove all chapters before deleting this book.'
      : undefined

  return (
    <Button
      buttonStyle="secondary"
      disabled={isDisabled}
      onClick={canDelete ? handleDelete : undefined}
      size="medium"
      tooltip={tooltip}
    >
      {isDeleting ? 'Deleting...' : 'Delete book'}
    </Button>
  )
}

export default DeleteBookButton
```

**Why `window.confirm` is acceptable here**: this is an irreversible destructive action in an
authenticated admin context. A confirm dialog is the appropriate minimal safeguard. Do not
replace with a custom modal unless UX requirements change.

### 2.3 Acceptance Criteria

- When a book has 0 chapters, the Delete book button is visible and clickable.
- Clicking it shows a browser confirm dialog.
- On confirm, `DELETE /api/books/:id` is called and the user is redirected to the books list.
- On cancel, nothing changes.
- When a book has 1+ chapters, the button is visible but disabled with the "Remove all
  chapters" tooltip.
- When the chapter count is loading, the button is visible but disabled with the "Checking"
  tooltip.
- The existing `BOOK_CHAPTERS_UPDATED_EVENT` listener continues to refresh the count when
  chapters are deleted from within the same admin session.
- Existing tests in `tests/int/books-admin-components.int.spec.ts` continue to pass after
  the fix. Add a new test case for the `chapterCount === 0` branch.

---

## 3. Phase 1: Editor Visibility

### 3.1 Goal

Make `epub-internal-link` nodes visually distinguishable from regular text in the Lexical
admin editor so that:
- Admins can see at a glance that a word or phrase is an unresolved cross-chapter link.
- Admins know not to delete the text inside without a deliberate intent.
- The visual style clearly conveys "this is a sentinel — it was imported and will be resolved
  at read time."

The goal is NOT to make the node interactive from the editor (that is Phase 3). It is purely
cosmetic: a color + underline + optional tooltip on hover.

### 3.2 Why ElementNode is the Right Base

`EpubInternalLinkNode` extends `ElementNode`, not `DecoratorNode`. This is the correct choice
for a node that wraps text children (i.e., the visible link text). `DecoratorNode` does not
have Lexical child nodes — it renders its entire visual through a React component, which means
the text content would have to be stored as a field and would not be editable inline.

`ElementNode` with `createDOM()` → the text children live inside a `<span>`. The admin can
edit the link text directly, which is the desired behavior. The challenge is that Lexical's
admin editor does not apply any CSS to custom `ElementNode` spans unless told to.

Changing from `ElementNode` to `DecoratorNode` is NOT recommended at this stage because:
1. It would require storing the visible text as a field rather than child nodes, breaking the
   existing serialization contract.
2. All existing EPUB-imported chapters in the database would need a data migration.
3. The benefit (full React control of rendering) is not needed for Phase 1 — CSS is enough.

### 3.3 Implementation: CSS Styling in createDOM

The simplest approach is to add inline styles to the DOM element in `createDOM()`. Inline
styles are safe in Lexical because they are applied directly to the content-editable element
and are not subject to theme class availability.

```typescript
// In EpubInternalLinkNode.ts
createDOM(_config: EditorConfig): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute('data-epub-href', this.__fields.epubHref)
  // Visually distinguishable: amber underline + slightly dimmer text to signal "unresolved"
  element.style.cssText = [
    'text-decoration: underline',
    'text-decoration-style: dashed',
    'text-decoration-color: #d97706',  // amber-600, visible on both light and dark editor themes
    'color: inherit',
    'cursor: help',
  ].join('; ')
  return element
}
```

The `cursor: help` provides a subtle visual cue that hovering will show additional information
(pairing with the tooltip plugin in Section 3.4).

`updateDOM` already handles href changes but should also reapply the style if needed:

```typescript
updateDOM(prevNode: EpubInternalLinkNode, dom: HTMLElement): boolean {
  if (prevNode.__fields.epubHref !== this.__fields.epubHref) {
    dom.setAttribute('data-epub-href', this.__fields.epubHref)
  }
  return false  // false = DOM does not need to be replaced
}
```

The style is static and does not need to be re-applied on update (it is set once in
`createDOM`). `updateDOM` returning `false` means Lexical re-uses the existing DOM element,
so the style persists automatically.

### 3.4 Tooltip via Lexical Plugin

A lightweight Lexical plugin can add a `title` attribute to the span on mount, which gives a
browser-native tooltip showing the raw `epubHref`. This avoids needing a custom UI component:

```tsx
// src/features/epub-internal-link/plugin/index.tsx
'use client'

import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import { $getRoot } from '@payloadcms/richtext-lexical/lexical'
import { $isEpubInternalLinkNode } from '../nodes/EpubInternalLinkNode'

// Registers a DOM mutation observer that adds a title attribute to all
// epub-internal-link span elements so the raw epubHref is visible on hover.
export function EpubInternalLinkTooltipPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerMutationListener(
      // Import from the node module to avoid circular references
      // This approach uses Lexical's built-in mutation listener
      (mutations) => {
        editor.update(() => {
          // no-op: DOM update happens via registerMutationListener callback
        })
        mutations.forEach((mutation, key) => {
          if (mutation === 'created' || mutation === 'updated') {
            const element = editor.getElementByKey(key)
            if (element instanceof HTMLElement && element.hasAttribute('data-epub-href')) {
              const href = element.getAttribute('data-epub-href') ?? ''
              element.setAttribute('title', `Unresolved EPUB link → ${href}`)
            }
          }
        })
      },
    )
  }, [editor])

  return null
}
```

Register this plugin in `feature.client.ts`:

```typescript
// feature.client.ts
'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'
import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'
import { EpubInternalLinkTooltipPlugin } from './plugin/index'

export const EpubInternalLinkFeatureClient = createClientFeature({
  nodes: [EpubInternalLinkNode],
  plugins: [
    {
      Component: EpubInternalLinkTooltipPlugin,
      position: 'normal',
    },
  ],
})
```

Note: if `registerMutationListener` is not directly available in the version of
`@payloadcms/richtext-lexical` being used, the tooltip can be applied via a simpler
`useEffect` that queries all `[data-epub-href]` elements after the editor is mounted. The
exact API should be confirmed against the installed Lexical version before implementation.

### 3.5 Files Changed

| File | Change |
|------|--------|
| `src/features/epub-internal-link/nodes/EpubInternalLinkNode.ts` | Add inline styles to `createDOM()` |
| `src/features/epub-internal-link/feature.client.ts` | Register tooltip plugin |
| `src/features/epub-internal-link/plugin/index.tsx` | New file: tooltip plugin |

### 3.6 Acceptance Criteria

- Opening a Lexical editor containing an `epub-internal-link` node shows the wrapped text with
  a dashed amber underline distinct from regular text and standard `link` nodes.
- Hovering over the node shows a browser tooltip with the raw `epubHref` value.
- The node round-trips through save/load without losing its `fields.epubHref` or children.
- No visual change to other Lexical node types (paragraphs, headings, links, callouts,
  footnotes).

---

## 4. Phase 2: Frontend Resolution Utility

### 4.1 Resolution Algorithm

At read time, when a user-facing chapter page renders a Lexical document that contains
`epub-internal-link` nodes, it needs to convert each `epubHref` into a navigable URL. The
page already knows which book the chapter belongs to, so it can co-fetch the full chapter
list for that book and build a resolution map.

The algorithm for a single `epub-internal-link` node:

```
input: epubHref (e.g. "../Text/chapter02.xhtml#section3")
input: chapters[] (all chapters for the book, each with chapterSourceKey + slug/id)

1. Split epubHref into (pathPart, fragment):
   - pathPart = everything before the first "#"
   - fragment = everything after the first "#" (or empty string)

2. If pathPart is empty (e.g. epubHref = "#section3"):
   - This is an in-page anchor. Render as <a href="#section3">{children}</a>.
   - No chapter lookup needed.

3. Normalize pathPart:
   - Strip query parameters: remove "?..." from pathPart
   - Strip leading "./" or "../" to get a bare filename-ish path
   - Normalize to the tail component if the chapterSourceKey format stores full paths
     (e.g. "OEBPS/Text/chapter02.xhtml" → try both the full path and just "chapter02.xhtml")

4. Lookup: find the chapter whose chapterSourceKey contains or ends with normalizedPath.
   - The chapterSourceKey format is: "<toc-id>::<spine-href>::<order>"
     (see buildChapterSourceKey in src/utils/epubImport.ts)
   - Extract the spine-href portion from chapterSourceKey and normalize it the same way.
   - Match on the normalized spine-href.

5. If found: render as <Link href="/books/{bookSlug}/{chapterSlug}#{fragment}">{children}</Link>
   - If fragment is empty, omit the hash.

6. If not found: render children as plain text (fallback — identical to current behavior).
```

### 4.2 The Flattened TOC Problem

EPUB books can have deeply nested Tables of Contents. A TOC entry like:

```
Part 1 (part1.xhtml)
  Chapter 1 (ch1.xhtml)
    Section 1.1 (ch1.xhtml#section-1-1)
    Section 1.2 (ch1.xhtml#section-1-2)
  Chapter 2 (ch2.xhtml)
```

In this repo, each spine item (each `.xhtml` file) becomes one Payload chapter. The nested
TOC entries that point to in-file anchors (like `ch1.xhtml#section-1-1`) are NOT separate
chapters — they are headings within the same chapter.

This means:
- `ch1.xhtml#section-1-1` resolves to: chapter for `ch1.xhtml`, with fragment `#section-1-1`.
- The chapter page must render its headings with `id` attributes matching the fragment so
  in-page navigation works (standard browser behavior via `<h2 id="section-1-1">`).
- The EPUB importer should preserve heading `id` attributes during HTML sanitization and
  Lexical conversion. **This needs to be verified** — check `epubLexical.ts` to confirm
  `id` attributes on heading elements are preserved in the Lexical output.

There is no parent-child chapter relationship in the Payload `Chapters` collection. All
chapters are flat. Deep TOC hierarchies are navigated via in-page hash links within a single
chapter page, not via separate chapter pages.

**Implication for the resolution algorithm**: the algorithm does NOT need to understand TOC
nesting depth. It only needs to:
1. Identify which spine file (chapter) the `epubHref` points to.
2. Pass through the fragment unchanged.

### 4.3 epubHref Normalization Rules

EPUB `href` values can appear in several forms. The normalizer must handle all of them:

| Input | Normalized path | Fragment |
|-------|----------------|----------|
| `chapter02.xhtml` | `chapter02.xhtml` | `` |
| `../Text/chapter02.xhtml` | `Text/chapter02.xhtml` | `` |
| `../Text/chapter02.xhtml#s3` | `Text/chapter02.xhtml` | `s3` |
| `chapter02.xhtml?foo=1#s3` | `chapter02.xhtml` | `s3` |
| `#s3` | `` | `s3` (in-page anchor) |
| `./chapter02.xhtml` | `chapter02.xhtml` | `` |
| `OEBPS/Text/chapter02.xhtml` | (keep as-is, fallback to tail) | `` |

The `chapterSourceKey` stores the full spine href as the middle segment (e.g.,
`toc-1-1::OEBPS/Text/chapter02.xhtml::3`). The normalizer should:
1. Extract the spine href from the chapterSourceKey (split on `::`, take index 1).
2. Normalize both the stored spine href and the incoming `epubHref` to their filename tails
   (basename without directory), then compare.
3. If basename comparison is ambiguous (two chapters with the same filename in different
   directories), fall back to suffix matching on the full path.

### 4.4 The resolveEpubInternalLinks Utility

Create `src/utils/epubLinkResolver.ts`:

```typescript
// src/utils/epubLinkResolver.ts
//
// Server-safe. No browser APIs. Used by the chapter page to pre-process
// the Lexical JSON tree before rendering, replacing epub-internal-link nodes
// with resolved { href, children } data structures.

export type ChapterSummary = {
  id: number | string
  slug: string
  chapterSourceKey: string | null | undefined
}

export type ResolvedInternalLink =
  | { resolved: true; href: string; fragment: string }
  | { resolved: false }

/**
 * Splits an EPUB href into its path and fragment components.
 * Returns { path: '', fragment: 'x' } for in-page anchors like '#x'.
 */
export function splitEpubHref(epubHref: string): { path: string; fragment: string } {
  const hashIdx = epubHref.indexOf('#')
  if (hashIdx === -1) {
    return { path: epubHref, fragment: '' }
  }
  return {
    path: epubHref.slice(0, hashIdx),
    fragment: epubHref.slice(hashIdx + 1),
  }
}

/**
 * Normalizes an EPUB path to a comparable form.
 * Strips query parameters, leading ./ or ../ segments, and lowercases the result.
 * Returns '' for empty or fragment-only hrefs.
 */
export function normalizeEpubPath(path: string): string {
  if (!path) return ''
  // Strip query string
  const qIdx = path.indexOf('?')
  const stripped = qIdx !== -1 ? path.slice(0, qIdx) : path
  // Remove leading ./ and ../
  const clean = stripped.replace(/^(\.\.\/|\.\/)+/, '')
  return clean.toLowerCase()
}

/**
 * Extracts the spine href from a chapterSourceKey.
 * chapterSourceKey format: "<toc-id>::<spine-href>::<order>"
 * Returns null if the key does not match the expected format.
 */
export function spineHrefFromSourceKey(chapterSourceKey: string): string | null {
  const parts = chapterSourceKey.split('::')
  return parts.length >= 2 ? (parts[1] ?? null) : null
}

/**
 * Resolves an epubHref to a chapter URL.
 *
 * @param epubHref - Raw href stored in the epub-internal-link sentinel node.
 * @param chapters - All chapters for the book, with their chapterSourceKey and slug.
 * @param bookSlug - The book's URL slug, used to build the full chapter URL.
 * @returns Resolved link data, or { resolved: false } if no matching chapter is found.
 */
export function resolveEpubHref(
  epubHref: string,
  chapters: ChapterSummary[],
  bookSlug: string,
): ResolvedInternalLink {
  const { path, fragment } = splitEpubHref(epubHref)

  // In-page anchor: no chapter lookup needed.
  if (!path) {
    return { resolved: true, href: `#${fragment}`, fragment }
  }

  const normalizedInput = normalizeEpubPath(path)
  // Basename for fallback matching (last path segment)
  const inputBasename = normalizedInput.split('/').pop() ?? normalizedInput

  for (const chapter of chapters) {
    if (!chapter.chapterSourceKey) continue

    const spineHref = spineHrefFromSourceKey(chapter.chapterSourceKey)
    if (!spineHref) continue

    const normalizedSpine = normalizeEpubPath(spineHref)
    const spineBasename = normalizedSpine.split('/').pop() ?? normalizedSpine

    // Primary: full normalized path match
    if (normalizedSpine === normalizedInput) {
      const href = fragment
        ? `/books/${bookSlug}/${chapter.slug}#${fragment}`
        : `/books/${bookSlug}/${chapter.slug}`
      return { resolved: true, href, fragment }
    }

    // Fallback: basename match (handles different relative path depths)
    if (spineBasename === inputBasename) {
      const href = fragment
        ? `/books/${bookSlug}/${chapter.slug}#${fragment}`
        : `/books/${bookSlug}/${chapter.slug}`
      return { resolved: true, href, fragment }
    }
  }

  return { resolved: false }
}
```

**Important**: this utility is server-safe (no browser APIs). It can be called during SSR
in the chapter page component without hitting the browser/server boundary.

### 4.5 Chapter Page Integration

The chapter page (to be created at `src/app/(payload)/books/[bookSlug]/[chapterSlug]/page.tsx`
or wherever the frontend routing lives) must:

1. Fetch the chapter by slug.
2. Fetch all sibling chapters for the book (for the resolution map and navigation).
3. Pass both to the Lexical renderer.
4. The renderer walks the Lexical JSON and, for each `epub-internal-link` node, calls
   `resolveEpubHref(node.fields.epubHref, chapters, bookSlug)`.

This does NOT require any database writes. It is a pure read-time transformation of the
Lexical JSON before rendering. The chapter data in the database remains unchanged.

**Custom Lexical JSX renderer pattern**:
Payload's `@payloadcms/richtext-lexical/react` exposes `RichText` and `JSXConverters`. For
`epub-internal-link` nodes, register a custom JSX converter that uses `resolveEpubHref`:

```tsx
// In the chapter page or a shared JSX converters file:
import { JSXConverters } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import { resolveEpubHref, type ChapterSummary } from '@/utils/epubLinkResolver'

export function buildChapterJSXConverters(
  chapters: ChapterSummary[],
  bookSlug: string,
): JSXConverters {
  return {
    'epub-internal-link': ({ node, nodesToJSX }) => {
      const result = resolveEpubHref(node.fields.epubHref, chapters, bookSlug)
      const children = nodesToJSX({ nodes: node.children })

      if (!result.resolved) {
        // Unresolved fallback: render as plain span (same as today)
        return <span>{children}</span>
      }

      return <Link href={result.href}>{children}</Link>
    },
  }
}
```

### 4.6 Files to Create and Change

| File | Action | Notes |
|------|--------|-------|
| `src/utils/epubLinkResolver.ts` | Create | Core resolution utility. No browser APIs. |
| Chapter page component (path TBD) | Create | Fetches chapters, uses `buildChapterJSXConverters` |
| `src/utils/epubLexical.ts` | Verify | Confirm heading `id` attributes are preserved during conversion |

### 4.7 Acceptance Criteria

- `resolveEpubHref('../Text/ch2.xhtml#s3', chapters, 'my-book')` returns
  `{ resolved: true, href: '/books/my-book/chapter-2#s3', fragment: 's3' }` when a chapter
  with the matching `chapterSourceKey` exists.
- `resolveEpubHref('#s3', chapters, 'my-book')` returns
  `{ resolved: true, href: '#s3', fragment: 's3' }` (in-page anchor, no lookup).
- `resolveEpubHref('appendix-z.xhtml', chapters, 'my-book')` returns `{ resolved: false }`
  when no matching chapter exists (appendix not imported).
- The chapter page renders `epub-internal-link` nodes as Next.js `<Link>` components when
  resolved, and as plain `<span>` when unresolved.
- Unit tests in `tests/int/epub-link-resolver.int.spec.ts` cover all normalization cases in
  the table in Section 4.3.

---

## 5. Phase 3: Manual Chapter-to-Chapter Linking

### 5.1 The Use Case

An admin is writing or editing a chapter in the Payload Lexical editor and wants to insert a
link that points to another chapter in the same book. This is different from the `epub-internal-link`
sentinel because:

- There is no EPUB href to store — the target chapter is identified by its Payload record ID.
- The admin selects the target chapter from a UI picker, not from an EPUB file.
- The link should be immediately "resolved" (it has a known chapter ID from creation time).
- The link should survive re-imports (if the chapter is re-imported with new content, the
  admin-authored chapter-to-chapter link should still work).

### 5.2 Architecture Decision: One Node or Two?

**Option A: Extend `epub-internal-link` with an optional `chapterId` field**

```json
{
  "type": "epub-internal-link",
  "fields": {
    "epubHref": "",
    "chapterId": 42,
    "fragment": "section-3"
  }
}
```

Pros: one node type to register and render.
Cons:
- Conflates two distinct concepts (unresolved EPUB sentinel vs. authored database reference).
- The presence of `chapterId` changes the resolution semantics entirely. Code that
  processes these nodes has to branch on `fields.chapterId ?? null`.
- Future: if `epub-internal-link` nodes are eventually patched server-side (T3-1 server
  approach) to replace themselves with standard `link` nodes, the two-mode extension
  complicates that migration.

**Option B: Separate `chapter-link` node**

```json
{
  "type": "chapter-link",
  "fields": {
    "chapterId": 42,
    "fragment": "section-3"
  },
  "children": [{ "type": "text", "text": "See Chapter 2" }]
}
```

Pros:
- Clean separation of concerns: `epub-internal-link` = EPUB-origin, `chapter-link` = admin-authored.
- Each node type has a single, clear resolution strategy.
- The admin editor can offer different UI for each (EPUB sentinel = read-only badge;
  chapter-link = editable with a picker).
- No risk of contaminating existing EPUB-imported data with a new field shape.

Cons:
- Two nodes to register, maintain, and render.

**Decision: Option B — separate `chapter-link` node.**

### 5.3 Chosen Approach: Separate chapter-link Node

The `chapter-link` node:

- Stores `{ chapterId: number, fragment?: string }` in `fields`.
- Extends `ElementNode` (same as `epub-internal-link`) to wrap editable text children.
- Registered in `src/features/chapter-link/`.
- Has a full editor UI: a toolbar insert button and a floating edit toolbar when selected.
- On the frontend, resolved by chapter ID (direct lookup — no href normalization needed).

### 5.4 chapter-link Node Design

```typescript
// src/features/chapter-link/nodes/ChapterLinkNode.ts

export type SerializedChapterLinkNode = Spread<
  {
    fields: {
      chapterId: number | string
      fragment?: string
    }
  },
  StronglyTypedElementNode<SerializedElementNode, 'chapter-link', SerializedLexicalNode>
>

export class ChapterLinkNode extends ElementNode {
  __fields: { chapterId: number | string; fragment?: string }

  static getType() { return 'chapter-link' }

  static clone(node: ChapterLinkNode) {
    return new ChapterLinkNode(node.__fields, node.__key)
  }

  static importJSON(serialized: SerializedChapterLinkNode): ChapterLinkNode {
    return new ChapterLinkNode(serialized.fields).updateFromJSON(serialized)
  }

  constructor(fields: { chapterId: number | string; fragment?: string }, key?: NodeKey) {
    super(key)
    this.__fields = fields
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('span')
    el.setAttribute('data-chapter-id', String(this.__fields.chapterId))
    if (this.__fields.fragment) {
      el.setAttribute('data-chapter-fragment', this.__fields.fragment)
    }
    // Visual: solid blue underline — distinct from epub-internal-link's dashed amber
    el.style.cssText = [
      'text-decoration: underline',
      'text-decoration-color: #2563eb',  // blue-600
      'cursor: pointer',
    ].join('; ')
    return el
  }

  updateDOM(prevNode: ChapterLinkNode, dom: HTMLElement): boolean {
    if (prevNode.__fields.chapterId !== this.__fields.chapterId) {
      dom.setAttribute('data-chapter-id', String(this.__fields.chapterId))
    }
    if (prevNode.__fields.fragment !== this.__fields.fragment) {
      if (this.__fields.fragment) {
        dom.setAttribute('data-chapter-fragment', this.__fields.fragment)
      } else {
        dom.removeAttribute('data-chapter-fragment')
      }
    }
    return false
  }

  exportJSON(): SerializedChapterLinkNode {
    return {
      ...super.exportJSON(),
      type: 'chapter-link',
      fields: this.__fields,
      version: 1,
    }
  }

  canBeEmpty(): false { return false }
  isInline(): true { return true }
  canInsertTextBefore(): false { return false }
  canInsertTextAfter(): false { return false }
}
```

### 5.5 Admin Toolbar Button and Chapter Picker

The editor toolbar needs an "Insert chapter link" button. When clicked, it opens a floating
panel or modal that:

1. Lists all chapters for the current chapter's book (queried via `/api/chapters?where[book][equals]=<bookId>&limit=200&select=id,title,order`).
2. Allows the admin to select one chapter.
3. Optionally accepts a fragment / anchor string.
4. Inserts a `chapter-link` node wrapping the current selection (or a default text if no
   text is selected).

The chapter list in the picker comes from the same book. The component needs access to the
current chapter's `book` field. Since this is a Lexical feature plugin, it can read the
form state via Payload's `useDocumentInfo` hook.

**Floating toolbar plugin** (in `src/features/chapter-link/plugin/index.tsx`):

The plugin should:
- Register a `OPEN_CHAPTER_LINK_PICKER` Lexical command.
- When the command fires, open a picker component (a React portal or Payload drawer).
- On selection, dispatch an `INSERT_CHAPTER_LINK` command that wraps the current selection
  in a `ChapterLinkNode`.

This mirrors how Payload's built-in `link` feature works. Study
`node_modules/@payloadcms/richtext-lexical/src/features/link/` for the pattern.

**Toolbar button** (in `feature.client.ts`):

```typescript
export const ChapterLinkFeatureClient = createClientFeature({
  nodes: [ChapterLinkNode],
  toolbarFixed: {
    groups: [{
      type: 'buttons',
      entries: [{
        type: 'button',
        ChildComponent: () => import('./components/ChapterLinkToolbarButton#ChapterLinkToolbarButton'),
        isActive: () => false,
        key: 'chapter-link',
        label: 'Chapter link',
        onSelect: ({ editor }) => {
          editor.dispatchCommand(OPEN_CHAPTER_LINK_PICKER_COMMAND, undefined)
        },
      }],
    }],
  },
})
```

### 5.6 Frontend Rendering for chapter-link Nodes

In the chapter page's JSX converters:

```tsx
'chapter-link': ({ node, nodesToJSX }) => {
  const { chapterId, fragment } = node.fields
  const chapter = chapters.find(c => String(c.id) === String(chapterId))
  const children = nodesToJSX({ nodes: node.children })

  if (!chapter) {
    // Chapter was deleted or not accessible — render as plain text
    return <span>{children}</span>
  }

  const href = fragment
    ? `/books/${bookSlug}/${chapter.slug}#${fragment}`
    : `/books/${bookSlug}/${chapter.slug}`

  return <Link href={href}>{children}</Link>
},
```

Note: this uses a direct ID lookup, not href normalization. The `chapters` array already
contains all chapters for the book (co-fetched for `epub-internal-link` resolution anyway),
so no additional data fetching is required.

### 5.7 Files to Create and Change

| File | Action |
|------|--------|
| `src/features/chapter-link/feature.server.ts` | Create |
| `src/features/chapter-link/feature.client.ts` | Create |
| `src/features/chapter-link/nodes/ChapterLinkNode.ts` | Create |
| `src/features/chapter-link/plugin/index.tsx` | Create: command definitions + picker dispatch |
| `src/features/chapter-link/components/ChapterLinkToolbarButton.tsx` | Create: toolbar icon |
| `src/features/chapter-link/components/ChapterLinkPicker.tsx` | Create: chapter selection UI |
| `src/utils/chapterLexicalNodes.ts` | Register `ChapterLinkNode` |
| `src/utils/chapterRichText.ts` | Add `ChapterLinkFeature` to the editor config |
| `src/payload.config.ts` | Add `ChapterLinkFeature` to the global features list |
| Chapter page component | Add `'chapter-link'` JSX converter |

### 5.8 Acceptance Criteria

- A toolbar button "Chapter link" appears in the Lexical chapter content editor.
- Clicking it opens a picker listing all chapters for the current book.
- Selecting a chapter wraps the current text selection (or inserts default text) in a
  `chapter-link` node with a blue underline.
- The node round-trips through save/load without data loss.
- On the frontend, the node renders as a Next.js `<Link>` to the target chapter.
- If the target chapter is deleted, the node falls back to plain text.
- No new migration is required (Lexical content is stored as JSON; new node types
  are backward-compatible — existing chapters without `chapter-link` nodes are unaffected).

---

## 6. Interaction Between the Two Node Types

### 6.1 Serialization Contract Side-by-Side

| Property | `epub-internal-link` | `chapter-link` |
|----------|---------------------|----------------|
| `type` | `"epub-internal-link"` | `"chapter-link"` |
| Origin | EPUB import | Admin-authored |
| Reference stored | `fields.epubHref` (string, raw EPUB path) | `fields.chapterId` (number or string) |
| Optional secondary | none | `fields.fragment` (string, optional) |
| Children | Text nodes (link text from EPUB) | Text nodes (admin-typed) |
| Admin editor style | Dashed amber underline | Solid blue underline |
| Resolution strategy | Normalize `epubHref` → match `chapterSourceKey` | Direct `chapterId` lookup |
| Fallback | Plain text if no chapter matches | Plain text if chapter ID not found |
| Mutable by admin? | Text only (epubHref is read-only in editor) | Text + target (picker re-opens on click) |

### 6.2 Frontend Renderer Decision Tree

```
For each Lexical node in the chapter content:
  if node.type === 'epub-internal-link':
    → resolveEpubHref(node.fields.epubHref, chapters, bookSlug)
    → if resolved: render <Link href={...}>{children}</Link>
    → if not resolved: render <span>{children}</span>

  if node.type === 'chapter-link':
    → find chapter where id === node.fields.chapterId
    → if found: render <Link href="/books/{bookSlug}/{chapter.slug}#{fragment}">{children}</Link>
    → if not found: render <span>{children}</span>
```

### 6.3 Admin Editor Visual Differentiation

| State | Node type | Visual |
|-------|-----------|--------|
| EPUB sentinel, unresolved | `epub-internal-link` | Dashed amber underline, `cursor: help`, hover tooltip shows raw href |
| Admin-authored link | `chapter-link` | Solid blue underline, `cursor: pointer`, hover shows chapter title |
| Standard external link | Payload `link` | Default Payload link styling (underline, no color override) |

An admin editor can therefore visually distinguish between all three link types without
opening the node's edit popover.

---

## 7. Migration and Schema Considerations

Neither Phase 1 nor Phase 3 requires a database migration because:

- Lexical content is stored as an opaque JSON blob in the `chapters.content` column.
- Adding a new node type to the Lexical registry is backward-compatible: chapters without
  the new node type are not affected.
- The `epub-internal-link` node serialization contract is unchanged by Phase 1 (only CSS
  is modified, not the JSON shape).
- The `chapter-link` node is a new type that existing chapter records do not contain.

**The only migration risk is a breaking change to `EpubInternalLinkNode`**:
- DO NOT rename `fields.epubHref` to a different field name.
- DO NOT change the `type` string from `"epub-internal-link"`.
- DO NOT remove the `children` array in favor of storing text as a field.

Any of the above would cause existing EPUB-imported chapters to fail Lexical validation on
load, resulting in silently empty content for those nodes.

**If Phase 3 is ever extended to convert existing `epub-internal-link` nodes into
`chapter-link` nodes** (i.e., a server-side resolution pass), that would be a data migration
and must follow the migration discipline in `docs/book_clean_code.md` Section 13.

---

## 8. Test Strategy

### 8.1 Unit Tests

**File**: `tests/int/epub-link-resolver.int.spec.ts`

Cover `src/utils/epubLinkResolver.ts`:

```typescript
describe('splitEpubHref', () => {
  it('splits path and fragment', () => ...)
  it('handles fragment-only hrefs', () => ...)
  it('handles hrefs with no fragment', () => ...)
})

describe('normalizeEpubPath', () => {
  it('strips leading ../', () => ...)
  it('strips query parameters', () => ...)
  it('handles empty string', () => ...)
  it('lowercases the result', () => ...)
})

describe('resolveEpubHref', () => {
  it('resolves a chapter by full path match', () => ...)
  it('resolves a chapter by basename fallback', () => ...)
  it('returns resolved: false for unknown chapters', () => ...)
  it('handles in-page fragment-only hrefs', () => ...)
  it('includes the fragment in the resolved href', () => ...)
  it('omits the fragment when empty', () => ...)
})
```

### 8.2 Integration Tests

**File**: `tests/int/epub-internal-link-node.int.spec.ts`

Cover the Lexical node serialization round-trip:

```typescript
it('serializes and deserializes without data loss', () => {
  // importJSON → exportJSON round-trip
})

it('preserves children text through save/load', () => {
  // Check that children survive Payload Lexical validation
})
```

**File**: `tests/int/books-admin-components.int.spec.ts` (extend existing)

Add for the DeleteBookButton fix:

```typescript
it('shows an enabled Delete button when chapterCount is 0', async () => {
  vi.spyOn(booksUtils, 'fetchBookChapterCount').mockResolvedValue(0)
  // render DeleteBookButton
  // assert button is not disabled
  // assert onClick is defined
})
```

### 8.3 E2E Tests

Phase 3 (chapter-link toolbar) warrants an E2E test once the picker is built:

```typescript
it('inserts a chapter-link node via toolbar', async () => {
  // Navigate to a chapter edit page
  // Click the "Chapter link" toolbar button
  // Select a target chapter from the picker
  // Assert the node is inserted with the correct chapterId
  // Save and reload — assert the node is preserved
})
```

---

## 9. Implementation Order and Task Breakdown

Tasks are ordered to minimize risk and deliver incremental value.

| # | Task | Phase | Risk | Blocks |
|---|------|-------|------|--------|
| 1 | Fix `DeleteBookButton` | Bug fix | Low | None |
| 2 | Add inline CSS to `EpubInternalLinkNode.createDOM()` | Phase 1 | Low | None |
| 3 | Add tooltip plugin to `feature.client.ts` | Phase 1 | Low | 2 |
| 4 | Create `src/utils/epubLinkResolver.ts` + unit tests | Phase 2 | Low | None |
| 5 | Verify heading `id` preservation in `epubLexical.ts` | Phase 2 | Low | 4 |
| 6 | Create chapter page + JSX converters for `epub-internal-link` | Phase 2 | Medium | 4, 5 |
| 7 | Create `ChapterLinkNode` + server/client feature files | Phase 3 | Medium | None |
| 8 | Create chapter picker component (`ChapterLinkPicker.tsx`) | Phase 3 | Medium | 7 |
| 9 | Create toolbar button + Lexical plugin commands | Phase 3 | Medium | 7, 8 |
| 10 | Register `chapter-link` in `chapterRichText.ts` + `payload.config.ts` | Phase 3 | Low | 7 |
| 11 | Add `'chapter-link'` JSX converter to chapter page | Phase 3 | Low | 6, 7 |
| 12 | Write integration tests for `chapter-link` round-trip | Phase 3 | Low | 7 |
| 13 | Write E2E test for chapter-link insertion | Phase 3 | Low | 9 |

Tasks 1-3 can be implemented immediately and independently. Tasks 4-6 form a unit (Phase 2)
that can be released before Phase 3. Tasks 7-13 form the manual authoring feature and are
the highest effort.

**Recommended first PR**: Tasks 1 + 2 + 3 — the DeleteBookButton fix and the editor visual.
These have zero migration risk and immediately improve the admin experience.
