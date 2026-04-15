import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import ePubRaw from 'epubjs'
import { JSDOM } from 'jsdom'

// CJS/ESM interop: under tsx ESM mode the default import is the module object;
// the actual callable constructor is at .default
const ePub: (...args: any[]) => any =
  typeof ePubRaw === 'function' ? (ePubRaw as any) : (ePubRaw as any).default

import { htmlToPayloadLexical, isSubstantiveChapterContent } from '../src/utils/epubLexical'
import {
  extractChapterTitle,
  resolveChapterTocMetadata,
  sanitizeChapterHTML,
} from '../src/utils/epubImport'

// jsdom setup — DOMParser must exist for htmlToPayloadLexical
const { window: jsdomWindow } = new JSDOM('')
Object.assign(global, {
  window: global, // lets window.URL resolve to Node's global URL
  DOMParser: jsdomWindow.DOMParser,
  Node: jsdomWindow.Node,
  Element: jsdomWindow.Element,
})
// Mock browser blob APIs needed by epubjs's archive internals
if (typeof URL.createObjectURL !== 'function') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: () => 'blob:probe-mock',
  })
}
if (typeof URL.revokeObjectURL !== 'function') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: () => undefined,
  })
}

const DEFAULT_EPUBS = [
  'data/Coraline (Neil G Gaiman) (Z-Library).epub',
  'data/The_Wild_Robot_Escapes_vi_book.epub',
  'data/Manning.Fast.Python.High.performance.techniques.for.large.datasets.1617297933.epub',
  "data/Disrupting the Game -- Reggie Fils-Aimé -- 1, 2022 -- HarperCollins Leadership -- 9781400226672 -- 5aea5b2983514cee72fd02de03337658 -- Anna\u2019s Archive.epub",
]

const SUPPORTED_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'heading',
  'quote',
  'list',
  'listitem',
  'link',
  'epub-internal-link',
  'table',
  'tablerow',
  'tablecell',
  'text',
  'linebreak',
])

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim()
}

const stripWhitespace = (value: string): string => {
  return value.replace(/\s+/g, '')
}

const collectHtmlText = (html: string): string => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return normalizeWhitespace(document.body.textContent ?? '')
}

const collectLexicalText = (node: any): string => {
  const parts: string[] = []

  const walk = (value: any) => {
    if (!value || typeof value !== 'object') {
      return
    }

    if (value.type === 'text' && typeof value.text === 'string') {
      parts.push(value.text)
      return
    }

    if (value.type === 'linebreak') {
      parts.push('\n')
      return
    }

    if (Array.isArray(value.children)) {
      for (const child of value.children) {
        walk(child)
      }
    }
  }

  walk(node?.root ?? node)
  const withoutImagePlaceholders = parts.join('').replace(
    /\[Image:[^\]]*(?: — ([^\]]*))?\]/g,
    (_match, caption: string | undefined) => {
      return caption ? ` ${caption} ` : ' '
    },
  )

  return normalizeWhitespace(withoutImagePlaceholders)
}

const countLexicalNodesOfType = (node: any, type: string): number => {
  let count = 0

  const walk = (value: any) => {
    if (!value || typeof value !== 'object') {
      return
    }

    if (value.type === type) {
      count += 1
    }

    if (Array.isArray(value.children)) {
      for (const child of value.children) {
        walk(child)
      }
    }

    if (value.root) {
      walk(value.root)
    }
  }

  walk(node?.root ?? node)
  return count
}

function validateLexicalState(state: any, expectedHtmlText: string): string[] {
  const issues: string[] = []
  if (!state?.root?.children?.length) {
    issues.push('empty root children')
  }

  function checkNode(node: any): void {
    if (!node || typeof node !== 'object') return

    if (typeof node.type === 'string' && !SUPPORTED_NODE_TYPES.has(node.type)) {
      issues.push(`unsupported node type: ${node.type}`)
    }

    if (node.type === 'link') {
      if (node.version !== 3) issues.push(`link node has version ${node.version} (expected 3)`)
      if (!node.fields?.linkType) issues.push('link node missing fields.linkType')
    }

    if (node.type === 'epub-internal-link') {
      if (typeof node.fields?.epubHref !== 'string' || node.fields.epubHref.length === 0) {
        issues.push('epub-internal-link node missing fields.epubHref')
      }
    }

    for (const [key, val] of Object.entries(node)) {
      if (typeof val === 'string' && val.includes('blob:')) {
        issues.push(`blob: URL found in node.${key}: ${val.slice(0, 60)}`)
      }
      if (Array.isArray(val)) {
        val.forEach(checkNode)
      }
    }
  }
  checkNode(state.root)

  const lexicalText = collectLexicalText(state)
  if (stripWhitespace(lexicalText) !== stripWhitespace(expectedHtmlText)) {
    issues.push(`text mismatch: expected "${expectedHtmlText}" but got "${lexicalText}"`)
  }

  return issues
}

type CliArgs = {
  epubPath: string | null
  chapterIndex: number | null
  outputMode: 'summary' | 'json'
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let epubPath: string | null = null
  let chapterIndex: number | null = null
  let outputMode: 'summary' | 'json' = 'summary'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--epub' && i + 1 < args.length) {
      epubPath = args[++i]
    } else if (args[i] === '--chapter' && i + 1 < args.length) {
      chapterIndex = parseInt(args[++i], 10)
    } else if (args[i] === '--output' && i + 1 < args.length) {
      const val = args[++i]
      if (val === 'json') outputMode = 'json'
    }
  }

  return { epubPath, chapterIndex, outputMode }
}

async function probeEpub(
  epubPath: string,
  opts: { chapterIndex: number | null; outputMode: 'summary' | 'json' },
): Promise<{ okCount: number; skipCount: number; issueCount: number }> {
  const absPath = path.resolve(process.cwd(), epubPath)
  console.log(`\n=== ${epubPath} ===`)

  const buffer = await readFile(absPath)
  const base64 = buffer.toString('base64')
  const book = ePub({ replacements: 'none' }) as any
  book.replacements = async () => undefined // bypass blob URL creation in Node.js
  await book.open(base64, 'base64')
  await book.ready

  const metadata = await book.loaded.metadata
  const packaging = book.packaging ?? {}
  const epubVersion = packaging.navPath ? '3' : '2'

  console.log(
    `  Metadata: title="${metadata.title ?? ''}", author="${metadata.creator ?? ''}", language="${metadata.language ?? ''}", publisher="${metadata.publisher ?? ''}", epubVersion="${epubVersion}"`,
  )

  const navigation = await book.loaded.navigation
  const tocItems = navigation.toc ?? []

  const spine = (await book.loaded.spine) as any
  const spineItems = (spine.spineItems as any[]).filter((item: any) => item.linear !== false)

  let okCount = 0
  let skipCount = 0
  let issueCount = 0

  for (const [index, item] of spineItems.entries()) {
    const chapterNum = index + 1
    if (opts.chapterIndex !== null && opts.chapterIndex !== chapterNum) continue

    const section = book.section(item.index) as any
    try {
      await section.load(book.load.bind(book))
      const html = section.document?.documentElement?.outerHTML ?? ''

      if (!html) {
        console.log(`  Chapter ${chapterNum}: SKIP (no HTML)`)
        skipCount++
        continue
      }

      const sanitized = sanitizeChapterHTML(html)
      const expectedHtmlText = collectHtmlText(sanitized.html)
      const tocMetadata = resolveChapterTocMetadata(tocItems, item.href ?? '')
      const defaultChapterTitle = `Chapter ${chapterNum}`
      const chapterTitle =
        tocMetadata?.title ?? extractChapterTitle(sanitized.html, defaultChapterTitle, chapterNum)
      const chapterLabel =
        chapterTitle === defaultChapterTitle ? `Chapter ${chapterNum}` : `Chapter ${chapterNum}: ${chapterTitle}`

      let state: any
      try {
        state = htmlToPayloadLexical(sanitized.html)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${chapterLabel}: ISSUES — conversion error: ${msg}`)
        issueCount++
        continue
      }

      if (!isSubstantiveChapterContent(state)) {
        console.log(`  ${chapterLabel}: SKIP (non-substantive)`)
        skipCount++
        continue
      }

      const issues = validateLexicalState(state, expectedHtmlText)
      if (issues.length === 0 && opts.outputMode === 'json') {
        console.log(`  ${chapterLabel}: LEXICAL JSON`)
        console.log(JSON.stringify(state, null, 2))
        okCount++
      } else if (issues.length === 0) {
        const warnNote =
          sanitized.warnings.length > 0 ? ` (${sanitized.warnings.length} sanitize warnings)` : ''
        const internalLinkCount = countLexicalNodesOfType(state, 'epub-internal-link')
        const externalLinkCount = countLexicalNodesOfType(state, 'link')
        const linkSummary =
          internalLinkCount > 0 || externalLinkCount > 0
            ? ` (${internalLinkCount} internal links, ${externalLinkCount} external links)`
            : ''
        console.log(`  ${chapterLabel}: OK${warnNote}${linkSummary}`)
        okCount++
      } else {
        console.log(`  ${chapterLabel}: ISSUES`)
        for (const issue of issues) {
          console.log(`    - ${issue}`)
        }
        issueCount++
      }
    } finally {
      section.unload()
    }
  }

  book.destroy()
  console.log(`  Summary: ${okCount} OK, ${skipCount} SKIP, ${issueCount} ISSUES`)
  return { okCount, skipCount, issueCount }
}

const main = async () => {
  const { epubPath, chapterIndex, outputMode } = parseArgs()
  const epubs = epubPath !== null ? [epubPath] : DEFAULT_EPUBS

  let totalOk = 0
  let totalSkip = 0
  let totalIssues = 0

  for (const epub of epubs) {
    const result = await probeEpub(epub, { chapterIndex, outputMode })
    totalOk += result.okCount
    totalSkip += result.skipCount
    totalIssues += result.issueCount
  }

  console.log(`\n=== TOTALS: ${totalOk} OK, ${totalSkip} SKIP, ${totalIssues} ISSUES ===`)

  if (totalIssues > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
