/**
 * EPUB-specific Lexical → XHTML serializer.
 *
 * This is a pure utility — it does not import DOM or Node APIs and is safe
 * to run in both browser and server contexts.
 *
 * It is intentionally a separate module from `lexicalToHtml.ts` because the
 * EPUB export contract differs from generic HTML output:
 *   - archive-local image paths instead of remote CMS URLs
 *   - internal-link resolution against chapter indices
 *   - XHTML-safe markup (self-closing tags, entity escaping)
 *   - heading anchor preservation for in-chapter navigation
 */

import type { SerializedEditorState } from 'lexical'

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Internal types / helpers                                           */
/* ------------------------------------------------------------------ */

type AnyNode = Record<string, unknown> & { type?: string }

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_UNDERLINE = 8
const FORMAT_CODE = 16
const FORMAT_SUBSCRIPT = 32
const FORMAT_SUPERSCRIPT = 64

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getUploadId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'object' && value !== null) {
    const id = (value as Record<string, unknown>).id
    return getUploadId(id)
  }
  return null
}

const emitWarning = (options: LexicalToEpubHtmlOptions, message: string): void => {
  options.onWarning?.(message)
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const isSafeHref = (url: string): boolean => {
  // Allow relative paths, anchors, and mailto/tel without a protocol prefix.
  if (!url.includes(':')) return true
  try {
    const protocol = new URL(url).protocol.toLowerCase()
    return SAFE_LINK_PROTOCOLS.has(protocol)
  } catch {
    // Malformed URL — treat as unsafe.
    return false
  }
}

const wrapWithInlineTags = (text: string, format: number): string => {
  let result = text
  if (format & FORMAT_CODE) result = `<code>${result}</code>`
  if (format & FORMAT_SUBSCRIPT) result = `<sub>${result}</sub>`
  if (format & FORMAT_SUPERSCRIPT) result = `<sup>${result}</sup>`
  if (format & FORMAT_BOLD) result = `<strong>${result}</strong>`
  if (format & FORMAT_ITALIC) result = `<em>${result}</em>`
  if (format & FORMAT_UNDERLINE) result = `<u>${result}</u>`
  if (format & FORMAT_STRIKETHROUGH) result = `<s>${result}</s>`
  return result
}

/* ------------------------------------------------------------------ */
/*  Node serializers                                                   */
/* ------------------------------------------------------------------ */

const serializeChildren = (children: AnyNode[], options: LexicalToEpubHtmlOptions): string =>
  children
    .filter((child): child is AnyNode => child != null)
    .map((child) => serializeNode(child, options))
    .join('')

const serializeTextNode = (node: AnyNode): string => {
  const text = (node.text as string) ?? ''
  const format = (node.format as number) ?? 0
  return wrapWithInlineTags(escapeHtml(text), format)
}

const serializeParagraphNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Intentionally ignored: direction, indent, format on block nodes.
  return `<p>${inner}</p>`
}

const serializeHeadingNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const tag = toTrimmedString(node.tag) ?? 'h2'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)

  // Intentionally ignored: direction, indent, format on block nodes.
  // Prefer top-level `id`; fall back to `fields.anchorIds[0]`.
  const topLevelId = toTrimmedString(node.id)
  const anchorIds = (node.fields as Record<string, unknown> | undefined)?.anchorIds as
    | string[]
    | undefined
  const primaryId = topLevelId ?? (Array.isArray(anchorIds) ? toTrimmedString(anchorIds[0]) : null)

  if (primaryId) {
    return `<${tag} id="${escapeHtml(primaryId)}">${inner}</${tag}>`
  }

  return `<${tag}>${inner}</${tag}>`
}

const serializeListNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const tag = (node.tag as string) === 'ol' ? 'ol' : 'ul'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Intentionally ignored: list start value, direction, indent, format on block nodes.
  return `<${tag}>${inner}</${tag}>`
}

const serializeListItemNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Checklist items are normalized to plain list items for EPUB v1.
  // Intentionally ignored: checked, direction, indent, format on block nodes.
  return `<li>${inner}</li>`
}

const serializeLinkNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const rawUrl = (fields.url as string) ?? '#'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Omit target="_blank"; not useful in EPUB readers.

  if (!isSafeHref(rawUrl)) {
    emitWarning(options, `Unsafe link URL removed: ${rawUrl}`)
    return `<span>${inner}</span>`
  }

  return `<a href="${escapeHtml(rawUrl)}">${inner}</a>`
}

const serializeQuoteNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Intentionally ignored: direction, indent, format on block nodes.
  return `<blockquote>${inner}</blockquote>`
}

const serializeTableNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  // Intentionally ignored: direction, indent, format on block nodes.
  return `<table>${inner}</table>`
}

const serializeTableRowNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<tr>${inner}</tr>`
}

const serializeTableCellNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const headerState = (node.headerState as number) ?? 0
  const colSpan = (node.colSpan as number) ?? 1
  const rowSpan = (node.rowSpan as number) ?? 1
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  const tag = headerState > 0 ? 'th' : 'td'

  let attrs = ''
  if (colSpan > 1) attrs += ` colspan="${colSpan}"`
  if (rowSpan > 1) attrs += ` rowspan="${rowSpan}"`

  return `<${tag}${attrs}>${inner}</${tag}>`
}

const serializeCodeBlockNode = (node: AnyNode): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const code = (fields.code as string) ?? ''
  const language = (fields.language as string) ?? 'plaintext'
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
}

const serializeFootnoteBlockNode = (node: AnyNode): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const marker = (fields.marker as string) ?? ''
  const content = (fields.content as string) ?? ''
  const noteId = (fields.noteId as string) ?? ''
  return `<aside id="fn-${escapeHtml(noteId)}" epub:type="footnote"><p><sup>${escapeHtml(marker)}</sup> ${escapeHtml(content)}</p></aside>`
}

const serializeFootnoteRefNode = (node: AnyNode): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const marker = (fields.marker as string) ?? ''
  const noteId = (fields.noteId as string) ?? ''
  return `<sup><a href="#fn-${escapeHtml(noteId)}" epub:type="noteref">${escapeHtml(marker)}</a></sup>`
}

const serializeCalloutNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const variant = (fields.variant as string) ?? 'note'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<aside class="callout callout--${escapeHtml(variant)}">${inner}</aside>`
}

const serializeEpubInternalLinkNode = (
  node: AnyNode,
  options: LexicalToEpubHtmlOptions,
): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const epubHref = (fields.epubHref as string) ?? ''
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)

  if (!epubHref) {
    emitWarning(options, 'epub-internal-link node has empty epubHref; falling back to plain text.')
    return `<span>${inner}</span>`
  }

  const resolved = options.resolveInternalHref(epubHref)

  if (resolved) {
    return `<a href="${escapeHtml(resolved)}">${inner}</a>`
  }

  emitWarning(options, `Unresolved epub-internal-link: ${epubHref}`)
  return `<span>${inner}</span>`
}

const serializeUploadNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const uploadId = getUploadId(node.value)
  const alt = (fields.alt as string) ?? ''

  if (uploadId) {
    const imageRef = options.resolveImage(uploadId)
    if (imageRef) {
      const resolvedAlt = alt || imageRef.alt
      return `<img src="../images/${escapeHtml(imageRef.archivePath)}" alt="${escapeHtml(resolvedAlt)}" />`
    }
  }

  const label = alt || uploadId || 'Image'
  emitWarning(options, `Unresolved upload node: ${uploadId ?? 'no id'}`)
  return `<p>[Image: ${escapeHtml(label)}]</p>`
}

const serializeYouTubeNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const videoId = toTrimmedString(node.videoId) ?? toTrimmedString(fields.videoId)
  const url =
    toTrimmedString(node.url)
    ?? toTrimmedString(fields.url)
    ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null)

  if (url) {
    return `<p><a href="${escapeHtml(url)}">Watch on YouTube</a></p>`
  }

  emitWarning(options, 'YouTube node has no URL; emitting empty paragraph.')
  return '<p></p>'
}

const serializeHorizontalRuleNode = (): string => '<hr />'

const serializeLineBreakNode = (): string => '<br />'

const serializeNode = (node: AnyNode, options: LexicalToEpubHtmlOptions): string => {
  const type = node.type ?? ''

  switch (type) {
    case 'text':
      return serializeTextNode(node)
    case 'paragraph':
      return serializeParagraphNode(node, options)
    case 'heading':
      return serializeHeadingNode(node, options)
    case 'list':
      return serializeListNode(node, options)
    case 'listitem':
      return serializeListItemNode(node, options)
    case 'link':
      return serializeLinkNode(node, options)
    case 'quote':
      return serializeQuoteNode(node, options)
    case 'table':
      return serializeTableNode(node, options)
    case 'tablerow':
      return serializeTableRowNode(node, options)
    case 'tablecell':
      return serializeTableCellNode(node, options)
    case 'block': {
      const fields = (node.fields as Record<string, unknown>) ?? {}
      const blockType = (fields.blockType as string) ?? ''
      if (blockType === 'Code') {
        return serializeCodeBlockNode(node)
      }
      if (blockType === 'Footnote') {
        return serializeFootnoteBlockNode(node)
      }
      emitWarning(options, `Unknown block type: ${blockType}`)
      return ''
    }
    case 'epub-callout':
      return serializeCalloutNode(node, options)
    case 'footnote-ref':
      return serializeFootnoteRefNode(node)
    case 'epub-internal-link':
      return serializeEpubInternalLinkNode(node, options)
    case 'upload':
      return serializeUploadNode(node, options)
    case 'youtube':
      return serializeYouTubeNode(node, options)
    case 'horizontalrule':
      return serializeHorizontalRuleNode()
    case 'linebreak':
      return serializeLineBreakNode()
    default:
      if (Array.isArray((node as AnyNode).children)) {
        return serializeChildren((node as AnyNode).children as AnyNode[], options)
      }
      emitWarning(options, `Unknown node type: ${type}`)
      return ''
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const lexicalToEpubHtml = (
  state: SerializedEditorState,
  options: LexicalToEpubHtmlOptions,
): string => {
  const children = (state.root as AnyNode)?.children as AnyNode[] | undefined
  if (!Array.isArray(children) || children.length === 0) {
    return ''
  }
  return children
    .filter((child): child is AnyNode => child != null)
    .map((child) => serializeNode(child, options))
    .join('\n')
}
