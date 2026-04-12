import { readFile } from 'node:fs/promises'
import path from 'node:path'

import ePub, { type Book } from 'epubjs'
import { afterEach, describe, expect, it } from 'vitest'

import { convertHtmlToChapterLexicalState } from '@/utils/epubLexical'
import {
  buildChapterSourceKey,
  buildStableHash,
  buildStableBinaryHash,
  createImportedBookSlug,
  createImportedBookTitle,
  createStableMediaFilename,
  extractChapterTitle,
  deriveImageAltText,
  resolveEpubAssetPath,
  sanitizeChapterHTML,
  sanitizeURLAttributeValue,
} from '@/utils/epubImport'

const openedBooks: Book[] = []

afterEach(() => {
  for (const book of openedBooks.splice(0, openedBooks.length)) {
    book.destroy()
  }
})

const collectLexicalText = (node: unknown): string => {
  if (!node || typeof node !== 'object') {
    return ''
  }

  const typedNode = node as {
    children?: unknown[]
    text?: unknown
  }

  const ownText = typeof typedNode.text === 'string' ? typedNode.text : ''
  const childText = Array.isArray(typedNode.children)
    ? typedNode.children.map((child) => collectLexicalText(child)).join(' ')
    : ''

  return `${ownText} ${childText}`.replace(/\s+/g, ' ').trim()
}

const extractPlainText = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

type SpineItemLike = {
  index: number
  linear: boolean
}

describe('EPUB import utilities', () => {
  it('loads the sample EPUB fixture into Lexical editor state', async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'data/The_Wild_Robot_Escapes_vi_book.epub',
    )
    const fixtureBuffer = await readFile(fixturePath)
    const fixtureBase64 = fixtureBuffer.toString('base64')

    const book = ePub({ replacements: 'none' })
    const bookWithReplacementHook = book as unknown as {
      replacements: () => Promise<void>
    }

    bookWithReplacementHook.replacements = async () => {
      return undefined
    }
    openedBooks.push(book)

    await book.open(fixtureBase64, 'base64')
    await book.ready

    const metadata = await book.loaded.metadata
    const spine = (await book.loaded.spine) as unknown as {
      spineItems: SpineItemLike[]
    }
    const spineItems = spine.spineItems.filter((spineItem: SpineItemLike) => spineItem.linear)

    expect(metadata.title).toBeTruthy()
    expect(spineItems.length).toBeGreaterThan(0)

    let selectedChapter: {
      chapterHtml: string
      chapterTitle: string
      lexicalState: ReturnType<typeof convertHtmlToChapterLexicalState>
      plainText: string
    } | null = null

    for (const [spineIndex, spineItem] of spineItems.entries()) {
      const section = book.section(spineItem.index)

      try {
        await Promise.resolve(section.load(book.load.bind(book)))

        const renderedSection = await Promise.resolve(section.render(book.load.bind(book)))
        const chapterHtml =
          typeof renderedSection === 'string' && renderedSection.length > 0
            ? renderedSection
            : section.document?.documentElement?.outerHTML ?? ''

        if (!chapterHtml) {
          continue
        }

        const sanitized = sanitizeChapterHTML(chapterHtml)
        const plainText = extractPlainText(sanitized.html)

        if (plainText.length < 200) {
          continue
        }

        const chapterTitle = extractChapterTitle(sanitized.html, metadata.title, spineIndex + 1)
        const lexicalState = convertHtmlToChapterLexicalState(sanitized.html)

        selectedChapter = {
          chapterHtml: sanitized.html,
          chapterTitle,
          lexicalState,
          plainText,
        }

        break
      } finally {
        section.unload()
      }
    }

    expect(selectedChapter).not.toBeNull()

    const selected = selectedChapter as {
      chapterHtml: string
      chapterTitle: string
      lexicalState: ReturnType<typeof convertHtmlToChapterLexicalState>
      plainText: string
    }

    const lexicalText = collectLexicalText(selected.lexicalState.root)
    const normalizedPlainText = selected.plainText.replace(/\s+/g, '')
    const normalizedLexicalText = lexicalText.replace(/\s+/g, '')
    const excerpt = normalizedPlainText.slice(0, 80)

    expect(selected.chapterHtml).not.toContain('<script')
    expect(selected.chapterHtml).not.toContain('onclick=')
    expect(selected.lexicalState.root.children.length).toBeGreaterThan(0)
    expect(lexicalText.length).toBeGreaterThan(0)
    expect(normalizedLexicalText).toContain(excerpt)
    expect(selected.chapterTitle).toBeTruthy()
  })

  it('resolves chapter-relative image asset paths', () => {
    expect(resolveEpubAssetPath('OEBPS/ch01.xhtml', '../images/cover.png')).toBe('images/cover.png')
    expect(resolveEpubAssetPath('chapters/01.xhtml', './media/photo.jpg')).toBe(
      'chapters/media/photo.jpg',
    )
    expect(resolveEpubAssetPath('text/chapter.xhtml', '#anchor')).toBeNull()
  })

  it('sanitizes unsafe html tags, attributes, and URL protocols', () => {
    const rawHTML =
      '<div class="chapter-note" onclick="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">bad</a><img src="https://example.com/image.jpg" style="width:100px" /></div>'

    const sanitized = sanitizeChapterHTML(rawHTML)

    expect(sanitized.html).not.toContain('<script')
    expect(sanitized.html).not.toContain('onclick=')
    expect(sanitized.html).not.toContain('javascript:')
    expect(sanitized.html).toContain('class="chapter-note"')
    expect(sanitized.html).toContain('https://example.com/image.jpg')
    expect(sanitized.warnings.length).toBeGreaterThan(0)
  })

  it('keeps only allowed protocols for href and src attributes', () => {
    expect(sanitizeURLAttributeValue('https://payloadcms.com', 'href')).toBe(
      'https://payloadcms.com',
    )
    expect(sanitizeURLAttributeValue('/relative/path', 'src')).toBe('/relative/path')
    expect(sanitizeURLAttributeValue('javascript:alert(1)', 'href')).toBeNull()
    expect(sanitizeURLAttributeValue('data:text/html;base64,abcd', 'src')).toBeNull()
  })

  it('produces deterministic media filenames', () => {
    const first = createStableMediaFilename('images/cover.png', 'image/png', 0)
    const second = createStableMediaFilename('images/cover.png', 'image/png', 0)

    expect(first).toBe(second)
    expect(first.endsWith('.png')).toBe(true)
  })

  it('builds stable hashes and chapter source keys', () => {
    const firstHash = buildStableHash('chapter-one')
    const secondHash = buildStableHash('chapter-one')
    const differentHash = buildStableHash('chapter-two')

    expect(firstHash).toBe(secondHash)
    expect(firstHash).not.toBe(differentHash)
    expect(buildChapterSourceKey('OEBPS/text/ch01.xhtml?foo=1#frag', 'section-1', 4)).toBe(
      'section-1::OEBPS/text/ch01.xhtml::chapter-4',
    )
  })

  it('builds stable hashes from epub bytes', () => {
    const first = buildStableBinaryHash(new Uint8Array([1, 2, 3, 4]))
    const second = buildStableBinaryHash(new Uint8Array([1, 2, 3, 4]))
    const different = buildStableBinaryHash(new Uint8Array([4, 3, 2, 1]))

    expect(first).toBe(second)
    expect(first).not.toBe(different)
  })

  it('derives imported book titles and slugs', () => {
    expect(createImportedBookTitle('  The Wild Robot Escapes  ', 'fallback.epub')).toBe(
      'The Wild Robot Escapes',
    )
    expect(createImportedBookTitle('', 'fallback.epub')).toBe('fallback')
    expect(createImportedBookSlug('Mắt Biếc')).toBe('mat-biec')
  })

  it('derives image alt text from html attributes and chapter context', () => {
    const imageDocument = new DOMParser().parseFromString(
      '<img alt="Sunset over the city" title="Chapter image" />',
      'text/html',
    )
    const imageElement = imageDocument.querySelector('img')

    expect(imageElement).not.toBeNull()

    if (!imageElement) {
      return
    }

    expect(deriveImageAltText(imageElement, 'Chapter 7', 0)).toBe('Sunset over the city')

    imageElement.removeAttribute('alt')
    expect(deriveImageAltText(imageElement, 'Chapter 7', 0)).toBe('Chapter image')

    imageElement.removeAttribute('title')
    expect(deriveImageAltText(imageElement, 'Chapter 7', 0)).toBe('Image 1 from Chapter 7')
  })

  it('converts sanitized html to lexical editor state', () => {
    const editorState = convertHtmlToChapterLexicalState(
      '<h1>The Wild Robot Escapes</h1><p>Roz moved quietly.</p>',
    )

    expect(editorState.root.children.length).toBeGreaterThan(0)
  })

  it('drops unsupported relative links before lexical conversion', () => {
    const editorState = convertHtmlToChapterLexicalState(
      '<p><a href="../chapter-2.xhtml">Next chapter</a> and <a href="https://payloadcms.com">Payload</a></p>',
    )

    const lexicalText = collectLexicalText(editorState.root)

    expect(lexicalText).toContain('Next chapter')
    expect(lexicalText).toContain('Payload')
  })
})
