import type { NavItem } from 'epubjs/types/navigation'
import slugify from 'slugify'

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

export const MEDIA_UPLOAD_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

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

const isRelativeURL = (value: string): boolean => {
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../') || value.startsWith('#')) {
    return true
  }

  if (value.startsWith('//')) {
    return false
  }

  return !/^[a-z][a-z\d+.-]*:/i.test(value)
}

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

const removeDisallowedNodes = (document: Document) => {
  for (const tagName of DISALLOWED_TAGS) {
    for (const element of Array.from(document.querySelectorAll(tagName))) {
      element.remove()
    }
  }
}

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

export const sanitizeChapterHTML = (rawHTML: string): { html: string; warnings: string[] } => {
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

const normalizeTocPath = (value: string): string => {
  return stripQueryAndHash(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

const collapseDuplicateLabels = (labels: string[]): string[] => {
  const deduped: string[] = []

  for (const label of labels) {
    if (deduped[deduped.length - 1] !== label) {
      deduped.push(label)
    }
  }

  return deduped
}

const normalizeTocLabel = (label: string | null | undefined, href: string): string => {
  const trimmedLabel = trimToNull(label)
  if (trimmedLabel) {
    return trimmedLabel
  }

  const fallbackHref = trimToNull(stripQueryAndHash(href).split('/').pop() ?? '')
  return fallbackHref ?? 'Untitled section'
}

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

type FlattenedTocItem = {
  href: string
  id: string | null
  labels: string[]
  depth: number
}

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

export const buildStableHash = (value: string): string => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

export const buildStableBinaryHash = (value: ArrayBuffer | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let hash = 2166136261

  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

const inferFileExtension = (mimeType: string): string => {
  return MIME_EXTENSION_MAP[mimeType] ?? 'jpg'
}

export const createStableMediaFilename = (
  assetPath: string,
  mimeType: string,
  fallbackIndex: number,
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
  const hash = buildStableHash(cleanPath || safeBaseName)
  const extension = inferFileExtension(mimeType)

  return `${safeBaseName}-${hash.slice(0, 10)}.${extension}`
}

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

export const createImportBatchID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

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

export const createImportedBookSlug = (title: string): string => {
  const normalizedTitle = trimToNull(title)

  if (!normalizedTitle) {
    return ''
  }

  return slugify(normalizedTitle, {
    lower: true,
    strict: true,
    locale: 'vi',
    trim: true,
  })
}

export const buildChapterSourceKey = (
  itemHref: string,
  itemID: string | null,
  chapterOrder: number,
): string => {
  const normalizedHref = trimToNull(stripQueryAndHash(itemHref))
  const normalizedItemID = trimToNull(itemID)

  return [normalizedItemID, normalizedHref, `chapter-${chapterOrder}`].filter(Boolean).join('::')
}

export const estimateWordCountFromHTML = (html: string): number => {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  const text = (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()

  if (text.length === 0) {
    return 0
  }

  return text.split(' ').filter((word) => word.length > 0).length
}

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

export const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds))
  })
}
