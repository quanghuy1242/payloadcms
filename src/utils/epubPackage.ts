/**
 * Pure helpers for generating EPUB 3 package files.
 *
 * This module is server-safe and browser-safe — it does not use any DOM or Node APIs.
 *
 * Expected archive layout (all paths relative to OPF at OEBPS/content.opf):
 *   mimetype
 *   META-INF/container.xml
 *   OEBPS/content.opf
 *   OEBPS/nav.xhtml
 *   OEBPS/toc.ncx
 *   OEBPS/styles/book.css
 *   OEBPS/chapters/*.xhtml
 *   OEBPS/images/*
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

export type BuildChapterDocumentInput = {
  title: string
  content: string
  language?: string | null
}

export type BuildNavDocumentInput = {
  title: string
  chapters: ExportedChapterFile[]
  language?: string | null
}

export type BuildTocNcxInput = {
  title: string
  chapters: ExportedChapterFile[]
  language?: string | null
  uid: string
}

export type BuildContentOpfInput = {
  title: string
  language?: string | null
  uid: string
  chapters: ExportedChapterFile[]
  assets: ExportedAssetFile[]
  cover?: ExportedAssetFile | null
  author?: string | null
  description?: string | null
  publisher?: string | null
  publicationDate?: string | null
  updatedAt?: string | null
  isbn?: string | null
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

const escapeXml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const toXmlId = (value: string): string => {
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]/g, '_')
  // XML IDs must start with a letter or underscore.
  if (/^[a-zA-Z_]/.test(sanitized)) {
    return sanitized
  }
  return '_' + sanitized
}

const formatOpfDate = (dateValue: string | null | undefined): string | null => {
  if (!dateValue) return null
  try {
    // Treat bare YYYY-MM-DD as UTC midnight to avoid local-timezone drift.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T00:00:00Z`
      : dateValue
    const d = new Date(normalized)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch {
    return null
  }
}

const formatDateOnly = (dateValue: string | null | undefined): string | null => {
  if (!dateValue) return null
  try {
    // Treat bare YYYY-MM-DD as UTC midnight to avoid local-timezone drift.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T00:00:00Z`
      : dateValue
    const d = new Date(normalized)
    if (Number.isNaN(d.getTime())) return null
    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

const xmlLangAttr = (language: string | null | undefined): string => {
  if (!language) return ''
  return ` xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}"`
}

const dcElement = (tag: string, value: string | null | undefined): string => {
  if (!value) return ''
  return `    <dc:${tag}>${escapeXml(value)}</dc:${tag}>\n`
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function buildContainerXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
    '  <rootfiles>\n' +
    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
    '  </rootfiles>\n' +
    '</container>\n'
  )
}

export function buildSharedStylesheet(): string {
  return (
    '/* EPUB Shared Stylesheet */\n' +
    '\n' +
    'body {\n' +
    '  font-family: serif;\n' +
    '  line-height: 1.6;\n' +
    '  margin: 1em;\n' +
    '}\n' +
    '\n' +
    'h1, h2, h3, h4 {\n' +
    '  margin-top: 1.5em;\n' +
    '  margin-bottom: 0.5em;\n' +
    '  line-height: 1.3;\n' +
    '}\n' +
    '\n' +
    'p {\n' +
    '  margin: 0.8em 0;\n' +
    '}\n' +
    '\n' +
    'a {\n' +
    '  color: inherit;\n' +
    '  text-decoration: underline;\n' +
    '}\n' +
    '\n' +
    '/* Callouts — expected class names from the EPUB serializer:\n' +
    '   <aside class="callout callout--note"> ... </aside>\n' +
    '   variants: note | tip | warning | important\n' +
    '*/\n' +
    '.callout {\n' +
    '  border-left: 3px solid #6b7280;\n' +
    '  padding: 0.75em 1em;\n' +
    '  margin: 1em 0;\n' +
    '  background-color: #f9fafb;\n' +
    '}\n' +
    '\n' +
    '.callout--note {\n' +
    '  border-left-color: #3b82f6;\n' +
    '}\n' +
    '\n' +
    '.callout--tip {\n' +
    '  border-left-color: #22c55e;\n' +
    '}\n' +
    '\n' +
    '.callout--warning {\n' +
    '  border-left-color: #f59e0b;\n' +
    '}\n' +
    '\n' +
    '.callout--important {\n' +
    '  border-left-color: #ef4444;\n' +
    '}\n' +
    '\n' +
    '/* Tables */\n' +
    'table {\n' +
    '  border-collapse: collapse;\n' +
    '  width: 100%;\n' +
    '  margin: 1em 0;\n' +
    '}\n' +
    '\n' +
    'th, td {\n' +
    '  border: 1px solid #d1d5db;\n' +
    '  padding: 0.5em;\n' +
    '  text-align: left;\n' +
    '}\n' +
    '\n' +
    'th {\n' +
    '  background-color: #f3f4f6;\n' +
    '  font-weight: bold;\n' +
    '}\n' +
    '\n' +
    '/* Code blocks */\n' +
    'pre {\n' +
    '  background-color: #f3f4f6;\n' +
    '  padding: 1em;\n' +
    '  overflow-x: auto;\n' +
    '  margin: 1em 0;\n' +
    '}\n' +
    '\n' +
    'code {\n' +
    '  font-family: monospace;\n' +
    '  font-size: 0.9em;\n' +
    '}\n' +
    '\n' +
    'pre > code {\n' +
    '  background-color: transparent;\n' +
    '  padding: 0;\n' +
    '}\n' +
    '\n' +
    '/* Footnotes */\n' +
    'aside[epub\\:type="footnote"] {\n' +
    '  font-size: 0.85em;\n' +
    '  margin: 1em 0;\n' +
    '  padding-top: 0.5em;\n' +
    '  border-top: 1px solid #e5e7eb;\n' +
    '}\n' +
    '\n' +
    '/* Lists */\n' +
    'ul, ol {\n' +
    '  margin: 0.8em 0;\n' +
    '  padding-left: 1.5em;\n' +
    '}\n' +
    '\n' +
    'li {\n' +
    '  margin: 0.3em 0;\n' +
    '}\n' +
    '\n' +
    '/* Blockquotes */\n' +
    'blockquote {\n' +
    '  margin: 1em 0;\n' +
    '  padding-left: 1em;\n' +
    '  border-left: 3px solid #d1d5db;\n' +
    '  font-style: italic;\n' +
    '}\n' +
    '\n' +
    '/* Horizontal rule */\n' +
    'hr {\n' +
    '  border: none;\n' +
    '  border-top: 1px solid #d1d5db;\n' +
    '  margin: 1.5em 0;\n' +
    '}\n'
  )
}

export function buildChapterDocument(input: BuildChapterDocumentInput): string {
  const { title, content, language } = input
  const langAttr = xmlLangAttr(language)

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE html>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml"${langAttr}>\n` +
    '  <head>\n' +
    `    <title>${escapeXml(title)}</title>\n` +
    '    <link rel="stylesheet" type="text/css" href="../styles/book.css" />\n' +
    '  </head>\n' +
    '  <body>\n' +
    `    ${content}\n` +
    '  </body>\n' +
    '</html>\n'
  )
}

export function buildNavDocument(input: BuildNavDocumentInput): string {
  const { title, chapters, language } = input
  const langAttr = xmlLangAttr(language)

  const tocItems = chapters
    .map(
      (ch) =>
        `      <li><a href="${escapeXml(ch.href)}">${escapeXml(ch.title)}</a></li>`,
    )
    .join('\n')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE html>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${langAttr}>\n` +
    '  <head>\n' +
    `    <title>${escapeXml(title)}</title>\n` +
    '    <link rel="stylesheet" type="text/css" href="styles/book.css" />\n' +
    '  </head>\n' +
    '  <body>\n' +
    '    <nav epub:type="toc" id="toc" role="doc-toc">\n' +
    `      <h1>${escapeXml(title)}</h1>\n` +
    '      <ol>\n' +
    `        ${tocItems}\n` +
    '      </ol>\n' +
    '    </nav>\n' +
    '  </body>\n' +
    '</html>\n'
  )
}

export function buildTocNcx(input: BuildTocNcxInput): string {
  const { title, chapters, language, uid } = input
  const langAttr = language ? ` xml:lang="${escapeXml(language)}"` : ''

  const navPoints = chapters
    .map((ch, idx) => {
      const order = idx + 1
      return (
        `    <navPoint id="navPoint-${order}" playOrder="${order}">\n` +
        `      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>\n` +
        `      <content src="${escapeXml(ch.href)}" />\n` +
        `    </navPoint>`
      )
    })
    .join('\n')

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n' +
    `<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/"${langAttr}>\n` +
    '  <head>\n' +
    `    <meta name="dtb:uid" content="${escapeXml(uid)}" />\n` +
    '    <meta name="dtb:depth" content="1" />\n' +
    '    <meta name="dtb:totalPageCount" content="0" />\n' +
    '    <meta name="dtb:maxPageNumber" content="0" />\n' +
    '  </head>\n' +
    '  <docTitle>\n' +
    `    <text>${escapeXml(title)}</text>\n` +
    '  </docTitle>\n' +
    '  <navMap>\n' +
    `    ${navPoints}\n` +
    '  </navMap>\n' +
    '</ncx>\n'
  )
}

export function buildContentOpf(input: BuildContentOpfInput): string {
  const {
    title,
    language,
    uid,
    chapters,
    assets,
    cover,
    author,
    description,
    publisher,
    publicationDate,
    updatedAt,
    isbn,
  } = input

  const modifiedDate = formatOpfDate(updatedAt) ?? formatOpfDate(publicationDate)

  // EPUB 3.2 requires dc:language; default to 'en' when not provided.
  const safeLanguage = language || 'en'

  let metadata = '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
  metadata += `    <dc:identifier id="pub-id">${escapeXml(uid)}</dc:identifier>\n`
  metadata += `    <dc:title>${escapeXml(title)}</dc:title>\n`
  metadata += `    <dc:language>${escapeXml(safeLanguage)}</dc:language>\n`
  metadata += dcElement('creator', author)
  metadata += dcElement('description', description)
  metadata += dcElement('publisher', publisher)
  metadata += dcElement('date', formatDateOnly(publicationDate))
  if (isbn) {
    metadata += `    <dc:identifier id="isbn">${escapeXml(isbn)}</dc:identifier>\n`
  }
  if (modifiedDate) {
    metadata += `    <meta property="dcterms:modified">${modifiedDate}</meta>\n`
  }
  const coverAssetMatch = cover
    ? assets.find((asset) => asset.id === cover.id || asset.href === cover.href) ?? null
    : null
  const coverItemId = coverAssetMatch ? toXmlId(`asset-${coverAssetMatch.id}`) : 'cover-image'

  if (cover) {
    metadata += `    <meta name="cover" content="${coverItemId}" />\n`
  }
  metadata += '  </metadata>\n'

  let manifest = '  <manifest>\n'
  manifest +=
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />\n'
  manifest +=
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />\n'
  manifest +=
    '    <item id="css" href="styles/book.css" media-type="text/css" />\n'

  for (const ch of chapters) {
    const id = toXmlId(`chapter-${ch.id}`)
    manifest += `    <item id="${id}" href="${escapeXml(ch.href)}" media-type="application/xhtml+xml" />\n`
  }

  for (const asset of assets) {
    const id = toXmlId(`asset-${asset.id}`)
    const properties = new Set(asset.properties ?? [])
    if (cover && (asset.id === cover.id || asset.href === cover.href)) {
      properties.add('cover-image')
    }
    const props = properties.size > 0
      ? ` properties="${escapeXml(Array.from(properties).join(' '))}"`
      : ''
    manifest += `    <item id="${id}" href="${escapeXml(asset.href)}" media-type="${escapeXml(asset.mediaType)}"${props} />\n`
  }

  if (cover && !coverAssetMatch) {
    manifest += `    <item id="cover-image" href="${escapeXml(cover.href)}" media-type="${escapeXml(cover.mediaType)}" properties="cover-image" />\n`
  }

  manifest += '  </manifest>\n'

  let spine = '  <spine toc="ncx">\n'
  spine += '    <itemref idref="nav" />\n'
  for (const ch of chapters) {
    const id = toXmlId(`chapter-${ch.id}`)
    spine += `    <itemref idref="${id}" />\n`
  }
  spine += '  </spine>\n'

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id">\n' +
    metadata +
    manifest +
    spine +
    '</package>\n'
  )
}

/**
 * Sanitizes a string so it is safe to use as an archive path segment.
 * Removes path separators, control characters, leading dots, and collapses
 * dashes.
 */
export function sanitizeArchivePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
