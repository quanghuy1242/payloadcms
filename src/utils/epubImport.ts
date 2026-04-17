// BROWSER-ONLY MODULE
// This module relies on browser APIs (DOMParser, Blob, canvas, URL.createObjectURL).
// It must not be imported in server-side or Node.js contexts.
// For the HTML → Lexical conversion step (which is runtime-agnostic), use epubLexical.ts instead.

/**
 * @module epubImport
 * Browser-only utilities for EPUB import: HTML sanitisation, TOC resolution,
 * asset-path normalisation, stable hash / filename generation, and chapter batching.
 *
 * @remarks Requires browser APIs (`DOMParser`, `Blob`, `canvas`, `URL.createObjectURL`).
 * Do not import in Node.js or server-side contexts.
 */
import type { NavItem } from 'epubjs/types/navigation'

import { formatSlug, resolveSlugLocale } from './slug'

const DISALLOWED_TAGS = ['style', 'script', 'iframe', 'object', 'embed'] as const
const URL_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const BLOCK_TAG_NAMES = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
])
const DIV_NORMALIZATION_PARENT_BLACKLIST = new Set(['li', 'td', 'th'])

/** MIME types accepted by the Payload media upload endpoint for EPUB-imported images. */
export const MEDIA_UPLOAD_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Returns the trimmed string, or `null` if the value is not a string or is blank after trimming. */
const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Strips the query string and fragment hash from a URL-like string. */
const stripQueryAndHash = (value: string): string => {
  const hashIndex = value.indexOf('#')
  const queryIndex = value.indexOf('?')

  let endIndex = value.length

  if (hashIndex >= 0) {
    endIndex = Math.min(endIndex, hashIndex)
  }

  if (queryIndex >= 0) {
    endIndex = Math.min(endIndex, queryIndex)
  }

  return value.slice(0, endIndex)
}

/** Removes `element` from the DOM, re-parenting all of its children to its former parent. */
const unwrapElement = (element: HTMLElement) => {
  const parent = element.parentNode

  if (!parent) {
    return
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }

  parent.removeChild(element)
}

/** Replaces `element` in the DOM with a new element of `replacementTag`, preserving all children. */
const replaceElementTag = (element: HTMLElement, replacementTag: string) => {
  const parent = element.parentNode

  if (!parent) {
    return
  }

  const replacement = element.ownerDocument.createElement(replacementTag)

  while (element.firstChild) {
    replacement.appendChild(element.firstChild)
  }

  parent.replaceChild(replacement, element)
}

/** Returns `true` if `value` is a relative URL (no scheme, not protocol-relative). */
const isRelativeURL = (value: string): boolean => {
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('#')) {
    return true
  }

  if (value.startsWith('//')) {
    return false
  }

  return !/^[a-z][a-z\d+.-]*:/i.test(value)
}

/**
 * Sanitizes a URL attribute value for use in HTML.
 *
 * Allows relative URLs and URLs with an approved scheme (http, https, mailto, tel).
 * `href` values that are fragment-only (`#…`) are passed through unchanged.
 *
 * @param rawValue - The raw attribute string to sanitize.
 * @param attributeName - The attribute being sanitized (`'href'` or `'src'`).
 * @returns The sanitized URL, or `null` if the value should be removed.
 */
export const sanitizeURLAttributeValue = (
  rawValue: string,
  attributeName: 'href' | 'src',
): string | null => {
  const value = trimToNull(rawValue)

  if (!value) {
    return null
  }

  if (attributeName === 'href' && value.startsWith('#')) {
    return value
  }

  if (isRelativeURL(value)) {
    return value
  }

  let parsedURL: URL

  try {
    parsedURL = new URL(value)
  } catch {
    return null
  }

  if (!URL_PROTOCOL_ALLOWLIST.has(parsedURL.protocol)) {
    return null
  }

  return value
}

/**
 * Sanitizes a URL intended for use as a Lexical link `url` field.
 *
 * Fragment-only values and blank strings are rejected. Only absolute URLs with an
 * approved scheme (http, https, mailto, tel) are accepted.
 *
 * @param rawValue - The raw URL string to sanitize.
 * @returns The sanitized URL, or `null` if the value should be discarded.
 */
export const sanitizeLexicalLinkURLValue = (rawValue: string): string | null => {
  const value = trimToNull(rawValue)

  if (!value || value.startsWith('#')) {
    return null
  }

  let parsedURL: URL

  try {
    parsedURL = new URL(value)
  } catch {
    return null
  }

  if (!URL_PROTOCOL_ALLOWLIST.has(parsedURL.protocol)) {
    return null
  }

  return value
}

/** Removes all `DISALLOWED_TAGS` elements (script, style, iframe, object, embed) from the document. */
const removeDisallowedNodes = (document: Document) => {
  for (const tagName of DISALLOWED_TAGS) {
    for (const element of Array.from(document.querySelectorAll(tagName))) {
      element.remove()
    }
  }
}

/**
 * Strips unsafe attributes from every element in `document.body`.
 *
 * Removes event handlers (`on*`), `style`, and `srcset`. Validates `href`/`src`
 * values and removes or rewrites them as needed. Pushes human-readable messages
 * into `warnings` for each removed attribute.
 */
const sanitizeElementAttributes = (document: Document, warnings: string[]) => {
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase()

      if (attributeName.startsWith('on')) {
        element.removeAttribute(attribute.name)
        warnings.push(`Removed unsafe event handler attribute: ${attribute.name}`)
        continue
      }

      if (attributeName === 'style' || attributeName === 'srcset') {
        element.removeAttribute(attribute.name)
        continue
      }

      if (attributeName === 'href' || attributeName === 'src') {
        const sanitizedURL = sanitizeURLAttributeValue(attribute.value, attributeName)

        if (!sanitizedURL) {
          element.removeAttribute(attribute.name)
          warnings.push(`Removed unsafe ${attributeName} URL: ${attribute.value}`)
          continue
        }

        if (sanitizedURL !== attribute.value) {
          element.setAttribute(attribute.name, sanitizedURL)
        }
      }
    }
  }
}

/**
 * Simplifies wrapper `<div>` elements in the document body.
 *
 * - Single-child `<div>` wrappers around another `<div>` or `<p>` (with no own text) are unwrapped.
 * - Plain `<div>` elements that contain only inline text are converted to `<p>`.
 * - Divs inside list items or table cells are left untouched.
 */
const normalizeWrapperDivs = (document: Document) => {
  const divElements = Array.from(document.body.querySelectorAll('div'))

  for (const divElement of divElements) {
    const parentTagName = divElement.parentElement?.tagName.toLowerCase()

    if (parentTagName && DIV_NORMALIZATION_PARENT_BLACKLIST.has(parentTagName)) {
      continue
    }

    const directChildren = Array.from(divElement.children)
    const hasAttributes = divElement.attributes.length > 0
    const hasBlockChild = directChildren.some((child) => BLOCK_TAG_NAMES.has(child.tagName.toLowerCase()))
    const hasText = trimToNull(divElement.textContent) != null
    const hasDirectTextContent = Array.from(divElement.childNodes).some((node) => {
      return node.nodeType === Node.TEXT_NODE && trimToNull(node.textContent) != null
    })

    if (!hasAttributes && directChildren.length === 1) {
      const childTagName = directChildren[0]?.tagName.toLowerCase()

      if (!hasDirectTextContent && (childTagName === 'div' || childTagName === 'p')) {
        unwrapElement(divElement)
        continue
      }
    }

    if (!hasAttributes && !hasBlockChild && hasText) {
      replaceElementTag(divElement, 'p')
    }
  }
}

/**
 * Runs the full HTML sanitization pipeline on a raw EPUB chapter string.
 *
 * Steps: remove disallowed tags → strip unsafe attributes → normalize wrapper divs.
 * Must be called in a browser environment (`DOMParser` is required).
 *
 * @param rawHTML - The raw HTML content of an EPUB chapter.
 * @returns An object with the sanitized `html` string and an array of `warnings`
 *   describing any values that were removed or rewritten.
 * @throws {Error} If called outside a browser environment.
 */
export const sanitizeChapterHTML = (rawHTML: string): { html: string; warnings: string[] } => {
  if (typeof window === 'undefined') {
    throw new Error('sanitizeChapterHTML requires a browser environment (DOMParser is not available)')
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(rawHTML, 'text/html')
  const warnings: string[] = []

  removeDisallowedNodes(document)
  sanitizeElementAttributes(document, warnings)
  normalizeWrapperDivs(document)

  return {
    html: document.body.innerHTML,
    warnings,
  }
}

/**
 * Extracts a human-readable title from a chapter's HTML.
 *
 * Tries `h1 → h2 → h3 → <title>` in order. Falls back to `fallbackTitle`,
 * then to `"Chapter <fallbackOrder>"`.
 *
 * @param rawHTML - Raw HTML of the chapter.
 * @param fallbackTitle - Title from the EPUB spine or TOC to use when no heading is found.
 * @param fallbackOrder - 1-based chapter index used as last-resort fallback.
 * @returns A non-empty title string.
 */
export const extractChapterTitle = (
  rawHTML: string,
  fallbackTitle: string,
  fallbackOrder: number,
): string => {
  const parser = new DOMParser()
  const document = parser.parseFromString(rawHTML, 'text/html')

  for (const selector of ['h1', 'h2', 'h3', 'title']) {
    const candidate = trimToNull(document.querySelector(selector)?.textContent)

    if (candidate) {
      return candidate
    }
  }

  const fallback = trimToNull(fallbackTitle)
  if (fallback) {
    return fallback
  }

  return `Chapter ${fallbackOrder}`
}

/** Strips query/hash, normalises backslashes to forward slashes, and removes a leading `./` or `/`. */
const normalizeTocPath = (value: string): string => {
  return stripQueryAndHash(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

/** Removes consecutive duplicate entries from a label array (preserves non-adjacent duplicates). */
const collapseDuplicateLabels = (labels: string[]): string[] => {
  const deduped: string[] = []

  for (const label of labels) {
    if (deduped[deduped.length - 1] !== label) {
      deduped.push(label)
    }
  }

  return deduped
}

/** Returns a trimmed TOC label, or the last path segment of `href`, or `'Untitled section'`. */
const normalizeTocLabel = (label: string | null | undefined, href: string): string => {
  const trimmedLabel = trimToNull(label)
  if (trimmedLabel) {
    return trimmedLabel
  }

  const fallbackHref = trimToNull(stripQueryAndHash(href).split('/').pop() ?? '')
  return fallbackHref ?? 'Untitled section'
}

/**
 * Returns `true` if two TOC entry hrefs refer to the same resource.
 *
 * Compares normalised paths and also handles cases where one path is a suffix of the other
 * (e.g. `OEBPS/chapter1.xhtml` vs `chapter1.xhtml`).
 */
const tocPathsMatch = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeTocPath(left)
  const normalizedRight = normalizeTocPath(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight}`) ||
    normalizedRight.endsWith(`/${normalizedLeft}`)
  )
}

/** A single, depth-annotated entry produced by flattening the nested EPUB TOC tree. */
type FlattenedTocItem = {
  href: string
  id: string | null
  labels: string[]
  depth: number
}

/**
 * Recursively flattens a nested EPUB `NavItem` tree into an ordered array of `FlattenedTocItem`s.
 *
 * Each entry inherits the label chain of all ancestor items so that depth and breadcrumb
 * information are preserved.
 *
 * @param toc - The TOC items to flatten (may contain nested `subitems`).
 * @param ancestors - Accumulated label chain from parent items (used internally during recursion).
 */
const flattenTocItems = (toc: NavItem[], ancestors: string[] = []): FlattenedTocItem[] => {
  const flattened: FlattenedTocItem[] = []

  for (const item of toc) {
    const href = trimToNull(item.href) ?? ''
    const labels = collapseDuplicateLabels([
      ...ancestors,
      normalizeTocLabel(item.label, href),
    ])

    flattened.push({
      href,
      id: trimToNull(item.id),
      labels,
      depth: labels.length,
    })

    if (item.subitems?.length) {
      flattened.push(...flattenTocItems(item.subitems, labels))
    }
  }

  return flattened
}

/**
 * Resolves TOC metadata (title, href, id) for a spine item identified by its href.
 *
 * Flattens the full TOC tree and returns the deepest matching entry, so that a
 * chapter nested several levels deep gets its fully-qualified breadcrumb title
 * (e.g. `"Part 1 > Chapter 2 > Section 3"`).
 *
 * @param toc - The EPUB navigation item tree, or `undefined` if the book has no TOC.
 * @param spineHref - The href of the spine item to look up.
 * @returns The best-matching TOC entry, or `null` if the TOC is absent or no match is found.
 */
export const resolveChapterTocMetadata = (
  toc: NavItem[] | undefined,
  spineHref: string,
): { title: string; href: string; id: string | null } | null => {
  if (!toc?.length) {
    return null
  }

  const matchingItems = flattenTocItems(toc).filter((item) => tocPathsMatch(item.href, spineHref))

  if (matchingItems.length === 0) {
    return null
  }

  const bestMatch = matchingItems.reduce((currentBest, item) => {
    return item.depth > currentBest.depth ? item : currentBest
  })

  return {
    title: bestMatch.labels.join(' > '),
    href: bestMatch.href,
    id: bestMatch.id,
  }
}

/**
 * Resolves a relative asset `src` (image, stylesheet) against the EPUB chapter's href.
 *
 * Handles `./`, `../`, and bare relative paths. Absolute URLs, `data:`, `blob:`, and
 * protocol-relative URLs are returned unchanged. Fragment-only values are rejected.
 *
 * @param chapterHref - The href of the chapter that references the asset.
 * @param sourcePath - The raw `src` or `href` value from the chapter HTML.
 * @returns The resolved EPUB-root-relative path, or `null` for blank or fragment-only values.
 */
export const resolveEpubAssetPath = (chapterHref: string, sourcePath: string): string | null => {
  const normalizedSourcePath = trimToNull(sourcePath)

  if (!normalizedSourcePath) {
    return null
  }

  if (normalizedSourcePath.startsWith('#')) {
    return null
  }

  if (
    /^(https?:\/\/|data:|blob:|\/\/)/i.test(normalizedSourcePath) ||
    normalizedSourcePath.startsWith('/')
  ) {
    return normalizedSourcePath
  }

  const chapterBasePath = stripQueryAndHash(chapterHref)
  const chapterSegments = chapterBasePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .slice(0, -1)
  const sourceSegments = stripQueryAndHash(normalizedSourcePath)
    .split('/')
    .filter((segment) => segment.length > 0)

  const mergedSegments = [...chapterSegments, ...sourceSegments]
  const normalizedSegments: string[] = []

  for (const segment of mergedSegments) {
    if (segment === '.') {
      continue
    }

    if (segment === '..') {
      normalizedSegments.pop()
      continue
    }

    normalizedSegments.push(segment)
  }

  return normalizedSegments.join('/')
}

/**
 * Computes a FNV-1a 32-bit hash of a UTF-16 string and returns it as a hex string.
 *
 * Used to create stable, deterministic identifiers for EPUB assets and chapters.
 *
 * @param value - The string to hash.
 * @returns An up-to-8-character lowercase hexadecimal hash.
 */
export const buildStableHash = (value: string): string => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

/**
 * Computes a FNV-1a 32-bit hash of raw binary data and returns it as a hex string.
 *
 * Accepts either an `ArrayBuffer` or a `Uint8Array`. Used to fingerprint EPUB binary assets.
 *
 * @param value - The binary data to hash.
 * @returns An up-to-8-character lowercase hexadecimal hash.
 */
export const buildStableBinaryHash = (value: ArrayBuffer | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let hash = 2166136261

  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

/** Maps a MIME type to a file extension; defaults to `'jpg'` for unknown image types. */
const inferFileExtension = (mimeType: string): string => {
  return MIME_EXTENSION_MAP[mimeType] ?? 'jpg'
}

/**
 * Generates a stable, collision-resistant filename for an EPUB media asset.
 *
 * The filename is `<sanitized-basename>-<hash>.ext` where the hash is derived from
 * the optional `namespace` and the resolved asset path. This ensures consistent
 * filenames across repeated imports of the same EPUB.
 *
 * @param assetPath - The EPUB-root-relative path to the asset.
 * @param mimeType - MIME type of the asset (determines the file extension).
 * @param fallbackIndex - Used in the basename when the path has no recognisable filename.
 * @param namespace - Optional prefix for the hash input (e.g. book hash) to prevent collisions across books.
 * @returns A filename string such as `cover-3f2a1b4c9d.jpg`.
 */
export const createStableMediaFilename = (
  assetPath: string,
  mimeType: string,
  fallbackIndex: number,
  namespace = '',
): string => {
  const cleanPath = stripQueryAndHash(assetPath)
  const pathSegments = cleanPath.split('/').filter((segment) => segment.length > 0)
  const originalBaseName = pathSegments[pathSegments.length - 1] ?? `image-${fallbackIndex}`

  const baseName = originalBaseName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const safeBaseName = baseName || `image-${fallbackIndex}`
  const hashSource = namespace ? `${namespace}::${cleanPath || safeBaseName}` : cleanPath || safeBaseName
  const hash = buildStableHash(hashSource)
  const extension = inferFileExtension(mimeType)

  return `${safeBaseName}-${hash.slice(0, 10)}.${extension}`
}

/**
 * Builds a descriptive alt-text string for a media asset imported from an EPUB book.
 *
 * @param bookTitle - Human-readable title of the source book.
 * @param bookHash - Stable hash that identifies the book (used for disambiguation).
 * @param identifier - Chapter or image index / ID within the book.
 * @param detail - Optional extra descriptor appended to the string.
 * @returns A non-empty alt-text string.
 */
export const createImportedBookMediaAltText = (
  bookTitle: string,
  bookHash: string,
  identifier: string | number,
  detail?: string,
): string => {
  const normalizedTitle = trimToNull(bookTitle) ?? 'Untitled EPUB Import'
  const normalizedHash = trimToNull(bookHash) ?? 'unknown'
  const normalizedIdentifier = trimToNull(String(identifier)) ?? 'unknown'
  const prefix = `Image from book ${normalizedTitle} - ID ${normalizedIdentifier} - ${normalizedHash}`
  const normalizedDetail = trimToNull(detail)

  return normalizedDetail ? `${prefix} - ${normalizedDetail}` : prefix
}

/**
 * Derives alt text for an `<img>` element from the available DOM attributes.
 *
 * Priority: `alt` attribute → `title` attribute → generated string from chapter title and index.
 *
 * @param imageElement - The `<img>` DOM element.
 * @param chapterTitle - Title of the containing chapter (used in the fallback string).
 * @param imageIndex - 0-based index of the image within the chapter.
 * @returns A non-empty alt-text string.
 */
export const deriveImageAltText = (
  imageElement: Element,
  chapterTitle: string,
  imageIndex: number,
): string => {
  const explicitAlt = trimToNull(imageElement.getAttribute('alt'))

  if (explicitAlt) {
    return explicitAlt
  }

  const titleAlt = trimToNull(imageElement.getAttribute('title'))

  if (titleAlt) {
    return titleAlt
  }

  const chapterContext = trimToNull(chapterTitle) ?? `Chapter ${imageIndex + 1}`
  return `Image ${imageIndex + 1} from ${chapterContext}`
}

/**
 * Generates a unique identifier for a single EPUB import operation.
 *
 * Uses `crypto.randomUUID()` when available, with a `Date.now()`-based fallback.
 *
 * @returns A UUID-like string.
 */
export const createImportBatchID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Resolves a display title for an imported EPUB book.
 *
 * Uses the metadata `title` when it is a non-blank string; falls back to `fileName`
 * (with the `.epub` extension stripped); then falls back to `'Untitled EPUB Import'`.
 *
 * @param title - Raw title value from the EPUB metadata (may be any type).
 * @param fileName - The original file name (used as fallback).
 * @returns A non-empty title string.
 */
export const createImportedBookTitle = (title: unknown, fileName: string): string => {
  const normalizedTitle = trimToNull(typeof title === 'string' ? title : String(title ?? ''))

  if (normalizedTitle) {
    return normalizedTitle
  }

  const fallback = trimToNull(fileName)

  if (!fallback) {
    return 'Untitled EPUB Import'
  }

  return fallback.replace(/\.epub$/i, '')
}

/**
 * Generates a URL-safe slug for an imported EPUB book.
 *
 * @param title - The book title to slugify.
 * @param language - BCP 47 language code used to select locale-aware slug formatting. Defaults to `'en'`.
 * @returns A slugified string, or `''` if `title` is blank.
 */
export const createImportedBookSlug = (title: string, language = 'en'): string => {
  const normalizedTitle = trimToNull(title)

  if (!normalizedTitle) {
    return ''
  }

  return formatSlug(normalizedTitle, resolveSlugLocale(language, 'en'))
}

/**
 * Builds a stable, composite key that uniquely identifies a spine item within an EPUB.
 *
 * The key is formed from the EPUB spine item ID, the normalised href, and the ordinal
 * position — whichever values are non-empty — joined by `'::'`.
 *
 * @param itemHref - The href of the spine item.
 * @param itemID - The `id` attribute of the spine item in the EPUB manifest, or `null`.
 * @param chapterOrder - 1-based ordinal position in the spine (last-resort component).
 * @returns A `'::'`-delimited composite key string.
 */
export const buildChapterSourceKey = (
  itemHref: string,
  itemID: string | null,
  chapterOrder: number,
): string => {
  const normalizedHref = trimToNull(stripQueryAndHash(itemHref))
  const normalizedItemID = trimToNull(itemID)

  return [normalizedItemID, normalizedHref, `chapter-${chapterOrder}`].filter(Boolean).join('::')
}

/**
 * Estimates the word count of an HTML string by parsing it and splitting the text content on whitespace.
 *
 * @param html - Raw HTML to count words in.
 * @returns The estimated number of words (0 for empty content).
 */
export const estimateWordCountFromHTML = (html: string): number => {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  const text = (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()

  if (text.length === 0) {
    return 0
  }

  return text.split(' ').filter((word) => word.length > 0).length
}

/**
 * Partitions an ordered array of chapters into batches for incremental server uploads.
 *
 * A new batch is started when either the chapter count or the cumulative word count
 * of the current batch would exceed the specified limits.
 *
 * @param chapters - Ordered array of chapter objects (must expose a `wordCount` property).
 * @param maxChaptersPerBatch - Maximum number of chapters allowed in a single batch.
 * @param maxWordsPerBatch - Maximum cumulative word count allowed in a single batch.
 * @returns An array of batches; each batch is a non-empty sub-array of `chapters`.
 */
export const createChapterBatches = <T extends { wordCount: number }>(
  chapters: T[],
  maxChaptersPerBatch: number,
  maxWordsPerBatch: number,
): T[][] => {
  if (chapters.length === 0) {
    return []
  }

  const chapterLimit = Math.max(1, Math.floor(maxChaptersPerBatch))
  const wordLimit = Math.max(1, Math.floor(maxWordsPerBatch))

  const batches: T[][] = []
  let currentBatch: T[] = []
  let currentWordCount = 0

  for (const chapter of chapters) {
    const chapterWordCount = Math.max(0, Math.floor(chapter.wordCount))
    const exceedsChapterLimit = currentBatch.length >= chapterLimit
    const exceedsWordLimit = currentBatch.length > 0 && currentWordCount + chapterWordCount > wordLimit

    if (exceedsChapterLimit || exceedsWordLimit) {
      batches.push(currentBatch)
      currentBatch = []
      currentWordCount = 0
    }

    currentBatch.push(chapter)
    currentWordCount += chapterWordCount
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

/**
 * Ensures a media `Blob` is in a format accepted by Payload's media upload endpoint.
 *
 * If the MIME type is already in `MEDIA_UPLOAD_ALLOWED_MIME_TYPES`, the blob is returned
 * unchanged. Other image types are converted to JPEG via a `<canvas>` element.
 * Non-image blobs and failed conversions return `null`.
 *
 * @param blob - The raw image blob from the EPUB, or `null`/`undefined` to skip.
 * @returns The (possibly converted) blob and its final MIME type, or `null` on failure.
 */
export const ensureSupportedMediaBlob = async (
  blob: Blob | null | undefined,
): Promise<{ blob: Blob; mimeType: string } | null> => {
  if (!blob) {
    return null
  }

  const normalizedMimeType = blob.type.toLowerCase()

  if (MEDIA_UPLOAD_ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
    return {
      blob,
      mimeType: normalizedMimeType,
    }
  }

  if (!normalizedMimeType.startsWith('image/')) {
    return null
  }

  const convertedBlob = await convertImageBlobToJpeg(blob)

  if (!convertedBlob) {
    return null
  }

  return {
    blob: convertedBlob,
    mimeType: 'image/jpeg',
  }
}

/**
 * Loads a `Blob` as an `HTMLImageElement` using an object URL.
 *
 * The object URL is revoked after the image settles (load or error).
 *
 * @returns A resolved `HTMLImageElement`, or `null` if the image failed to load.
 */
const loadBlobAsImage = async (blob: Blob): Promise<HTMLImageElement | null> => {
  const imageURL = URL.createObjectURL(blob)

  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image()

      image.onload = () => {
        resolve(image)
      }

      image.onerror = () => {
        resolve(null)
      }

      image.src = imageURL
    })
  } finally {
    URL.revokeObjectURL(imageURL)
  }
}

/**
 * Converts an image `Blob` of any browser-supported format to JPEG at 92% quality.
 *
 * Uses `<canvas>.toBlob()` and requires a browser environment with a 2D canvas context.
 *
 * @returns The JPEG `Blob`, or `null` if the image could not be loaded or drawn.
 */
const convertImageBlobToJpeg = async (blob: Blob): Promise<Blob | null> => {
  const imageElement = await loadBlobAsImage(blob)

  if (!imageElement) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = imageElement.naturalWidth || imageElement.width
  canvas.height = imageElement.naturalHeight || imageElement.height

  if (canvas.width <= 0 || canvas.height <= 0) {
    return null
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.drawImage(imageElement, 0, 0, canvas.width, canvas.height)

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (convertedBlob) => {
        resolve(convertedBlob)
      },
      'image/jpeg',
      0.92,
    )
  })
}

/**
 * Resolves after the given number of milliseconds. Negative values are treated as zero.
 *
 * @param milliseconds - Delay in milliseconds.
 */
export const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds))
  })
}
