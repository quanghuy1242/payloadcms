import { readFile } from 'node:fs/promises'
import path from 'node:path'

import ePub, { type Book } from 'epubjs'
import { afterEach, describe, expect, it } from 'vitest'

import {
  convertHtmlToChapterLexicalState,
  htmlToPayloadLexical,
  isSubstantiveChapterContent,
} from '@/utils/epubLexical'
import {
  createChapterBatches,
  buildChapterSourceKey,
  buildStableHash,
  buildStableBinaryHash,
  createImportedBookSlug,
  createImportedBookTitle,
  createImportedBookMediaAltText,
  createStableMediaFilename,
  extractChapterTitle,
  deriveImageAltText,
  estimateWordCountFromHTML,
  ensureSupportedMediaBlob,
  resolveChapterTocMetadata,
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
  href: string
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
    const navigation = await book.loaded.navigation
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

        const tocMetadata = resolveChapterTocMetadata(navigation.toc, spineItem.href)
        const chapterTitle =
          tocMetadata?.title ?? extractChapterTitle(sanitized.html, metadata.title, spineIndex + 1)
        const lexicalState = convertHtmlToChapterLexicalState(sanitized.html)

        if (!isSubstantiveChapterContent(lexicalState)) {
          continue
        }

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
    const first = createStableMediaFilename('images/cover.png', 'image/png', 0, 'book-hash-a')
    const second = createStableMediaFilename('images/cover.png', 'image/png', 0, 'book-hash-a')
    const third = createStableMediaFilename('images/cover.png', 'image/png', 0, 'book-hash-b')

    expect(first).toBe(second)
    expect(first).not.toBe(third)
    expect(first.endsWith('.png')).toBe(true)
  })

  it('prefixes imported book media alt text for filtering', () => {
    const altText = createImportedBookMediaAltText(
      'Fast Python',
      'book-hash-123',
      7,
      'Chapter art',
    )

    expect(altText).toBe('Image from book Fast Python - ID 7 - book-hash-123 - Chapter art')
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

  it('resolves inherited chapter titles from the sample EPUB toc', async () => {
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

    const spine = (await book.loaded.spine) as unknown as {
      spineItems: SpineItemLike[]
    }
    const navigation = await book.loaded.navigation
    const chapter = spine.spineItems.find((spineItem: SpineItemLike) => spineItem.index === 2)

    expect(chapter).toBeTruthy()

    if (!chapter) {
      return
    }

    const tocMetadata = resolveChapterTocMetadata(navigation.toc, chapter.href)

    expect(tocMetadata).toEqual({
      title: 'CHƯƠNG 1 > THÀNH PHỐ',
      href: 'text/ch001.xhtml#thành-phố',
      id: 'toc-li-2',
    })

    if (!tocMetadata) {
      throw new Error('Expected TOC metadata for the selected chapter')
    }

    expect(buildChapterSourceKey(tocMetadata.href, tocMetadata.id, chapter.index + 1)).toBe(
      'toc-li-2::text/ch001.xhtml::chapter-3',
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

  it('returns null when a media blob is missing', async () => {
    await expect(ensureSupportedMediaBlob(undefined)).resolves.toBeNull()
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

  it('estimates chapter word count from html text content', () => {
    expect(estimateWordCountFromHTML('<h1>Hello world</h1><p>Payload importer works</p>')).toBe(4)
    expect(estimateWordCountFromHTML('<div><span>   </span></div>')).toBe(0)
  })

  it('creates chapter batches by chapter and word thresholds', () => {
    const batches = createChapterBatches(
      [
        { chapterOrder: 1, wordCount: 1200 },
        { chapterOrder: 2, wordCount: 1600 },
        { chapterOrder: 3, wordCount: 2100 },
        { chapterOrder: 4, wordCount: 400 },
      ],
      2,
      3000,
    )

    expect(batches).toHaveLength(2)
    expect(batches[0]?.map((chapter) => chapter.chapterOrder)).toEqual([1, 2])
    expect(batches[1]?.map((chapter) => chapter.chapterOrder)).toEqual([3, 4])
  })
})

type LexicalNodeLike = {
  type?: string
  children?: LexicalNodeLike[]
  root?: LexicalNodeLike
  fields?: unknown
  version?: unknown
  [key: string]: unknown
}

function findAllNodesOfType(state: unknown, type: string): LexicalNodeLike[] {
  const results: LexicalNodeLike[] = []

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return

    const typedNode = node as LexicalNodeLike

    if (typedNode.type === type) results.push(typedNode)
    if (Array.isArray(typedNode.children)) typedNode.children.forEach(walk)
    if (typedNode.root) walk(typedNode.root)
  }

  walk(state)

  return results
}

describe('htmlToPayloadLexical with real EPUB fixtures', () => {
  const EPUB_FIXTURES = [
    {
      name: 'The Wild Robot Escapes (Vietnamese)',
      path: 'data/The_Wild_Robot_Escapes_vi_book.epub',
      expectedTextFragment: '',
    },
    {
      name: 'Coraline (Calibre fiction)',
      path: 'data/Coraline (Neil G Gaiman) (Z-Library).epub',
      expectedTextFragment: '',
    },
    {
      name: 'Fast Python (Manning technical)',
      path: 'data/Manning.Fast.Python.High.performance.techniques.for.large.datasets.1617297933.epub',
      expectedTextFragment: '',
    },
    {
      name: 'Disrupting the Game (EPUB3 non-fiction)',
      path: "data/Disrupting the Game -- Reggie Fils-Aimé -- 1, 2022 -- HarperCollins Leadership -- 9781400226672 -- 5aea5b2983514cee72fd02de03337658 -- Anna\u2019s Archive.epub",
      expectedTextFragment: '',
    },
  ]

  for (const fixture of EPUB_FIXTURES) {
    it(`produces at least one substantive chapter from ${fixture.name}`, async () => {
      const buffer = await readFile(fixture.path)
      const base64 = buffer.toString('base64')
      const book = ePub({ replacements: 'none' })
      await book.open(base64, 'base64')
      await book.ready

      const spine = (await book.loaded.spine) as unknown as {
        spineItems: SpineItemLike[]
      }
      const spineItems = spine.spineItems.filter((item) => item.linear !== false)

      expect(spineItems.length).toBeGreaterThan(0)

      let foundSubstantive = false
      for (const item of spineItems) {
        const section = book.section(item.index)
        try {
          await section.load(book.load.bind(book))
          const html = section.document?.documentElement?.outerHTML ?? ''
          if (!html) continue

          const sanitized = sanitizeChapterHTML(html)
          const lexical = htmlToPayloadLexical(sanitized.html)

          if (lexical.root.children.length > 0) {
            const json = JSON.stringify(lexical)
            expect(json).not.toContain('blob:')

            const links = findAllNodesOfType(lexical, 'link')
            for (const link of links) {
              expect(link.version).toBe(3)
              expect(link.fields).toBeDefined()
            }

            expect(lexical).toMatchSnapshot()

            foundSubstantive = true
            break
          }
        } finally {
          section.unload()
        }
      }

      book.destroy()
      expect(foundSubstantive).toBe(true)
    })
  }

  it('loads every Fast Python chapter image from the EPUB archive', async () => {
    const buffer = await readFile(
      'data/Manning.Fast.Python.High.performance.techniques.for.large.datasets.1617297933.epub',
    )
    const base64 = buffer.toString('base64')
    const book = ePub({ replacements: 'none' })

    await book.open(base64, 'base64')
    await book.ready

    const spine = (await book.loaded.spine) as unknown as {
      spineItems: SpineItemLike[]
    }

    for (const item of spine.spineItems.filter((spineItem) => spineItem.linear !== false)) {
      const section = book.section(item.index)

      try {
        await section.load(book.load.bind(book))
        const html = section.document?.documentElement?.outerHTML ?? ''

        if (!html) {
          continue
        }

        const document = new DOMParser().parseFromString(html, 'text/html')
        const imageElements = Array.from(
          document.querySelectorAll('img[src], image[href], image[xlink\\:href]'),
        )

        for (const imageElement of imageElements) {
          const imageSource =
            imageElement.getAttribute('src') ??
            imageElement.getAttribute('href') ??
            imageElement.getAttribute('xlink:href')

          if (!imageSource) {
            continue
          }

          const assetPath = resolveEpubAssetPath(item.href ?? '', imageSource)

          expect(
            assetPath,
            `Missing resolved path for chapter ${item.href} image source ${imageSource}`,
          ).toBeTruthy()

          if (!assetPath) {
            continue
          }

          const archiveCandidates = new Set<string>()

          const addArchiveCandidate = (candidate: string | null | undefined) => {
            if (!candidate) {
              return
            }

            const normalizedCandidate = candidate.replace(/^\/+/, '')
            archiveCandidates.add(normalizedCandidate)

            if (!/^(https?:\/\/|data:|blob:|\/\/)/i.test(normalizedCandidate)) {
              archiveCandidates.add(`/${normalizedCandidate}`)
            }
          }

          addArchiveCandidate(assetPath)
          addArchiveCandidate(book.resolve(assetPath, false))

          let blob: Blob | undefined

          for (const archiveCandidate of archiveCandidates) {
            blob = await book.archive.getBlob(archiveCandidate)

            if (blob) {
              break
            }

            try {
              const objectURL = await book.archive.createUrl(archiveCandidate, { base64: false })

              try {
                const response = await fetch(objectURL)

                if (response.ok) {
                  blob = await response.blob()
                  break
                }
              } finally {
                book.archive.revokeUrl(objectURL)
              }
            } catch {
              // Try the next candidate.
            }
          }

          expect(
            blob,
            `Missing blob for chapter ${item.href} image source ${imageSource} resolved as ${assetPath}`,
          ).toBeTruthy()
          expect(typeof blob?.type).toBe('string')
          expect(blob?.type.length).toBeGreaterThan(0)
        }
      } finally {
        section.unload()
      }
    }

    book.destroy()
  })
})
