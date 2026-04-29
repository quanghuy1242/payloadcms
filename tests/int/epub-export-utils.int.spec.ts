import { describe, expect, it } from 'vitest'

import {
  buildExportFilename,
  createChapterArchiveName,
  createMediaArchiveName,
  ExportChapterIndexEntry,
  normalizeEpubPath,
  resolveEpubHrefToArchivePath,
  splitEpubHref,
  spineHrefFromSourceKey,
} from '@/utils/epubExportHelpers'

describe('buildExportFilename', () => {
  it('appends .epub to the book slug', () => {
    expect(buildExportFilename('my-book')).toBe('my-book.epub')
  })
})

describe('createChapterArchiveName', () => {
  it('produces a stable name from order and title', () => {
    expect(createChapterArchiveName(1, 'Introduction')).toBe('chapter-0001-introduction.xhtml')
  })

  it('uses the provided slug when available', () => {
    expect(createChapterArchiveName(2, 'The Forest', 'the-forest')).toBe(
      'chapter-0002-the-forest.xhtml',
    )
  })

  it('keeps duplicate-ish titles unique because order is included', () => {
    const a = createChapterArchiveName(3, 'Chapter One', 'chapter-one')
    const b = createChapterArchiveName(4, 'Chapter One', 'chapter-one')
    expect(a).toBe('chapter-0003-chapter-one.xhtml')
    expect(b).toBe('chapter-0004-chapter-one.xhtml')
    expect(a).not.toBe(b)
  })

  it('falls back to title-derived slug when no slug is provided', () => {
    expect(createChapterArchiveName(5, 'The Deep Woods')).toBe('chapter-0005-the-deep-woods.xhtml')
  })

  it('sanitizes unsafe characters in the slug portion', () => {
    expect(createChapterArchiveName(6, 'Hello World!')).toBe('chapter-0006-hello-world.xhtml')
  })

  it('pads order to four digits', () => {
    expect(createChapterArchiveName(42, 'Answer')).toBe('chapter-0042-answer.xhtml')
    expect(createChapterArchiveName(1000, 'Milestone')).toBe('chapter-1000-milestone.xhtml')
  })
})

describe('createMediaArchiveName', () => {
  it('combines id and sanitized filename with extension', () => {
    expect(createMediaArchiveName('media-123', 'cover.png')).toBe('media-123-cover.png')
  })

  it('derives extension from mimeType when filename lacks one', () => {
    expect(createMediaArchiveName('media-456', 'cover', 'image/jpeg')).toBe('media-456-cover.jpg')
  })

  it('sanitizes unsafe characters in the filename base', () => {
    expect(createMediaArchiveName('media-789', 'hello@world.gif')).toBe('media-789-hello-world.gif')
  })

  it('prefers the mimeType extension when it conflicts with the source filename', () => {
    expect(createMediaArchiveName('media-999', 'cover.jpg', 'image/webp')).toBe(
      'media-999-cover.webp',
    )
  })

  it('returns only id and safe base when extension is unknown', () => {
    expect(createMediaArchiveName('media-000', 'asset', 'application/octet-stream')).toBe(
      'media-000-asset',
    )
  })
})

describe('splitEpubHref', () => {
  it('splits path and fragment', () => {
    expect(splitEpubHref('../Text/ch2.xhtml#s3')).toEqual({
      path: '../Text/ch2.xhtml',
      fragment: 's3',
    })
  })

  it('handles fragment-only hrefs', () => {
    expect(splitEpubHref('#s3')).toEqual({ path: '', fragment: 's3' })
  })

  it('handles hrefs with no fragment', () => {
    expect(splitEpubHref('../Text/ch2.xhtml')).toEqual({
      path: '../Text/ch2.xhtml',
      fragment: '',
    })
  })

  it('handles empty string', () => {
    expect(splitEpubHref('')).toEqual({ path: '', fragment: '' })
  })
})

describe('normalizeEpubPath', () => {
  it('strips leading ./', () => {
    expect(normalizeEpubPath('./chapter02.xhtml')).toBe('chapter02.xhtml')
  })

  it('strips leading ../', () => {
    expect(normalizeEpubPath('../Text/chapter02.xhtml')).toBe('text/chapter02.xhtml')
  })

  it('strips query parameters', () => {
    expect(normalizeEpubPath('../Text/chapter02.xhtml?foo=1#bar')).toBe('text/chapter02.xhtml')
  })

  it('lowercases the result', () => {
    expect(normalizeEpubPath('OEBPS/Text/Chapter02.xhtml')).toBe('oebps/text/chapter02.xhtml')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeEpubPath('')).toBe('')
  })
})

describe('spineHrefFromSourceKey', () => {
  it('extracts the spine href from a well-formed chapterSourceKey', () => {
    expect(spineHrefFromSourceKey('toc-1::OEBPS/Text/chapter02.xhtml::3')).toBe(
      'OEBPS/Text/chapter02.xhtml',
    )
  })

  it('returns null for malformed keys', () => {
    expect(spineHrefFromSourceKey('invalid-key')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(spineHrefFromSourceKey('')).toBeNull()
  })
})

describe('resolveEpubHrefToArchivePath', () => {
  const chapters: ExportChapterIndexEntry[] = [
    {
      id: 'ch-1',
      order: 1,
      title: 'Introduction',
      slug: 'introduction',
      chapterSourceKey: 'toc-1::OEBPS/Text/introduction.xhtml::1',
    },
    {
      id: 'ch-2',
      order: 2,
      title: 'The Forest',
      slug: 'the-forest',
      chapterSourceKey: 'toc-2::OEBPS/Text/chapter02.xhtml::2',
    },
    {
      id: 'ch-3',
      order: 3,
      title: 'Deep Dive',
      slug: 'deep-dive',
      chapterSourceKey: 'toc-3::OEBPS/Text/deep-dive.xhtml::3',
    },
  ]

  const archivePathByChapterId = new Map<string, string>([
    ['ch-1', 'chapter-0001-introduction.xhtml'],
    ['ch-2', 'chapter-0002-the-forest.xhtml'],
    ['ch-3', 'chapter-0003-deep-dive.xhtml'],
  ])

  it('resolves a chapter by full normalized path match', () => {
    const result = resolveEpubHrefToArchivePath(
      '../Text/chapter02.xhtml#s3',
      chapters,
      archivePathByChapterId,
    )
    expect(result).toBe('chapter-0002-the-forest.xhtml#s3')
  })

  it('resolves a chapter by basename fallback', () => {
    const result = resolveEpubHrefToArchivePath(
      'chapter02.xhtml',
      chapters,
      archivePathByChapterId,
    )
    expect(result).toBe('chapter-0002-the-forest.xhtml')
  })

  it('preserves fragment when present', () => {
    const result = resolveEpubHrefToArchivePath(
      'deep-dive.xhtml#section-4',
      chapters,
      archivePathByChapterId,
    )
    expect(result).toBe('chapter-0003-deep-dive.xhtml#section-4')
  })

  it('omits fragment when absent', () => {
    const result = resolveEpubHrefToArchivePath(
      'introduction.xhtml',
      chapters,
      archivePathByChapterId,
    )
    expect(result).toBe('chapter-0001-introduction.xhtml')
  })

  it('handles in-page fragment-only hrefs', () => {
    const result = resolveEpubHrefToArchivePath('#note-1', chapters, archivePathByChapterId)
    expect(result).toBe('#note-1')
  })

  it('returns null for an unresolved href', () => {
    const result = resolveEpubHrefToArchivePath(
      'nonexistent.xhtml',
      chapters,
      archivePathByChapterId,
    )
    expect(result).toBeNull()
  })

  it('returns null when a matched chapter has no archive path mapping', () => {
    const incompleteMap = new Map<string, string>([['ch-1', 'chapter-0001-introduction.xhtml']])
    const result = resolveEpubHrefToArchivePath(
      'chapter02.xhtml',
      chapters,
      incompleteMap,
    )
    expect(result).toBeNull()
  })

  it('skips chapters with no chapterSourceKey', () => {
    const sparseChapters: ExportChapterIndexEntry[] = [
      {
        id: 'ch-1',
        order: 1,
        title: 'Introduction',
        slug: 'introduction',
        chapterSourceKey: null,
      },
      {
        id: 'ch-2',
        order: 2,
        title: 'The Forest',
        slug: 'the-forest',
        chapterSourceKey: 'toc-2::OEBPS/Text/chapter02.xhtml::2',
      },
    ]
    const result = resolveEpubHrefToArchivePath(
      'chapter02.xhtml',
      sparseChapters,
      new Map([['ch-2', 'chapter-0002-the-forest.xhtml']]),
    )
    expect(result).toBe('chapter-0002-the-forest.xhtml')
  })
})
