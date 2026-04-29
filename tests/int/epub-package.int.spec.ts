import { describe, expect, it } from 'vitest'

import {
  buildChapterDocument,
  buildContainerXml,
  buildContentOpf,
  buildNavDocument,
  buildSharedStylesheet,
  buildTocNcx,
  sanitizeArchivePathSegment,
} from '@/utils/epubPackage'

describe('buildContainerXml', () => {
  it('points to OEBPS/content.opf', () => {
    const xml = buildContainerXml()
    expect(xml).toContain('full-path="OEBPS/content.opf"')
    expect(xml).toContain('media-type="application/oebps-package+xml"')
  })

  it('is valid XML', () => {
    const xml = buildContainerXml()
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<container version="1.0"')
  })
})

describe('buildSharedStylesheet', () => {
  it('includes callout variant classes', () => {
    const css = buildSharedStylesheet()
    expect(css).toContain('.callout--note')
    expect(css).toContain('.callout--tip')
    expect(css).toContain('.callout--warning')
    expect(css).toContain('.callout--important')
  })

  it('includes table styling', () => {
    const css = buildSharedStylesheet()
    expect(css).toContain('table {')
    expect(css).toContain('th, td {')
  })

  it('includes code block styling', () => {
    const css = buildSharedStylesheet()
    expect(css).toContain('pre {')
    expect(css).toContain('code {')
  })

  it('includes footnote styling', () => {
    const css = buildSharedStylesheet()
    expect(css).toContain('aside[epub\\:type="footnote"]')
  })
})

describe('buildChapterDocument', () => {
  it('wraps content in an XHTML document', () => {
    const doc = buildChapterDocument({
      title: 'Chapter One',
      content: '<p>Hello world</p>',
    })
    expect(doc).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(doc).toContain('<!DOCTYPE html>')
    expect(doc).toContain('<html xmlns="http://www.w3.org/1999/xhtml"')
  })

  it('includes a stylesheet reference', () => {
    const doc = buildChapterDocument({
      title: 'Chapter One',
      content: '<p>Hello</p>',
    })
    expect(doc).toContain('href="../styles/book.css"')
  })

  it('includes the chapter title', () => {
    const doc = buildChapterDocument({
      title: 'The Deep Woods',
      content: '<p>Hello</p>',
    })
    expect(doc).toContain('<title>The Deep Woods</title>')
  })

  it('places raw content inside the body', () => {
    const doc = buildChapterDocument({
      title: 'Test',
      content: '<p>Paragraph 1</p><p>Paragraph 2</p>',
    })
    expect(doc).toContain('<p>Paragraph 1</p><p>Paragraph 2</p>')
  })

  it('adds xml:lang and lang when language is provided', () => {
    const doc = buildChapterDocument({
      title: 'Test',
      content: '<p>Hello</p>',
      language: 'en',
    })
    expect(doc).toContain('xml:lang="en"')
    expect(doc).toContain('lang="en"')
  })

  it('omits language attributes when language is absent', () => {
    const doc = buildChapterDocument({
      title: 'Test',
      content: '<p>Hello</p>',
    })
    expect(doc).not.toContain('xml:lang=')
    expect(doc).not.toContain('lang=')
  })

  it('escapes special characters in the title', () => {
    const doc = buildChapterDocument({
      title: 'A < B & C > D',
      content: '<p>Hello</p>',
    })
    expect(doc).toContain('<title>A &lt; B &amp; C &gt; D</title>')
    expect(doc).not.toContain('<title>A < B')
  })

  it('escapes single quotes in the title', () => {
    const doc = buildChapterDocument({
      title: "It's a test",
      content: '<p>Hello</p>',
    })
    expect(doc).toContain('<title>It&apos;s a test</title>')
  })
})

describe('buildNavDocument', () => {
  const chapters = [
    { id: 'ch-1', order: 1, title: 'Introduction', href: 'chapters/chapter-0001-introduction.xhtml' },
    { id: 'ch-2', order: 2, title: 'The Forest', href: 'chapters/chapter-0002-the-forest.xhtml' },
  ]

  it('includes ordered links for each chapter', () => {
    const doc = buildNavDocument({ title: 'My Book', chapters })
    expect(doc).toContain('href="chapters/chapter-0001-introduction.xhtml"')
    expect(doc).toContain('Introduction')
    expect(doc).toContain('href="chapters/chapter-0002-the-forest.xhtml"')
    expect(doc).toContain('The Forest')
  })

  it('wraps links in an epub:type="toc" nav with doc-toc role', () => {
    const doc = buildNavDocument({ title: 'My Book', chapters })
    expect(doc).toContain('epub:type="toc"')
    expect(doc).toContain('role="doc-toc"')
    expect(doc).toContain('<nav')
  })

  it('includes the book title', () => {
    const doc = buildNavDocument({ title: 'Great Expectations', chapters })
    expect(doc).toContain('<title>Great Expectations</title>')
    expect(doc).toContain('<h1>Great Expectations</h1>')
  })

  it('includes a stylesheet reference', () => {
    const doc = buildNavDocument({ title: 'My Book', chapters })
    expect(doc).toContain('href="styles/book.css"')
  })

  it('adds language attributes when provided', () => {
    const doc = buildNavDocument({ title: 'My Book', chapters, language: 'vi' })
    expect(doc).toContain('xml:lang="vi"')
    expect(doc).toContain('lang="vi"')
  })

  it('handles empty chapter list', () => {
    const doc = buildNavDocument({ title: 'Empty Book', chapters: [] })
    expect(doc).toContain('<ol>')
    expect(doc).toContain('</ol>')
  })

  it('escapes special characters in chapter titles', () => {
    const doc = buildNavDocument({
      title: 'Book',
      chapters: [{ id: 'ch-1', order: 1, title: 'A & B', href: 'ch.xhtml' }],
    })
    expect(doc).toContain('A &amp; B')
  })

  it('escapes special characters in chapter hrefs', () => {
    const doc = buildNavDocument({
      title: 'Book',
      chapters: [{ id: 'ch-1', order: 1, title: 'Test', href: 'chapters/foo&bar.xhtml' }],
    })
    expect(doc).toContain('href="chapters/foo&amp;bar.xhtml"')
  })

  it('escapes special characters in the book title', () => {
    const doc = buildNavDocument({
      title: 'A < B & C > D',
      chapters: [{ id: 'ch-1', order: 1, title: 'Test', href: 'ch.xhtml' }],
    })
    expect(doc).toContain('<title>A &lt; B &amp; C &gt; D</title>')
    expect(doc).toContain('<h1>A &lt; B &amp; C &gt; D</h1>')
  })
})

describe('buildTocNcx', () => {
  const chapters = [
    { id: 'ch-1', order: 1, title: 'Introduction', href: 'chapters/chapter-0001.xhtml' },
    { id: 'ch-2', order: 2, title: 'The Forest', href: 'chapters/chapter-0002.xhtml' },
    { id: 'ch-3', order: 3, title: 'Deep Dive', href: 'chapters/chapter-0003.xhtml' },
  ]

  it('includes ordered navPoints', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'book-123' })
    expect(ncx).toContain('playOrder="1"')
    expect(ncx).toContain('playOrder="2"')
    expect(ncx).toContain('playOrder="3"')
  })

  it('includes chapter titles in navLabels', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'book-123' })
    expect(ncx).toContain('<text>Introduction</text>')
    expect(ncx).toContain('<text>The Forest</text>')
    expect(ncx).toContain('<text>Deep Dive</text>')
  })

  it('includes chapter hrefs in content src', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'book-123' })
    expect(ncx).toContain('src="chapters/chapter-0001.xhtml"')
    expect(ncx).toContain('src="chapters/chapter-0002.xhtml"')
  })

  it('includes the uid in dtb:uid meta', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'urn:isbn:9781234567890' })
    expect(ncx).toContain('name="dtb:uid"')
    expect(ncx).toContain('content="urn:isbn:9781234567890"')
  })

  it('includes the book title', () => {
    const ncx = buildTocNcx({ title: 'War and Peace', chapters, uid: 'book-123' })
    expect(ncx).toContain('<text>War and Peace</text>')
  })

  it('adds xml:lang when language is provided', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'book-123', language: 'fr' })
    expect(ncx).toContain('xml:lang="fr"')
  })

  it('omits xml:lang when language is absent', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters, uid: 'book-123' })
    expect(ncx).not.toContain('xml:lang=')
  })

  it('handles empty chapter list', () => {
    const ncx = buildTocNcx({ title: 'Empty Book', chapters: [], uid: 'empty' })
    expect(ncx).toContain('<navMap>')
    expect(ncx).toContain('</navMap>')
  })

  it('has an XML declaration and DOCTYPE', () => {
    const ncx = buildTocNcx({ title: 'My Book', chapters: [], uid: 'book-123' })
    expect(ncx).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(ncx).toContain('<!DOCTYPE ncx')
  })

  it('escapes special characters in chapter hrefs', () => {
    const ncx = buildTocNcx({
      title: 'Book',
      chapters: [{ id: 'ch-1', order: 1, title: 'Test', href: 'chapters/foo&bar.xhtml' }],
      uid: 'uid',
    })
    expect(ncx).toContain('src="chapters/foo&amp;bar.xhtml"')
  })

  it('escapes special characters in the book title', () => {
    const ncx = buildTocNcx({
      title: 'A < B & C > D',
      chapters: [],
      uid: 'uid',
    })
    expect(ncx).toContain('<text>A &lt; B &amp; C &gt; D</text>')
  })

  it('escapes special characters in chapter titles in navLabel', () => {
    const ncx = buildTocNcx({
      title: 'Book',
      chapters: [{ id: 'ch-1', order: 1, title: 'A < B & C > D', href: 'ch.xhtml' }],
      uid: 'uid',
    })
    expect(ncx).toContain('<text>A &lt; B &amp; C &gt; D</text>')
  })
})

describe('buildContentOpf', () => {
  const baseChapters = [
    { id: 'ch-1', order: 1, title: 'Introduction', href: 'chapters/chapter-0001.xhtml' },
    { id: 'ch-2', order: 2, title: 'The Forest', href: 'chapters/chapter-0002.xhtml' },
  ]

  const baseAssets = [
    { id: 'img-1', href: 'images/media-1-cover.png', mediaType: 'image/png' },
  ]

  it('includes manifest items for chapters', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: baseChapters,
      assets: [],
    })
    expect(opf).toContain('id="chapter-ch-1"')
    expect(opf).toContain('href="chapters/chapter-0001.xhtml"')
    expect(opf).toContain('id="chapter-ch-2"')
    expect(opf).toContain('href="chapters/chapter-0002.xhtml"')
  })

  it('includes spine items in order', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: baseChapters,
      assets: [],
    })
    // Spine should list chapters in order
    const spineStart = opf.indexOf('<spine')
    const spineEnd = opf.indexOf('</spine>')
    const spineSection = opf.slice(spineStart, spineEnd)
    expect(spineSection.indexOf('chapter-ch-1')).toBeLessThan(
      spineSection.indexOf('chapter-ch-2'),
    )
  })

  it('includes asset manifest items', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: baseAssets,
    })
    expect(opf).toContain('id="asset-img-1"')
    expect(opf).toContain('href="images/media-1-cover.png"')
    expect(opf).toContain('media-type="image/png"')
  })

  it('includes cover metadata and manifest entry when cover is present', () => {
    const cover = { id: 'cover-1', href: 'images/cover.jpg', mediaType: 'image/jpeg' }
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      cover,
    })
    expect(opf).toContain('name="cover" content="cover-image"')
    expect(opf).toContain('id="cover-image"')
    expect(opf).toContain('properties="cover-image"')
    expect(opf).toContain('href="images/cover.jpg"')
  })

  it('reuses the existing asset manifest item when the cover is already in assets', () => {
    const cover = { id: 'img-1', href: 'images/media-1-cover.png', mediaType: 'image/png' }
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: baseAssets,
      cover,
    })

    expect(opf).toContain('name="cover" content="asset-img-1"')
    expect(opf).toContain('id="asset-img-1" href="images/media-1-cover.png"')
    expect(opf).not.toContain('id="cover-image" href="images/media-1-cover.png"')
  })

  it('omits cover entries when cover is absent', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
    })
    expect(opf).not.toContain('cover-image')
    expect(opf).not.toContain('name="cover"')
  })

  it('includes required EPUB 3 nav and ncx items', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
    })
    expect(opf).toContain('id="nav"')
    expect(opf).toContain('properties="nav"')
    expect(opf).toContain('id="ncx"')
    expect(opf).toContain('toc="ncx"')
    expect(opf).toContain('id="css"')
  })

  it('includes nav in the spine', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: baseChapters,
      assets: [],
    })
    const spineStart = opf.indexOf('<spine')
    const spineEnd = opf.indexOf('</spine>')
    const spineSection = opf.slice(spineStart, spineEnd)
    expect(spineSection).toContain('idref="nav"')
  })

  it('includes metadata fields when provided', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      language: 'en',
      chapters: [],
      assets: [],
      author: 'Jane Doe',
      description: 'A great book',
      publisher: 'Acme Press',
      publicationDate: '2024-06-15',
      isbn: '9781234567890',
    })
    expect(opf).toContain('<dc:title>My Book</dc:title>')
    expect(opf).toContain('<dc:language>en</dc:language>')
    expect(opf).toContain('<dc:creator>Jane Doe</dc:creator>')
    expect(opf).toContain('<dc:description>A great book</dc:description>')
    expect(opf).toContain('<dc:publisher>Acme Press</dc:publisher>')
    expect(opf).toContain('<dc:date>2024-06-15</dc:date>')
    expect(opf).toContain('<dc:identifier id="isbn">9781234567890</dc:identifier>')
  })

  it('includes dcterms:modified from updatedAt', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      updatedAt: '2024-01-15T10:30:00.000Z',
    })
    expect(opf).toContain('<meta property="dcterms:modified">2024-01-15T10:30:00Z</meta>')
  })

  it('falls back dcterms:modified to publicationDate when updatedAt is absent', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      publicationDate: '2024-06-15T00:00:00Z',
    })
    expect(opf).toContain('<meta property="dcterms:modified">2024-06-15T00:00:00Z</meta>')
  })

  it('prefers updatedAt over publicationDate for dcterms:modified', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      updatedAt: '2024-12-25T12:00:00Z',
      publicationDate: '2024-06-15T00:00:00Z',
    })
    expect(opf).toContain('<meta property="dcterms:modified">2024-12-25T12:00:00Z</meta>')
    expect(opf).not.toContain('2024-06-15T00:00:00Z')
  })

  it('handles date-only publicationDate for dcterms:modified fallback without timezone drift', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      publicationDate: '2024-06-15',
    })
    expect(opf).toContain('<meta property="dcterms:modified">2024-06-15T00:00:00Z</meta>')
  })

  it('omits dcterms:modified for invalid date strings', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      updatedAt: 'not-a-date',
    })
    expect(opf).not.toContain('dcterms:modified')
  })

  it('omits dcterms:modified when no date is available', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
    })
    expect(opf).not.toContain('dcterms:modified')
  })

  it('formats dc:date as YYYY-MM-DD only', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      publicationDate: '2024-06-15T08:30:00.000Z',
    })
    expect(opf).toContain('<dc:date>2024-06-15</dc:date>')
    expect(opf).not.toContain('<dc:date>2024-06-15T')
  })

  it('formats dc:date from date-only string without timezone drift', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
      publicationDate: '2024-06-15',
    })
    expect(opf).toContain('<dc:date>2024-06-15</dc:date>')
  })

  it('omits optional metadata when values are absent', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
    })
    expect(opf).not.toContain('<dc:creator>')
    expect(opf).not.toContain('<dc:description>')
    expect(opf).not.toContain('<dc:publisher>')
    expect(opf).not.toContain('<dc:date>')
    // dc:language is required by EPUB 3.2, so it defaults to 'en' when absent.
    expect(opf).toContain('<dc:language>en</dc:language>')
  })

  it('escapes special characters in metadata', () => {
    const opf = buildContentOpf({
      title: 'A < B & C > D',
      uid: 'book-123',
      chapters: [],
      assets: [],
      author: 'Tom & Jerry',
    })
    expect(opf).toContain('<dc:title>A &lt; B &amp; C &gt; D</dc:title>')
    expect(opf).toContain('<dc:creator>Tom &amp; Jerry</dc:creator>')
  })

  it('sanitizes xml ids for chapters and assets with special characters', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [{ id: 'ch:1', order: 1, title: 'Test', href: 'ch.xhtml' }],
      assets: [{ id: 'img/1', href: 'img.png', mediaType: 'image/png' }],
    })
    expect(opf).toContain('id="chapter-ch_1"')
    expect(opf).toContain('id="asset-img_1"')
  })

  it('preserves asset properties in manifest', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [
        { id: 'a1', href: 'img.png', mediaType: 'image/png', properties: ['cover-image'] },
      ],
    })
    expect(opf).toContain('properties="cover-image"')
  })

  it('preserves multiple asset properties in manifest', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [
        { id: 'a1', href: 'img.png', mediaType: 'image/png', properties: ['cover-image', 'svg'] },
      ],
    })
    expect(opf).toContain('properties="cover-image svg"')
  })

  it('escapes special characters in chapter hrefs in manifest', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [{ id: 'ch-1', order: 1, title: 'Test', href: 'chapters/foo&bar.xhtml' }],
      assets: [],
    })
    expect(opf).toContain('href="chapters/foo&amp;bar.xhtml"')
  })

  it('produces an empty spine with only nav when there are no chapters', () => {
    const opf = buildContentOpf({
      title: 'My Book',
      uid: 'book-123',
      chapters: [],
      assets: [],
    })
    const spineStart = opf.indexOf('<spine')
    const spineEnd = opf.indexOf('</spine>')
    const spineSection = opf.slice(spineStart, spineEnd)
    expect(spineSection).toContain('idref="nav"')
    expect(spineSection).not.toContain('idref="chapter-')
  })
})

describe('sanitizeArchivePathSegment', () => {
  it('removes path separators', () => {
    expect(sanitizeArchivePathSegment('foo/bar')).toBe('foo-bar')
    expect(sanitizeArchivePathSegment('foo\\bar')).toBe('foo-bar')
  })

  it('removes leading dots', () => {
    expect(sanitizeArchivePathSegment('..hidden')).toBe('hidden')
    expect(sanitizeArchivePathSegment('.hidden')).toBe('hidden')
  })

  it('removes unsafe characters', () => {
    expect(sanitizeArchivePathSegment('file:name?')).toBe('file-name')
    expect(sanitizeArchivePathSegment('a<b>c')).toBe('a-b-c')
  })

  it('trims whitespace', () => {
    expect(sanitizeArchivePathSegment('  hello world  ')).toBe('hello-world')
  })

  it('collapses multiple dashes', () => {
    expect(sanitizeArchivePathSegment('a---b')).toBe('a-b')
  })

  it('removes leading and trailing dashes', () => {
    expect(sanitizeArchivePathSegment('-hello-')).toBe('hello')
  })

  it('returns empty string when all characters are stripped', () => {
    expect(sanitizeArchivePathSegment('.')).toBe('')
    expect(sanitizeArchivePathSegment('...')).toBe('')
  })
})
