import { formatSlug } from './slug'
import { isNonEmptyString } from './strings'

/** Shared page size for export manifest → chunk contract. */
export const PAGE_SIZE = 25

export type ExportChapterIndexEntry = {
  id: string
  order: number
  title: string
  slug: string
  chapterSourceKey: string | null
}

export function buildExportFilename(bookSlug: string): string {
  return `${bookSlug}.epub`
}

export function createChapterArchiveName(
  order: number,
  title: string,
  slug?: string | null,
): string {
  const safeSlug = isNonEmptyString(slug) ? slug.trim() : formatSlug(title)
  const normalized = safeSlug
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = normalized || 'chapter'
  return `chapter-${String(order).padStart(4, '0')}-${suffix}.xhtml`
}

export function createMediaArchiveName(
  id: string,
  filename: string,
  mimeType?: string | null,
): string {
  const lastDot = filename.lastIndexOf('.')
  const extFromFilename = lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : ''
  const extByMimeType: Record<string, string> = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  }
  const extFromMimeType = mimeType ? extByMimeType[mimeType.toLowerCase()] || '' : ''
  const finalExt = extFromMimeType || extFromFilename

  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const safeBase = base
    .replace(/[^a-z0-9_-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const namePart = safeBase || 'asset'
  const extPart = finalExt ? `.${finalExt}` : ''
  return `${id}-${namePart}${extPart}`
}

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

export function normalizeEpubPath(path: string): string {
  if (!path) return ''
  const qIdx = path.indexOf('?')
  const stripped = qIdx !== -1 ? path.slice(0, qIdx) : path
  const clean = stripped.replace(/^(\.\.\/|\.\/)+/, '')
  return clean.toLowerCase()
}

export function spineHrefFromSourceKey(chapterSourceKey: string): string | null {
  const parts = chapterSourceKey.split('::')
  return parts.length >= 2 ? (parts[1] ?? null) : null
}

export function resolveEpubHrefToArchivePath(
  epubHref: string,
  chapters: ExportChapterIndexEntry[],
  archivePathByChapterId: Map<string, string>,
): string | null {
  const { path, fragment } = splitEpubHref(epubHref)

  // In-page anchor — no chapter lookup needed.
  if (!path) {
    return fragment ? `#${fragment}` : null
  }

  const normalizedInput = normalizeEpubPath(path)
  const inputBasename = normalizedInput.split('/').pop() ?? normalizedInput

  for (const chapter of chapters) {
    if (!chapter.chapterSourceKey) continue

    const spineHref = spineHrefFromSourceKey(chapter.chapterSourceKey)
    if (!spineHref) continue

    const normalizedSpine = normalizeEpubPath(spineHref)
    const spineBasename = normalizedSpine.split('/').pop() ?? normalizedSpine

    const matched =
      normalizedSpine === normalizedInput || spineBasename === inputBasename

    if (matched) {
      const archivePath = archivePathByChapterId.get(chapter.id)
      if (!archivePath) return null
      return fragment ? `${archivePath}#${fragment}` : archivePath
    }
  }

  return null
}
