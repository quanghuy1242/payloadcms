import { describe, expect, it } from 'vitest'
import { createHeadlessEditor } from '@lexical/headless'

import {
  collectFootnoteDefinitionsFromHTML,
  htmlToPayloadLexical,
  isSubstantiveChapterContent,
} from '@/utils/epubLexical'
import {
  $createEpubHeadingNode,
  EpubHeadingNode,
} from '@/features/epub-heading/nodes/EpubHeadingNode'

function findNodes(state: any, type: string): any[] {
  const results: any[] = []
  function walk(node: any): void {
    if (!node) return
    if (node.type === type) results.push(node)
    if (node.children) node.children.forEach(walk)
    if (node.root) walk(node.root)
  }
  walk(state)
  return results
}

describe('htmlToPayloadLexical', () => {
  // --- Basic structure ---

  it('produces a valid SerializedEditorState root', () => {
    const result = htmlToPayloadLexical('<p>hello</p>')
    expect(result.root).toBeDefined()
    expect(result.root.type).toBe('root')
    expect(result.root.version).toBe(1)
    expect(Array.isArray(result.root.children)).toBe(true)
  })

  it('converts a paragraph to a paragraph node', () => {
    const result = htmlToPayloadLexical('<p>hello</p>')
    const para = result.root.children[0] as any
    expect(para.type).toBe('paragraph')
  })

  it('always returns at least one child even for empty HTML', () => {
    const result = htmlToPayloadLexical('')
    expect(result.root.children.length).toBeGreaterThanOrEqual(1)
  })

  it('converts h1 to heading node with tag h1', () => {
    const result = htmlToPayloadLexical('<h1>Title</h1>')
    const heading = result.root.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h1')
  })

  it('converts h2, h3, h4 to heading nodes with matching tags', () => {
    const result = htmlToPayloadLexical('<h2>A</h2><h3>B</h3><h4>C</h4>')
    const [h2, h3, h4] = result.root.children as any[]
    expect(h2.type).toBe('heading')
    expect(h2.tag).toBe('h2')
    expect(h3.tag).toBe('h3')
    expect(h4.tag).toBe('h4')
  })

  it('downgrades h5 to h4 heading', () => {
    const result = htmlToPayloadLexical('<h5>Sub</h5>')
    const heading = result.root.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h4')
  })

  it('downgrades h6 to h4 heading', () => {
    const result = htmlToPayloadLexical('<h6>Sub</h6>')
    const heading = result.root.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h4')
  })

  it('preserves a semantic anchor id on a heading node', () => {
    const result = htmlToPayloadLexical(
      '<h2><a id="pgfId-1011875" class="calibre6"></a>8.1 Example Heading</h2>',
    )

    const heading = result.root.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h2')
    expect(heading.id).toBe('pgfId-1011875')
    expect(heading.fields?.anchorIds).toEqual(['pgfId-1011875'])
  })

  it('preserves multiple semantic anchor aliases on a heading node', () => {
    const result = htmlToPayloadLexical(
      '<h3><a id="pgfId-1012022"></a><a id="pgfId-1012138"></a>Alias Heading</h3>',
    )

    const heading = result.root.children[0] as any
    expect(heading.type).toBe('heading')
    expect(heading.tag).toBe('h3')
    expect(heading.id).toBe('pgfId-1012022')
    expect(heading.fields?.anchorIds).toEqual(['pgfId-1012022', 'pgfId-1012138'])
  })

  // --- Text formatting ---

  it('converts <strong> text to format bitmask 1 (bold)', () => {
    const result = htmlToPayloadLexical('<p><strong>bold</strong></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'bold' && n.format === 1)).toBe(true)
  })

  it('converts <em> text to format bitmask 2 (italic)', () => {
    const result = htmlToPayloadLexical('<p><em>italic</em></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'italic' && n.format === 2)).toBe(true)
  })

  it('combines <strong><em> to format bitmask 3 (bold+italic)', () => {
    const result = htmlToPayloadLexical('<p><strong><em>both</em></strong></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'both' && n.format === 3)).toBe(true)
  })

  it('converts <u> to format bitmask 8 (underline)', () => {
    const result = htmlToPayloadLexical('<p><u>underline</u></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'underline' && n.format === 8)).toBe(true)
  })

  it('converts <code> inside paragraph to format bitmask 16 (code)', () => {
    const result = htmlToPayloadLexical('<p><code>snippet</code></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'snippet' && n.format === 16)).toBe(true)
  })

  it('converts <sub> to format bitmask 32 (subscript)', () => {
    const result = htmlToPayloadLexical('<p>H<sub>2</sub>O</p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === '2' && n.format === 32)).toBe(true)
  })

  it('converts <sup> to format bitmask 64 (superscript)', () => {
    const result = htmlToPayloadLexical('<p>x<sup>2</sup></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === '2' && n.format === 64)).toBe(true)
  })

  it('detects italic from Calibre class name containing "italic"', () => {
    const result = htmlToPayloadLexical('<p><span class="calibre-italic">text</span></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'text' && (n.format & 2) !== 0)).toBe(true)
  })

  it('detects bold from Calibre class name containing "bold"', () => {
    const result = htmlToPayloadLexical('<p><span class="calibre-bold">text</span></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'text' && (n.format & 1) !== 0)).toBe(true)
  })

  // --- Links (critical) ---

  it('converts external <a href="https://..."> to Payload v3 link node with version 3', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com">click</a></p>')
    const para = result.root.children[0] as any
    const link = para.children.find((n: any) => n.type === 'link')
    expect(link).toBeDefined()
    expect(link.version).toBe(3)
    expect(link.fields).toBeDefined()
    expect(link.fields.linkType).toBe('custom')
    expect(link.fields.url).toBe('https://example.com')
    expect(link.fields.newTab).toBe(false)
  })

  it('sets fields.linkType = "custom" for external URLs', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com">click</a></p>')
    const links = findNodes(result, 'link')
    expect(links[0].fields.linkType).toBe('custom')
  })

  it('sets fields.newTab = false by default', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com">click</a></p>')
    const links = findNodes(result, 'link')
    expect(links[0].fields.newTab).toBe(false)
  })

  it('sets fields.url to the href value', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com">click</a></p>')
    const links = findNodes(result, 'link')
    expect(links[0].fields.url).toBe('https://example.com')
  })

  it('unwraps <a> with no href attribute — no link node created', () => {
    const result = htmlToPayloadLexical('<p><a>plain text</a></p>')
    expect(findNodes(result, 'link')).toHaveLength(0)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'plain text')).toBe(true)
  })

  it('unwraps <a id="anchor-id"> with no href — Manning pattern', () => {
    const result = htmlToPayloadLexical('<p><a id="anchor-id">Section Heading</a></p>')
    expect(findNodes(result, 'link')).toHaveLength(0)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'Section Heading')).toBe(true)
  })

  it('unwraps <a href="#fragment"> fragment-only links', () => {
    const result = htmlToPayloadLexical('<p><a href="#section1">jump</a></p>')
    expect(findNodes(result, 'link')).toHaveLength(0)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'jump')).toBe(true)
  })

  it('unwraps empty href anchors instead of creating epub-internal-link nodes', () => {
    const result = htmlToPayloadLexical('<p><a href="">blank link</a> after</p>')
    expect(findNodes(result, 'epub-internal-link')).toHaveLength(0)
    expect(findNodes(result, 'link')).toHaveLength(0)

    const textNodes = findNodes(result, 'text')
    const combinedText = textNodes.map((n: any) => n.text).join('')
    expect(combinedText).toContain('blank link')
    expect(combinedText).toContain('after')
  })

  it('drops completely empty anchor <a class="calibre1"><span></span></a>', () => {
    const result = htmlToPayloadLexical('<p><a class="calibre1"><span></span></a>after</p>')
    expect(findNodes(result, 'link')).toHaveLength(0)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'after')).toBe(true)
    expect(textNodes.every((n: any) => n.text !== '')).toBe(true)
  })

  it('round-trips EpubHeadingNode anchor ids through JSON serialization', () => {
    const editor = createHeadlessEditor({
      nodes: [EpubHeadingNode],
    })

    let exportedJson: any
    let importedJson: any

    editor.update(() => {
      const node = $createEpubHeadingNode('h4', ['pgfId-1', 'pgfId-2'])
      exportedJson = node.exportJSON() as any

      expect(exportedJson.type).toBe('heading')
      expect(exportedJson.tag).toBe('h4')
      expect(exportedJson.id).toBe('pgfId-1')
      expect(exportedJson.fields?.anchorIds).toEqual(['pgfId-1', 'pgfId-2'])

      importedJson = EpubHeadingNode.importJSON(exportedJson as any).exportJSON()
    })

    expect(importedJson).toEqual(exportedJson)
  })

  // --- Lists ---

  it('converts <ul> to bullet list node', () => {
    const result = htmlToPayloadLexical('<ul><li>item</li></ul>')
    const lists = findNodes(result, 'list')
    expect(lists).toHaveLength(1)
    expect(lists[0].listType).toBe('bullet')
    expect(lists[0].tag).toBe('ul')
  })

  it('converts <ol> to numbered list node', () => {
    const result = htmlToPayloadLexical('<ol><li>item</li></ol>')
    const lists = findNodes(result, 'list')
    expect(lists).toHaveLength(1)
    expect(lists[0].listType).toBe('number')
    expect(lists[0].tag).toBe('ol')
  })

  it('converts <li> items to listitem nodes with sequential value', () => {
    const result = htmlToPayloadLexical('<ul><li>one</li><li>two</li><li>three</li></ul>')
    const items = findNodes(result, 'listitem')
    expect(items).toHaveLength(3)
    expect(items[0].value).toBe(1)
    expect(items[1].value).toBe(2)
    expect(items[2].value).toBe(3)
  })

  it('unwraps <li> containing only a single <p> — Manning pattern', () => {
    const result = htmlToPayloadLexical('<ul><li><p>item text</p></li></ul>')
    const items = findNodes(result, 'listitem')
    expect(items).toHaveLength(1)
    // Children should be text nodes directly, NOT a nested paragraph
    const listitem = items[0]
    expect(listitem.children.some((n: any) => n.type === 'paragraph')).toBe(false)
    expect(listitem.children.some((n: any) => n.type === 'text')).toBe(true)
  })

  // --- Block elements ---

  it('converts <blockquote> to quote node', () => {
    const result = htmlToPayloadLexical('<blockquote><p>quoted text</p></blockquote>')
    const quotes = findNodes(result, 'quote')
    expect(quotes).toHaveLength(1)
  })

  it('converts <dl> with <dt>/<dd> pairs: dt → bold paragraph, dd → quote block', () => {
    const result = htmlToPayloadLexical(
      '<dl><dt>Term One</dt><dd>Definition one</dd><dt>Term Two</dt><dd>Definition two</dd></dl>',
    )
    // dd wraps its content in a paragraph inside the quote, so 2 bold dt paragraphs + 2 dd paragraphs
    const paragraphs = findNodes(result, 'paragraph')
    expect(paragraphs).toHaveLength(4)
    const boldParagraphs = paragraphs.filter((p: any) =>
      p.children.some((c: any) => c.format & 1),
    )
    expect(boldParagraphs).toHaveLength(2)
    expect(boldParagraphs[0].children[0].text).toBe('Term One')
    expect(boldParagraphs[1].children[0].text).toBe('Term Two')
    // dd → quote block
    const quotes = findNodes(result, 'quote')
    expect(quotes).toHaveLength(2)
  })

  it('converts <pre> to a code block node', () => {
    const result = htmlToPayloadLexical('<pre>code content</pre>')
    const blockNodes = findNodes(result, 'block')

    expect(blockNodes).toHaveLength(1)
    expect(blockNodes[0].fields.blockType).toBe('Code')
    expect(blockNodes[0].fields.language).toBe('plaintext')
    expect(blockNodes[0].fields.code).toBe('code content')
  })

  it('detects code block language from data-language and class names', () => {
    const result = htmlToPayloadLexical(
      '<pre data-language="python"><code class="language-python">print("hi")</code></pre>',
    )
    const blockNodes = findNodes(result, 'block')

    expect(blockNodes).toHaveLength(1)
    expect(blockNodes[0].fields.language).toBe('python')
  })

  it('strips anchor IDs from inside <pre> — Manning pattern', () => {
    const result = htmlToPayloadLexical('<pre><a id="L1"></a>const x = 1</pre>')
    const blockNodes = findNodes(result, 'block')

    expect(blockNodes).toHaveLength(1)
    expect(blockNodes[0].fields.code).toContain('const x = 1')
    expect(findNodes(result, 'link')).toHaveLength(0)
  })

  it('renders <hr> as an asterism paragraph', () => {
    const result = htmlToPayloadLexical('<p>before</p><hr/><p>after</p>')
    expect(result.root.children).toHaveLength(3)
    const separator = result.root.children[1] as any
    expect(separator.type).toBe('paragraph')
    expect(findNodes(result, 'text').some((node: any) => node.text === '* * *')).toBe(true)
  })

  it('drops <nav> elements (or their content)', () => {
    const result = htmlToPayloadLexical('<p>before</p><nav><h1>Contents</h1><ol><li>nav text</li></ol></nav><p>after</p>')
    expect(result.root.children).toHaveLength(2)
    expect(findNodes(result, 'heading')).toHaveLength(0)
    expect(findNodes(result, 'list')).toHaveLength(0)
  })

  it('drops whitespace-only <div> elements', () => {
    const result = htmlToPayloadLexical('<div>   </div><p>real content</p>')
    expect(result.root.children).toHaveLength(1)
    expect((result.root.children[0] as any).type).toBe('paragraph')
  })

  it('preserves meaningful spaces inside inline text', () => {
    const result = htmlToPayloadLexical('<p>Hello <strong>world</strong></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.map((node: any) => node.text).join('')).toBe('Hello world')
  })

  it('wraps top-level inline content in a paragraph', () => {
    const result = htmlToPayloadLexical('<span>text</span>')
    expect(result.root.children).toHaveLength(1)
    expect((result.root.children[0] as any).type).toBe('paragraph')
  })

  it('keeps sidebars as quote nodes', () => {
    const result = htmlToPayloadLexical('<aside epub:type="sidebar"><p>side note</p></aside>')
    const quotes = findNodes(result, 'quote')
    expect(quotes).toHaveLength(1)
  })

  it('converts footnote refs to footnote-ref nodes and appends footnote blocks', () => {
    const footnotesById = collectFootnoteDefinitionsFromHTML(
      '<aside epub:type="footnote" id="fn1"><p>Note text</p></aside>',
    )
    const result = htmlToPayloadLexical(
      '<p>See <a epub:type="noteref" href="#fn1">1</a> for details.</p>',
      { footnotesById },
    )

    const refs = findNodes(result, 'footnote-ref')
    const blocks = findNodes(result, 'block').filter(
      (node: any) => node.fields?.blockType === 'Footnote',
    )

    expect(refs).toHaveLength(1)
    expect(refs[0].fields.marker).toBe('1')
    expect(refs[0].fields.noteId).toBe('fn1')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].fields.noteId).toBe('fn1')
    expect(blocks[0].fields.marker).toBe('1')
    expect(blocks[0].fields.content).toBe('Note text')
  })

  it('converts nested lists recursively with depth indent', () => {
    const result = htmlToPayloadLexical('<ul><li>one<ul><li>two</li></ul></li></ul>')
    const lists = findNodes(result, 'list')
    expect(lists).toHaveLength(2)
    expect(lists.some((list: any) => list.indent === 1)).toBe(true)
  })

  it('converts definition lists: dt → bold paragraph, dd → quote block', () => {
    const result = htmlToPayloadLexical('<dl><dt>Term</dt><dd>Definition</dd></dl>')
    // dd wraps its content in a paragraph inside the quote: 1 bold dt paragraph + 1 dd paragraph
    const paragraphs = findNodes(result, 'paragraph')
    expect(paragraphs).toHaveLength(2)
    const boldParagraphs = paragraphs.filter((p: any) =>
      p.children.some((c: any) => c.format & 1),
    )
    expect(boldParagraphs).toHaveLength(1)
    expect(boldParagraphs[0].children[0].text).toBe('Term')
    const quotes = findNodes(result, 'quote')
    expect(quotes).toHaveLength(1)
    expect(findNodes(result, 'text').some((node: any) => node.text.includes('Definition'))).toBe(true)
  })

  it('preserves colspan and rowspan on table cells', () => {
    const result = htmlToPayloadLexical(
      '<table><tr><td colspan="2" rowspan="3">cell</td><td>other</td></tr></table>',
    )
    const cells = findNodes(result, 'tablecell')
    expect(cells[0].colSpan).toBe(2)
    expect(cells[0].rowSpan).toBe(3)
  })

  it('keeps image-only divs as placeholder paragraphs', () => {
    const result = htmlToPayloadLexical('<div><img src="https://example.com/x.jpg" alt="X" /></div>')
    expect(result.root.children).toHaveLength(1)
    const paragraph = result.root.children[0] as any
    expect(paragraph.type).toBe('paragraph')
    expect(findNodes(result, 'text').some((node: any) => node.text.includes('[Image: X]'))).toBe(true)
  })

  it('converts upload-tagged images to upload nodes', () => {
    const result = htmlToPayloadLexical(
      '<figure><img src="https://example.com/x.jpg" data-lexical-upload-id="78" data-lexical-upload-relation-to="media" alt="Image from book Gatsby Vĩ Đại - ID 1 - ca4c1cd2 - Image" /><figcaption>Caption</figcaption></figure>',
    )

    const uploads = findNodes(result, 'upload')
    expect(uploads).toHaveLength(1)
    expect(uploads[0].relationTo).toBe('media')
    expect(uploads[0].value).toBe(78)
    expect(uploads[0].fields.alt).toContain('Image from book Gatsby Vĩ Đại - ID 1 - ca4c1cd2')
  })

  it('treats list-only chapters as substantive', () => {
    const result = htmlToPayloadLexical('<ul><li>Step 1</li><li>Step 2</li></ul>')
    expect(isSubstantiveChapterContent(result)).toBe(true)
  })

  it('treats code-only chapters as substantive', () => {
    const result = htmlToPayloadLexical('<pre>print("hello")</pre>')
    expect(isSubstantiveChapterContent(result)).toBe(true)
  })

  it('treats upload-only chapters as substantive', () => {
    const result = htmlToPayloadLexical(
      '<img src="https://example.com/x.jpg" data-lexical-upload-id="78" data-lexical-upload-relation-to="media" alt="Image from book Gatsby Vĩ Đại - ID 1 - ca4c1cd2 - Image" />',
    )

    expect(isSubstantiveChapterContent(result)).toBe(true)
  })

  it('treats footnote refs as substantive', () => {
    const result = htmlToPayloadLexical('<p><a epub:type="noteref" href="#fn1">1</a></p>')

    expect(isSubstantiveChapterContent(result)).toBe(true)
  })

  it('sets newTab when a link opens in a new window', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com" target="_blank">click</a></p>')
    const links = findNodes(result, 'link')
    expect(links[0].fields.newTab).toBe(true)
  })

  // --- Tables ---

  it('converts basic <table><tr><td> to table/tablerow/tablecell nodes', () => {
    const result = htmlToPayloadLexical('<table><tr><td>cell 1</td><td>cell 2</td></tr></table>')
    expect(findNodes(result, 'table')).toHaveLength(1)
    expect(findNodes(result, 'tablerow')).toHaveLength(1)
    expect(findNodes(result, 'tablecell')).toHaveLength(2)
  })

  it('moves <caption> into a paragraph before the table', () => {
    const result = htmlToPayloadLexical(
      '<table><caption>Table title</caption><tr><td>cell 1</td><td>cell 2</td></tr></table>',
    )
    expect(result.root.children[0].type).toBe('paragraph')
    expect(findNodes(result, 'table')).toHaveLength(1)
    expect(findNodes(result, 'text').some((node: any) => node.text === 'Table title')).toBe(true)
  })

  it('unwraps layout tables with a single column', () => {
    const result = htmlToPayloadLexical('<table><tr><td>layout text</td></tr></table>')
    expect(findNodes(result, 'table')).toHaveLength(0)
    expect(findNodes(result, 'paragraph')).toHaveLength(1)
    expect(findNodes(result, 'text').some((node: any) => node.text.includes('layout text'))).toBe(true)
  })

  it('marks <th> cells with headerState 1', () => {
    const result = htmlToPayloadLexical(
      '<table><tr><th>header</th><td>data</td></tr></table>',
    )
    const cells = findNodes(result, 'tablecell')
    const headerCell = cells.find((n: any) => n.headerState === 1)
    const dataCell = cells.find((n: any) => n.headerState === 0)
    expect(headerCell).toBeDefined()
    expect(dataCell).toBeDefined()
  })

  // --- Key invariants ---

  it('all non-code block nodes have version 1, format "", indent 0, direction "ltr"', () => {
    const result = htmlToPayloadLexical(
      '<p>text</p><h1>heading</h1><ul><li>item</li></ul><blockquote><p>q</p></blockquote>',
    )
    const blockTypes = ['paragraph', 'heading', 'quote', 'list', 'listitem']
    const blocks = blockTypes.flatMap((t) => findNodes(result, t))
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block.version).toBe(1)
      expect(block.format).toBe('')
      expect(block.indent).toBe(0)
      expect(block.direction).toBe('ltr')
    }
  })

  it('all text nodes have version 1, mode "normal", style "", detail 0', () => {
    const result = htmlToPayloadLexical('<p>plain</p><p><strong>bold</strong></p>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.length).toBeGreaterThan(0)
    for (const node of textNodes) {
      expect(node.version).toBe(1)
      expect(node.mode).toBe('normal')
      expect(node.style).toBe('')
      expect(node.detail).toBe(0)
    }
  })

  it('does not produce blob: URLs in output', () => {
    const result = htmlToPayloadLexical(
      '<p><a href="blob:http://example.com/abc">media</a></p>',
    )
    expect(findNodes(result, 'link')).toHaveLength(0)
    expect(JSON.stringify(result)).not.toContain('blob:')
  })

  it('handles UTF-8 multibyte text correctly (Vietnamese)', () => {
    const text = 'Xin chào thế giới'
    const result = htmlToPayloadLexical(`<p>${text}</p>`)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === text)).toBe(true)
  })
})

describe('snapshots — regression gate', () => {
  it('paragraph with bold+italic text matches snapshot', () => {
    const result = htmlToPayloadLexical('<p><strong><em>emphasized</em></strong></p>')
    const para = (result.root as any).children[0]
    expect(para).toMatchSnapshot()
  })

  it('Payload v3 link node matches snapshot', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com">link text</a></p>')
    const para = (result.root as any).children[0]
    const link = para.children.find((n: any) => n.type === 'link')
    expect(link).toMatchSnapshot()
  })

  it('ordered list structure matches snapshot', () => {
    const result = htmlToPayloadLexical('<ol><li>First item</li><li>Second item</li></ol>')
    const list = (result.root as any).children[0]
    expect(list).toMatchSnapshot()
  })
})
