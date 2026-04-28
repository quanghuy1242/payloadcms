import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

type AnyNode = Record<string, unknown> & { type?: string }
type MediaRecord = Record<string, unknown>

export type LexicalToHtmlOptions = {
  baseUrl?: string
  mediaById?: Map<string, MediaRecord>
}

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
    .replace(/'/g, '&#039;')

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const getMediaLookupKey = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return toTrimmedString(value)
}

const toAbsoluteURL = (value: string, baseUrl?: string): string => {
  if (!baseUrl) {
    return value
  }

  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return value
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

const serializeChildren = (children: AnyNode[], options: LexicalToHtmlOptions): string =>
  children.map((child) => serializeNode(child, options)).join('')

const serializeTextNode = (node: AnyNode): string => {
  const text = (node.text as string) ?? ''
  const format = (node.format as number) ?? 0
  return wrapWithInlineTags(escapeHtml(text), format)
}

const serializeParagraphNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<p>${inner}</p>`
}

const serializeHeadingNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const tag = (node.tag as string) ?? 'h2'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<${tag}>${inner}</${tag}>`
}

const serializeListNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const tag = (node.tag as string) === 'ol' ? 'ol' : 'ul'
  const children = (node.children as AnyNode[]) ?? []
  const inner = children.map((child) => serializeNode(child, options)).join('')
  return `<${tag}>${inner}</${tag}>`
}

const serializeListItemNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<li>${inner}</li>`
}

const serializeLinkNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const url = (fields.url as string) ?? '#'
  const newTab = (fields.newTab as boolean) ?? false
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : ''
  return `<a href="${escapeHtml(url)}"${target}>${inner}</a>`
}

const serializeQuoteNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<blockquote>${inner}</blockquote>`
}

const serializeTableNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = children.map((child) => serializeNode(child, options)).join('')
  return `<table>${inner}</table>`
}

const serializeTableRowNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const children = (node.children as AnyNode[]) ?? []
  const inner = children.map((child) => serializeNode(child, options)).join('')
  return `<tr>${inner}</tr>`
}

const serializeTableCellNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const headerState = (node.headerState as number) ?? 0
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  const tag = headerState > 0 ? 'th' : 'td'
  return `<${tag}>${inner}</${tag}>`
}

const serializeCodeBlockNode = (node: AnyNode): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const code = (fields.code as string) ?? ''
  const language = (fields.language as string) ?? 'plaintext'
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
}

const serializeCalloutNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const variant = (fields.variant as string) ?? 'note'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<aside class="callout callout-${escapeHtml(variant)}">${inner}</aside>`
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

const serializeEpubInternalLinkNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const epubHref = (fields.epubHref as string) ?? '#'
  const children = (node.children as AnyNode[]) ?? []
  const inner = serializeChildren(children, options)
  return `<a href="${escapeHtml(epubHref)}">${inner}</a>`
}

const resolveMediaRecord = (
  value: unknown,
  options: LexicalToHtmlOptions,
): { lookupKey: string | null; mediaRecord: MediaRecord | null } => {
  if (typeof value === 'object' && value !== null) {
    const mediaRecord = value as MediaRecord
    const lookupKey = getMediaLookupKey((mediaRecord as { id?: unknown }).id)

    if (
      toTrimmedString((mediaRecord as { url?: unknown }).url)
      || toTrimmedString((mediaRecord as { optimizedUrl?: unknown }).optimizedUrl)
      || toTrimmedString((mediaRecord as { thumbnailURL?: unknown }).thumbnailURL)
    ) {
      return { lookupKey, mediaRecord }
    }

    if (lookupKey) {
      return {
        lookupKey,
        mediaRecord: options.mediaById?.get(lookupKey) ?? null,
      }
    }

    return { lookupKey: null, mediaRecord: null }
  }

  const lookupKey = getMediaLookupKey(value)

  if (!lookupKey) {
    return { lookupKey: null, mediaRecord: null }
  }

  return {
    lookupKey,
    mediaRecord: options.mediaById?.get(lookupKey) ?? null,
  }
}

const resolveMediaURL = (mediaRecord: MediaRecord | null, options: LexicalToHtmlOptions): string | null => {
  const rawURL = toTrimmedString(mediaRecord?.optimizedUrl)
    ?? toTrimmedString(mediaRecord?.url)
    ?? toTrimmedString(mediaRecord?.thumbnailURL)

  return rawURL ? toAbsoluteURL(rawURL, options.baseUrl) : null
}

const serializeUploadNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const { lookupKey, mediaRecord } = resolveMediaRecord(node.value, options)
  const alt = (fields.alt as string) ?? toTrimmedString(mediaRecord?.alt) ?? ''
  const src = resolveMediaURL(mediaRecord, options)

  if (src) {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`
  }

  if (lookupKey) {
    const label = alt || toTrimmedString(mediaRecord?.filename) || lookupKey
    return `<p>[Image: ${escapeHtml(label)}]</p>`
  }

  return `<p>[Image: ${escapeHtml(alt)}]</p>`
}

const serializeYouTubeNode = (node: AnyNode): string => {
  const fields = (node.fields as Record<string, unknown>) ?? {}
  const videoId = toTrimmedString(node.videoId) ?? toTrimmedString(fields.videoId)
  const url = toTrimmedString(node.url)
    ?? toTrimmedString(fields.url)
    ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null)

  if (url) {
    return `<p><a href="${escapeHtml(url)}">Watch on YouTube</a></p>`
  }

  return ''
}

const serializeHorizontalRuleNode = (): string => '<hr />'

const serializeLineBreakNode = (): string => '<br />'

const serializeNode = (node: AnyNode, options: LexicalToHtmlOptions): string => {
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
      return serializeYouTubeNode(node)
    case 'horizontalrule':
      return serializeHorizontalRuleNode()
    case 'linebreak':
      return serializeLineBreakNode()
    default:
      if (Array.isArray((node as AnyNode).children)) {
        return serializeChildren((node as AnyNode).children as AnyNode[], options)
      }
      return ''
  }
}

const collectUploadIdsFromNode = (node: AnyNode, uploadIds: Set<string>): void => {
  if (node.type === 'upload') {
    const value = node.value
    const lookupKey =
      typeof value === 'object' && value !== null
        ? getMediaLookupKey((value as { id?: unknown }).id)
        : getMediaLookupKey(value)

    if (lookupKey) {
      uploadIds.add(lookupKey)
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children as AnyNode[]) {
      collectUploadIdsFromNode(child, uploadIds)
    }
  }
}

export const collectUploadIdsFromLexicalState = (state: SerializedEditorState): string[] => {
  const children = (state.root as AnyNode)?.children as AnyNode[] | undefined

  if (!Array.isArray(children) || children.length === 0) {
    return []
  }

  const uploadIds = new Set<string>()

  for (const child of children) {
    collectUploadIdsFromNode(child, uploadIds)
  }

  return Array.from(uploadIds)
}

export const lexicalToHtml = (state: SerializedEditorState, options: LexicalToHtmlOptions = {}): string => {
  const children = (state.root as AnyNode)?.children as AnyNode[] | undefined
  if (!Array.isArray(children) || children.length === 0) {
    return ''
  }
  return children.map((child) => serializeNode(child, options)).join('\n')
}
