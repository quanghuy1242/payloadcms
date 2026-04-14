import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

import { buildStableHash } from './epubImport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WalkContext = {
  format: number
  insidePre: boolean
  insideListItem: boolean
  listDepth: number
  nodeCounter: { value: number }
}

type AnyNode = Record<string, unknown> & { type: string; version: number }

// ---------------------------------------------------------------------------
// Node-type detection
// ---------------------------------------------------------------------------

const BLOCK_NODE_TYPES = new Set(['block', 'upload', 'paragraph', 'heading', 'quote', 'list', 'table'])

const isBlockNode = (node: AnyNode): boolean => BLOCK_NODE_TYPES.has(node.type)

// ---------------------------------------------------------------------------
// Node factory helpers
// ---------------------------------------------------------------------------

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

const makeHeading = (tag: string, children: AnyNode[]): AnyNode => ({
  type: 'heading',
  tag,
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

const makeText = (text: string, format: number): AnyNode => ({
  type: 'text',
  version: 1,
  text,
  format,
  mode: 'normal',
  style: '',
  detail: 0,
})

const makeLineBreak = (): AnyNode => ({ type: 'linebreak', version: 1 })

const makeQuote = (children: AnyNode[]): AnyNode => ({
  type: 'quote',
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
})

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

const makeLink = (url: string, children: AnyNode[], newTab = false): AnyNode => ({
  type: 'link',
  version: 3,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { linkType: 'custom', url, newTab },
  children,
})

const makeTable = (children: AnyNode[]): AnyNode => ({
  type: 'table',
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
})

const makeTableRow = (children: AnyNode[]): AnyNode => ({
  type: 'tablerow',
  version: 1,
  direction: 'ltr',
  format: '',
  indent: 0,
  children,
})

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

// ---------------------------------------------------------------------------
// Helper: normalize container nodes so inline-only content becomes paragraphs.
// ---------------------------------------------------------------------------

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

      if (code.trim().length === 0) {
        return []
      }

      return [makeCodeBlock(code)]
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
      const rows: AnyNode[] = []
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType !== 1) continue
        const childEl = child as Element
        const childTag = childEl.tagName.toLowerCase()
        if (childTag === 'tr') {
          rows.push(...walkNode(child, ctx))
        } else if (childTag === 'thead' || childTag === 'tbody' || childTag === 'tfoot') {
          for (const tr of Array.from(childEl.children)) {
            if (tr.tagName.toLowerCase() === 'tr') {
              rows.push(...walkNode(tr, ctx))
            }
          }
        }
      }
      return [makeTable(rows)]
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
        const children = normalizeContainerNodes(walkChildren(el, ctx))
        return children.length > 0 ? [makeQuote(children)] : []
      }

    case 'div': {
      return normalizeContainerNodes(walkChildren(el, ctx))
    }

    // Drop silently
    case 'hr':
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
        return [makeUploadNode(ctx, relationTo, uploadId, alt)]
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
      // Case 3: any other anchor (fragment, relative, blob:, data:, etc.) → unwrap
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

export const htmlToPayloadLexical = (html: string): SerializedEditorState => {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')

  const ctx: WalkContext = {
    format: 0,
    insidePre: false,
    insideListItem: false,
    listDepth: 0,
    nodeCounter: { value: 0 },
  }

  const children = normalizeContainerNodes(
    Array.from(dom.body.childNodes).flatMap((child) => walkNode(child, ctx)),
  )

  const rootChildren = children.length > 0 ? children : [makeParagraph([])]

  return makeRoot(rootChildren)
}

export const convertHtmlToChapterLexicalState = (html: string): SerializedEditorState => {
  return htmlToPayloadLexical(html)
}

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

    if (node.type === 'upload') {
      return true
    }

    if (Array.isArray(node.children)) {
      return node.children.some(hasMeaningfulText)
    }

    return false
  }

  return children.some(hasMeaningfulText)
}

const parsePositiveIntegerAttribute = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? '', 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

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
