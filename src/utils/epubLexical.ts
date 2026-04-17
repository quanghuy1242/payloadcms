import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

import { buildStableHash } from './epubImport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a single footnote or endnote definition extracted from EPUB markup. */
export type FootnoteDefinition = {
  noteId: string
  content: string
}

/** Lookup map from note ID to its {@link FootnoteDefinition}. */
export type FootnoteDefinitionMap = Map<string, FootnoteDefinition>

type FootnoteReference = {
  marker: string
  noteId: string
  content: string
}

/**
 * Mutable traversal context threaded through the DOM-walking algorithm.
 * Carries the inline format bitmask, list nesting depth, known footnote
 * definitions, and a registry of footnote references collected so far.
 */
type WalkContext = {
  format: number
  insidePre: boolean
  insideListItem: boolean
  listDepth: number
  nodeCounter: { value: number }
  footnotesById: FootnoteDefinitionMap
  referencedFootnotes: Map<string, FootnoteReference>
}

/** Options accepted by {@link htmlToPayloadLexical} and {@link convertHtmlToChapterLexicalState}. */
export type HtmlToPayloadLexicalOptions = {
  footnotesById?: FootnoteDefinitionMap
}

type AnyNode = Record<string, unknown> & { type: string; version: number }

/** Trims a value to a non-empty string, returning `null` when blank or non-string. */
const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ---------------------------------------------------------------------------
// Node-type detection
// ---------------------------------------------------------------------------

/** The set of Lexical node types that are treated as block-level elements. */
const BLOCK_NODE_TYPES = new Set(['block', 'upload', 'paragraph', 'heading', 'quote', 'list', 'table', 'epub-callout'])

/** Returns `true` when `node` is a block-level Lexical node. */
const isBlockNode = (node: AnyNode): boolean => BLOCK_NODE_TYPES.has(node.type)

// ---------------------------------------------------------------------------
// Node factory helpers
// ---------------------------------------------------------------------------

/** Creates a Lexical `paragraph` node wrapping `children`. */
const makeParagraph = (children: AnyNode[]): AnyNode => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
  textFormat: 0,
  textStyle: '',
})

/** Creates a Lexical `block` node of type `Code` with the given source text and language hint. */
const makeCodeBlock = (code: string, language = 'plaintext'): AnyNode => ({
  type: 'block',
  version: 2,
  format: '',
  fields: {
    blockType: 'Code',
    blockName: '',
    code,
    language,
  },
})

/** Creates an `epub-callout` block node with the given semantic `variant` and block children. */
const makeCalloutNode = (
  variant: 'note' | 'tip' | 'warning' | 'important',
  children: AnyNode[],
): AnyNode => ({
  type: 'epub-callout',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { variant },
  children,
})

/** Creates a `block` node of type `Footnote` that renders a footnote definition at the end of the chapter. */
const makeFootnoteBlock = (noteId: string, marker: string, content: string): AnyNode => ({
  type: 'block',
  version: 2,
  format: '',
  fields: {
    blockType: 'Footnote',
    blockName: '',
    noteId,
    marker,
    content,
  },
})

/** Creates a Lexical `upload` node referencing a Payload media record. Assigns a stable content-derived ID. */
const makeUploadNode = (
  ctx: WalkContext,
  relationTo: string,
  value: string | number,
  alt: string,
): AnyNode => ({
  type: 'upload',
  version: 3,
  format: '',
  id: buildStableHash(`${ctx.nodeCounter.value++}::${relationTo}::${String(value)}::${alt}`),
  relationTo,
  value,
  fields: { alt },
})

/** Converts a string upload ID to a `number` when it is a pure integer; otherwise keeps it as a string. */
const normalizeUploadValue = (value: string): string | number => {
  if (/^-?\d+$/.test(value)) {
    return Number(value)
  }

  return value
}

/** Creates a Lexical `heading` node for the given HTML heading tag (e.g. `"h2"`). */
const makeHeading = (tag: string, children: AnyNode[]): AnyNode => ({
  type: 'heading',
  tag,
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

/** Creates a Lexical `text` node with the given raw text and inline format bitmask. */
const makeText = (text: string, format: number): AnyNode => ({
  type: 'text',
  version: 1,
  text,
  format,
  mode: 'normal',
  style: '',
  detail: 0,
})

/** Creates a Lexical `linebreak` node. */
const makeLineBreak = (): AnyNode => ({ type: 'linebreak', version: 1 })

/** Creates a Lexical `quote` (blockquote) node wrapping `children`. */
const makeQuote = (children: AnyNode[]): AnyNode => ({
  type: 'quote',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

/** Creates a Lexical `list` node (`ul`/`ol`) at the specified nesting depth. */
const makeList = (
  listType: 'bullet' | 'number',
  tag: 'ul' | 'ol',
  children: AnyNode[],
  indent: number,
): AnyNode => ({
  type: 'list',
  version: 1,
  listType,
  tag,
  start: 1,
  format: '',
  indent,
  direction: 'ltr',
  children,
})

/** Creates a Lexical `listitem` node with a sequential `value` and the given children. */
const makeListItem = (value: number, children: AnyNode[]): AnyNode => ({
  type: 'listitem',
  version: 1,
  value,
  checked: false,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

/** Creates a Lexical `link` node pointing to an external URL. */
const makeLink = (url: string, children: AnyNode[], newTab = false): AnyNode => ({
  type: 'link',
  version: 3,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { linkType: 'custom', url, newTab },
  children,
})

/** Creates a Lexical `table` node wrapping row children. */
const makeTable = (children: AnyNode[]): AnyNode => ({
  type: 'table',
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
})

/** Creates an `epub-internal-link` sentinel node preserving an intra-EPUB anchor for later resolution. */
const makeEpubInternalLink = (epubHref: string, children: AnyNode[]): AnyNode => ({
  type: 'epub-internal-link',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { epubHref },
  children,
})

/** Creates a `footnote-ref` inline node that links to a collected footnote definition. */
const makeFootnoteRef = (marker: string, noteId: string): AnyNode => ({
  type: 'footnote-ref',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { marker, noteId },
  children: [],
})

/** Creates a Lexical `tablerow` node wrapping cell children. */
const makeTableRow = (children: AnyNode[]): AnyNode => ({
  type: 'tablerow',
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
})

/** Creates a Lexical `tablecell` node with optional header state, col-span, and row-span. */
const makeTableCell = (
  headerState: number,
  children: AnyNode[],
  colSpan = 1,
  rowSpan = 1,
): AnyNode => ({
  type: 'tablecell',
  version: 1,
  colSpan,
  rowSpan,
  headerState,
  width: null,
  backgroundColor: null,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
})

/** Splits a whitespace-separated string into a lower-cased array of non-empty tokens. */
const normalizeToArray = (value: string): string[] => {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

/**
 * Scans `document` for `<aside epub:type="footnote|endnote">` elements,
 * builds the definition map, and removes the asides from the live DOM.
 */
const collectFootnoteDefinitionsFromDocument = (document: Document): FootnoteDefinitionMap => {
  const footnotesById: FootnoteDefinitionMap = new Map()

  for (const aside of Array.from(document.querySelectorAll('aside'))) {
    const epubType = normalizeToArray(aside.getAttribute('epub:type') ?? '')
    const isFootnote = epubType.includes('footnote') || epubType.includes('endnote')

    if (!isFootnote) {
      continue
    }

    const noteId = trimToNull(aside.getAttribute('id'))

    if (!noteId) {
      aside.remove()
      continue
    }

    const content = trimToNull((aside.textContent ?? '').replace(/\s+/g, ' '))

    if (!content) {
      aside.remove()
      continue
    }

    footnotesById.set(noteId, { noteId, content })
    aside.remove()
  }

  return footnotesById
}

/**
 * Parses an HTML string for EPUB footnote/endnote asides and returns a
 * {@link FootnoteDefinitionMap} keyed by note ID.
 *
 * @param html - Raw HTML to scan for `<aside epub:type="footnote|endnote">` elements.
 * @returns A map of note IDs to their {@link FootnoteDefinition}.
 */
export const collectFootnoteDefinitionsFromHTML = (html: string): FootnoteDefinitionMap => {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')

  return collectFootnoteDefinitionsFromDocument(document)
}

/** Merges any number of {@link FootnoteDefinitionMap}s into a single map (later maps win on collision). */
const mergeFootnoteDefinitions = (
  ...maps: Array<FootnoteDefinitionMap | undefined>
): FootnoteDefinitionMap => {
  const merged: FootnoteDefinitionMap = new Map()

  for (const map of maps) {
    if (!map) {
      continue
    }

    for (const [noteId, definition] of map.entries()) {
      merged.set(noteId, definition)
    }
  }

  return merged
}

/** Extracts the fragment identifier (the part after `#`) from a URL, or returns `null`. */
const extractHashFragment = (value: string): string | null => {
  const hashIndex = value.indexOf('#')

  if (hashIndex < 0) {
    return null
  }

  return trimToNull(value.slice(hashIndex + 1))
}

/** Extracts the visible text content of an anchor element to use as the footnote marker string. */
const extractFootnoteMarker = (el: Element): string => {
  const marker = trimToNull((el.textContent ?? '').replace(/\s+/g, ' '))
  return marker ?? ''
}

/**
 * Determines whether an anchor element is a footnote reference.
 * Returns the note ID if it is one, or `null` otherwise.
 */
const resolveFootnoteReference = (
  el: Element,
  href: string,
  footnotesById: FootnoteDefinitionMap,
): string | null => {
  const epubType = normalizeToArray(el.getAttribute('epub:type') ?? '')
  const noteId = extractHashFragment(href)

  if (epubType.includes('noteref') && noteId) {
    return noteId
  }

  if (noteId && footnotesById.has(noteId)) {
    const parentTag = el.parentElement?.tagName.toLowerCase()

    if (parentTag === 'sup') {
      return noteId
    }
  }

  return null
}

/**
 * Builds the list of `Footnote` block nodes from all footnote references
 * collected in `ctx.referencedFootnotes` during the DOM walk.
 */
const buildFootnoteBlocks = (ctx: WalkContext): AnyNode[] => {
  const blocks: AnyNode[] = []

  for (const reference of ctx.referencedFootnotes.values()) {
    if (reference.content.length === 0) {
      continue
    }

    blocks.push(makeFootnoteBlock(reference.noteId, reference.marker, reference.content))
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Helper: normalize container nodes so inline-only content becomes paragraphs.
// ---------------------------------------------------------------------------

/**
 * Wraps consecutive inline nodes into `paragraph` blocks so the output array
 * contains only block-level Lexical nodes — a requirement for container
 * elements such as `<blockquote>`, `<aside>`, and `<figure>`.
 */
const normalizeContainerNodes = (nodes: AnyNode[]): AnyNode[] => {
  const normalized: AnyNode[] = []
  const inlineBuffer: AnyNode[] = []

  const flushInlineBuffer = () => {
    if (inlineBuffer.length === 0) {
      return
    }

    normalized.push(makeParagraph([...inlineBuffer]))
    inlineBuffer.length = 0
  }

  for (const node of nodes) {
    if (isBlockNode(node)) {
      flushInlineBuffer()
      normalized.push(node)
    } else {
      inlineBuffer.push(node)
    }
  }

  flushInlineBuffer()
  return normalized
}

// ---------------------------------------------------------------------------
// Helper: walk all child nodes and collect results
// ---------------------------------------------------------------------------

/** Walks all child nodes of `el` and concatenates the resulting Lexical nodes. */
const walkChildren = (el: Element, ctx: WalkContext): AnyNode[] => {
  const result: AnyNode[] = []
  for (const child of Array.from(el.childNodes)) {
    result.push(...walkNode(child, ctx))
  }
  return result
}

// ---------------------------------------------------------------------------
// Helper: walk <ul>/<ol> and return listitem nodes with sequential values
// ---------------------------------------------------------------------------

/**
 * Walks the direct `<li>` children of a `<ul>` or `<ol>` element and returns
 * an array of `listitem` nodes with sequentially assigned `value` counters.
 * Handles nested lists and `<p>` children inside list items.
 */
const walkListItems = (ul: Element, ctx: WalkContext): AnyNode[] => {
  const items: AnyNode[] = []
  let value = 1
  for (const child of Array.from(ul.children)) {
    if (child.tagName !== 'LI') continue
    const el = child as Element
    const children: AnyNode[] = []

    for (const liChild of Array.from(el.childNodes)) {
      if (liChild.nodeType === 1) {
        const liChildElement = liChild as Element
        const liChildTag = liChildElement.tagName.toLowerCase()

        if (liChildTag === 'p') {
          children.push(...walkChildren(liChildElement, ctx))
          continue
        }

        if (liChildTag === 'ul' || liChildTag === 'ol') {
          children.push(...walkNode(liChild, { ...ctx, insideListItem: true, listDepth: ctx.listDepth + 1 }))
          continue
        }
      }

      children.push(...walkNode(liChild, ctx))
    }

    items.push(makeListItem(value, children))
    value++
  }
  return items
}

// ---------------------------------------------------------------------------
// Core recursive walker
// ---------------------------------------------------------------------------

/**
 * Core recursive DOM walker. Dispatches on HTML tag name and converts each
 * node into zero or more Lexical nodes using the builder helpers.
 *
 * Inline format flags are accumulated on `ctx.format` as the walk descends
 * into inline elements (`<strong>`, `<em>`, `<code>`, etc.).
 *
 * Block elements produce block-level Lexical nodes; inline elements accumulate
 * format bits and eventually produce `text` nodes.
 *
 * @param node - The DOM `Node` to convert.
 * @param ctx  - The current traversal context (format, depth, footnotes, …).
 * @returns An array of Lexical nodes representing `node` and its descendants.
 */
const walkNode = (node: Node, ctx: WalkContext): AnyNode[] => {
  // Text node
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = node.textContent ?? ''
    if (!text.trim()) return []
    return [makeText(text, ctx.format)]
  }

  if (node.nodeType !== 1 /* ELEMENT_NODE */) return []

  const el = node as Element
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    // -----------------------------------------------------------------------
    // Block elements
    // -----------------------------------------------------------------------

    case 'p':
      {
        const children = walkChildren(el, ctx)
        return children.length > 0 ? [makeParagraph(children)] : []
      }

    case 'caption': {
      const children = walkChildren(el, ctx)
      return children.length > 0 ? [makeParagraph(children)] : []
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return [makeHeading(tag, walkChildren(el, ctx))]

    case 'h5':
    case 'h6':
      return [makeHeading('h4', walkChildren(el, ctx))]

    case 'blockquote':
      {
        const children = normalizeContainerNodes(walkChildren(el, ctx))
        return children.length > 0 ? [makeQuote(children)] : []
      }

    case 'pre': {
      // Clone to avoid mutating the live DOM, strip <a> elements, then extract text
      const clone = el.cloneNode(true) as Element
      for (const a of Array.from(clone.querySelectorAll('a'))) {
        a.remove()
      }
      const normalizedLines = (clone.textContent ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')

      while (normalizedLines.length > 0 && normalizedLines[0]?.trim().length === 0) {
        normalizedLines.shift()
      }

      while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1]?.trim().length === 0) {
        normalizedLines.pop()
      }

      const code = normalizedLines.join('\n')
      const codeLanguage = (() => {
        const codeEl = clone.querySelector('code')
        const sourceElement = codeEl ?? clone
        const dataLanguage =
          trimToNull(sourceElement.getAttribute('data-language')) ??
          trimToNull(sourceElement.getAttribute('data-lang')) ??
          trimToNull(clone.getAttribute('data-language')) ??
          trimToNull(clone.getAttribute('data-lang'))

        if (dataLanguage) {
          return dataLanguage.toLowerCase()
        }

        const className = sourceElement.className
        const languageMatch = className.match(/(?:language-|lang-)([a-z0-9_+-]+)/i)

        return languageMatch?.[1]?.toLowerCase() ?? 'plaintext'
      })()

      if (code.trim().length === 0) {
        return []
      }

      return [makeCodeBlock(code, codeLanguage)]
    }

    case 'ul':
      return [makeList('bullet', 'ul', walkListItems(el, ctx), ctx.listDepth)]

    case 'ol':
      return [makeList('number', 'ol', walkListItems(el, ctx), ctx.listDepth)]

    case 'li': {
      // Fallback for <li> encountered outside walkListItems
      const children = walkChildren(el, ctx)
      return [makeListItem(1, children)]
    }

    case 'table': {
      const captions: AnyNode[] = []
      const rows: AnyNode[] = []
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType !== 1) continue
        const childEl = child as Element
        const childTag = childEl.tagName.toLowerCase()
        if (childTag === 'caption') {
          captions.push(...walkNode(child, ctx))
        } else if (childTag === 'tr') {
          rows.push(...walkNode(child, ctx))
        } else if (childTag === 'thead' || childTag === 'tbody' || childTag === 'tfoot') {
          for (const tr of Array.from(childEl.children)) {
            if (tr.tagName.toLowerCase() === 'tr') {
              rows.push(...walkNode(tr, ctx))
            }
          }
        }
      }

      const rowNodes = rows.filter((row): row is AnyNode => row.type === 'tablerow')
      const hasHeaderCell = rowNodes.some((row) => {
        const cells = Array.isArray((row as AnyNode).children) ? ((row as AnyNode).children as AnyNode[]) : []
        return cells.some((cell) => cell.type === 'tablecell' && cell.headerState === 1)
      })
      const maxColumnCount = rowNodes.reduce((maxColumns, row) => {
        const cells = Array.isArray((row as AnyNode).children) ? ((row as AnyNode).children as AnyNode[]) : []
        return Math.max(maxColumns, cells.length)
      }, 0)

      if (!hasHeaderCell && maxColumnCount <= 1) {
        const flatContent = rowNodes.flatMap((row) => {
          const cells = Array.isArray((row as AnyNode).children) ? ((row as AnyNode).children as AnyNode[]) : []
          return cells.flatMap((cell) => (Array.isArray((cell as AnyNode).children) ? ((cell as AnyNode).children as AnyNode[]) : []))
        })

        return [...captions, ...normalizeContainerNodes(flatContent)]
      }

      return [...captions, makeTable(rows)]
    }

    case 'thead':
    case 'tbody':
    case 'tfoot':
      return walkChildren(el, ctx)

    case 'tr': {
      const cells: AnyNode[] = []
      for (const child of Array.from(el.children)) {
        const cellTag = child.tagName.toLowerCase()
        if (cellTag === 'td' || cellTag === 'th') {
          const headerState = cellTag === 'th' ? 1 : 0
          const cellElement = child as Element
          const colSpan = parsePositiveIntegerAttribute(cellElement.getAttribute('colspan'))
          const rowSpan = parsePositiveIntegerAttribute(cellElement.getAttribute('rowspan'))
          cells.push(
            makeTableCell(headerState, walkChildren(cellElement, ctx), colSpan, rowSpan),
          )
        }
      }
      return [makeTableRow(cells)]
    }

    case 'td':
      return [
        makeTableCell(
          0,
          walkChildren(el, ctx),
          parsePositiveIntegerAttribute(el.getAttribute('colspan')),
          parsePositiveIntegerAttribute(el.getAttribute('rowspan')),
        ),
      ]

    case 'th':
      return [
        makeTableCell(
          1,
          walkChildren(el, ctx),
          parsePositiveIntegerAttribute(el.getAttribute('colspan')),
          parsePositiveIntegerAttribute(el.getAttribute('rowspan')),
        ),
      ]

    case 'figure': {
      return normalizeContainerNodes(walkChildren(el, ctx))
    }

    case 'figcaption':
      return walkChildren(el, ctx)

    case 'section':
    case 'article':
      return normalizeContainerNodes(walkChildren(el, ctx))

    case 'nav':
      return []

    case 'aside':
      {
        const epubType = normalizeToArray(el.getAttribute('epub:type') ?? '')

        if (epubType.includes('footnote') || epubType.includes('endnote')) {
          return []
        }

        const children = normalizeContainerNodes(walkChildren(el, ctx))
        return children.length > 0 ? [makeQuote(children)] : []
      }

    case 'div': {
      const className = el.getAttribute('class') ?? ''
      const classes = className.toLowerCase().split(/\s+/)
      const calloutVariants = ['note', 'tip', 'warning', 'important'] as const
      const matchedVariant = calloutVariants.find((v) => classes.includes(v))

      if (matchedVariant) {
        const children = normalizeContainerNodes(walkChildren(el, ctx))
        return children.length > 0 ? [makeCalloutNode(matchedVariant, children)] : []
      }

      const epubType = el.getAttribute('epub:type') ?? ''
      if (epubType === 'sidebar') {
        const children = normalizeContainerNodes(walkChildren(el, ctx))
        return children.length > 0 ? [makeCalloutNode('note', children)] : []
      }

      return normalizeContainerNodes(walkChildren(el, ctx))
    }

    // Drop silently
    case 'hr':
      return [makeParagraph([makeText('* * *', 2)])]

    case 'video':
    case 'audio':
    case 'object':
    case 'embed':
    case 'form':
    case 'input':
    case 'select':
    case 'script':
    case 'style':
      return []

    case 'svg':
      return [makeParagraph([makeText('[Image: SVG diagram]', 2)])]

    case 'img': {
      const uploadId = el.getAttribute('data-lexical-upload-id')?.trim() ?? ''
      const relationTo = el.getAttribute('data-lexical-upload-relation-to')?.trim() ?? ''

      if (uploadId.length > 0 && relationTo.length > 0) {
        const alt = (el.getAttribute('alt') ?? el.getAttribute('title') ?? '').trim()
        return [makeUploadNode(ctx, relationTo, normalizeUploadValue(uploadId), alt)]
      }

      const src = el.getAttribute('src') ?? ''
      if (src.startsWith('https://')) {
        const alt = (el.getAttribute('alt') ?? '').trim()
        return [makeParagraph([makeText(`[Image: ${alt}]`, 2)])]
      }
      return []
    }

    // -----------------------------------------------------------------------
    // Anchor — three explicit cases
    // -----------------------------------------------------------------------

    case 'a': {
      const href = el.getAttribute('href') ?? ''
      const trimmedHref = trimToNull(href)

      const footnoteReference = resolveFootnoteReference(el, href, ctx.footnotesById)

      if (footnoteReference) {
        const marker = extractFootnoteMarker(el)
        const noteDefinition = ctx.footnotesById.get(footnoteReference)

        if (marker.length > 0) {
          if (!ctx.referencedFootnotes.has(footnoteReference)) {
            ctx.referencedFootnotes.set(footnoteReference, {
              content: noteDefinition?.content ?? '',
              marker,
              noteId: footnoteReference,
            })
          }

          return [makeFootnoteRef(marker, footnoteReference)]
        }
      }

      // Case 1: external URL → Payload v3 link
      if (href.startsWith('http://') || href.startsWith('https://')) {
        const target = (el.getAttribute('target') ?? '').toLowerCase()
        const relTokens = (el.getAttribute('rel') ?? '')
          .toLowerCase()
          .split(/\s+/)
          .filter((token) => token.length > 0)
        const newTab = target === '_blank' || relTokens.includes('noopener') || relTokens.includes('noreferrer')
        return [makeLink(href, walkChildren(el, ctx), newTab)]
      }
      // Case 2: id-only anchor with no href and empty children → drop
      if (!el.hasAttribute('href') && el.hasAttribute('id') && !el.textContent?.trim()) {
        return []
      }
      // Case 3: internal EPUB anchor or relative link → preserve as a sentinel node
      if (!trimmedHref) {
        return walkChildren(el, ctx)
      }
      if (
        trimmedHref.startsWith('#') ||
        (!trimmedHref.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(trimmedHref))
      ) {
        return [makeEpubInternalLink(trimmedHref, walkChildren(el, ctx))]
      }
      // Case 4: any other anchor (blob:, data:, etc.) → unwrap
      return walkChildren(el, ctx)
    }

    // -----------------------------------------------------------------------
    // Inline elements — accumulate format bitmask
    // -----------------------------------------------------------------------

    case 'strong':
    case 'b':
      return walkChildren(el, { ...ctx, format: ctx.format | 1 })

    case 'em':
    case 'i':
      return walkChildren(el, { ...ctx, format: ctx.format | 2 })

    case 'u':
      return walkChildren(el, { ...ctx, format: ctx.format | 8 })

    case 's':
    case 'del':
    case 'strike':
      return walkChildren(el, { ...ctx, format: ctx.format | 4 })

    case 'code':
      return walkChildren(el, { ...ctx, format: ctx.format | 16 })

    case 'sub':
      return walkChildren(el, { ...ctx, format: ctx.format | 32 })

    case 'sup':
      return walkChildren(el, { ...ctx, format: ctx.format | 64 })

    case 'small':
      return walkChildren(el, { ...ctx, format: ctx.format | 2 })

    case 'br':
      return [makeLineBreak()]

    case 'span': {
      let format = ctx.format
      for (const cls of Array.from(el.classList)) {
        const lower = cls.toLowerCase()
        if (lower.includes('bold')) format |= 1
        if (lower.includes('italic')) format |= 2
        if (lower === 'underline') format |= 8
      }
      return walkChildren(el, { ...ctx, format })
    }

    case 'abbr':
    case 'time':
    case 'mark':
    case 'cite':
    case 'ins':
      return walkChildren(el, ctx)

    case 'dl': {
      const items: AnyNode[] = []

      for (const child of Array.from(el.children)) {
        const tagName = child.tagName.toLowerCase()

        if (tagName === 'dt') {
          // Term: bold paragraph
          const boldChildren = walkChildren(child, { ...ctx, format: ctx.format | 1 })
          const normalized = normalizeContainerNodes(boldChildren)
          items.push(...(normalized.length > 0 ? normalized : [makeParagraph(boldChildren)]))
        } else if (tagName === 'dd') {
          // Definition: quote block (visually indented)
          const definitionChildren = normalizeContainerNodes(walkChildren(child, ctx))
          if (definitionChildren.length > 0) {
            items.push(makeQuote(definitionChildren))
          }
        }
      }

      return items
    }

    case 'dt':
    case 'dd':
      return walkChildren(el, ctx)

    // -----------------------------------------------------------------------
    // Default: unwrap unknown elements
    // -----------------------------------------------------------------------

    default:
      return walkChildren(el, ctx)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a sanitized HTML string into a Payload/Lexical `SerializedEditorState`.
 *
 * The function parses the HTML with `DOMParser`, extracts footnote/endnote
 * definitions from `<aside>` elements, then recursively walks the DOM tree
 * via {@link walkNode} to build the Lexical node tree.  Collected footnote
 * references are appended as `Footnote` blocks at the end of the document.
 *
 * @param html    - Sanitized HTML to convert.
 * @param options - Optional pre-collected {@link FootnoteDefinitionMap} from
 *                  other EPUB documents (e.g. a shared endnotes file).
 * @returns A `SerializedEditorState` ready for storage in a Payload rich-text field.
 */
export const htmlToPayloadLexical = (
  html: string,
  options: HtmlToPayloadLexicalOptions = {},
): SerializedEditorState => {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')
  const localFootnotesById = collectFootnoteDefinitionsFromDocument(dom)
  const footnotesById = mergeFootnoteDefinitions(options.footnotesById, localFootnotesById)

  const ctx: WalkContext = {
    format: 0,
    insidePre: false,
    insideListItem: false,
    listDepth: 0,
    nodeCounter: { value: 0 },
    footnotesById,
    referencedFootnotes: new Map(),
  }

  const children = normalizeContainerNodes(
    Array.from(dom.body.childNodes).flatMap((child) => walkNode(child, ctx)),
  )

  const footnoteBlocks = buildFootnoteBlocks(ctx)
  const rootChildren = [...children, ...footnoteBlocks]

  if (rootChildren.length === 0) {
    return makeRoot([makeParagraph([])])
  }

  return makeRoot(rootChildren)
}

/**
 * Thin alias for {@link htmlToPayloadLexical} used at the chapter-import
 * call site to make intent explicit.
 *
 * @param html    - Sanitized HTML to convert.
 * @param options - Optional pre-collected footnote definitions.
 * @returns A `SerializedEditorState` for the chapter rich-text field.
 */
export const convertHtmlToChapterLexicalState = (
  html: string,
  options: HtmlToPayloadLexicalOptions = {},
): SerializedEditorState => {
  return htmlToPayloadLexical(html, options)
}

/**
 * Returns `true` when the Lexical editor state contains at least one node
 * with meaningful content (non-empty text, an upload, a footnote reference,
 * an internal link, or a non-empty code block).
 *
 * Used to filter out chapter pages that are essentially empty after HTML
 * conversion (e.g. pages that contained only navigation or CSS).
 *
 * @param state - The `SerializedEditorState` to inspect.
 * @returns `true` if the state has substantive content, `false` otherwise.
 */
export function isSubstantiveChapterContent(state: SerializedEditorState): boolean {
  const children = (state.root as any)?.children
  if (!Array.isArray(children) || children.length === 0) return false

  const hasMeaningfulText = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false

    if (node.type === 'text' && typeof node.text === 'string' && node.text.trim().length > 0) {
      return true
    }

    if (node.type === 'block') {
      const fields = node.fields as Record<string, unknown> | undefined
      const code = fields?.code

      if (typeof code === 'string' && code.trim().length > 0) {
        return true
      }
    }

    if (node.type === 'footnote-ref') {
      return true
    }

    if (node.type === 'upload') {
      return true
    }

    if (node.type === 'epub-internal-link') {
      return true
    }

    if (Array.isArray(node.children)) {
      return node.children.some(hasMeaningfulText)
    }

    return false
  }

  return children.some(hasMeaningfulText)
}

/** Parses a DOM attribute value as a positive integer, defaulting to `1` for absent or invalid values. */
const parsePositiveIntegerAttribute = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? '', 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

/** Wraps an array of block children in a Lexical root node to form a complete `SerializedEditorState`. */
const makeRoot = (children: AnyNode[]): SerializedEditorState => ({
  root: {
    type: 'root',
    version: 1,
    format: '' as const,
    indent: 0,
    direction: 'ltr',
    children: children as unknown as SerializedLexicalNode[],
  },
})
