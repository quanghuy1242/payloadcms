import { describe, expect, it } from 'vitest'

import { htmlToPayloadLexical, isSubstantiveChapterContent } from '@/utils/epubLexical'

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

  it('drops completely empty anchor <a class="calibre1"><span></span></a>', () => {
    const result = htmlToPayloadLexical('<p><a class="calibre1"><span></span></a>after</p>')
    expect(findNodes(result, 'link')).toHaveLength(0)
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'after')).toBe(true)
    expect(textNodes.every((n: any) => n.text !== '')).toBe(true)
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

  it('converts <pre> to code-formatted paragraph (format 16 on text)', () => {
    const result = htmlToPayloadLexical('<pre>code content</pre>')
    const textNodes = findNodes(result, 'text')
    expect(textNodes.some((n: any) => n.text === 'code content' && n.format === 16)).toBe(true)
  })

  it('strips anchor IDs from inside <pre> — Manning pattern', () => {
    const result = htmlToPayloadLexical('<pre><a id="L1"></a>const x = 1</pre>')
    const textNodes = findNodes(result, 'text')
    const combinedText = textNodes.map((n: any) => n.text).join('')
    expect(combinedText).toContain('const x = 1')
    expect(findNodes(result, 'link')).toHaveLength(0)
  })

  it('drops <hr> elements silently', () => {
    const result = htmlToPayloadLexical('<p>before</p><hr/><p>after</p>')
    expect(result.root.children).toHaveLength(2)
    expect(result.root.children.every((n: any) => n.type !== 'hr')).toBe(true)
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

  it('converts <aside> to a quote node', () => {
    const result = htmlToPayloadLexical('<aside><p>side note</p></aside>')
    const quotes = findNodes(result, 'quote')
    expect(quotes).toHaveLength(1)
  })

  it('converts nested lists recursively with depth indent', () => {
    const result = htmlToPayloadLexical('<ul><li>one<ul><li>two</li></ul></li></ul>')
    const lists = findNodes(result, 'list')
    expect(lists).toHaveLength(2)
    expect(lists.some((list: any) => list.indent === 1)).toBe(true)
  })

  it('preserves colspan and rowspan on table cells', () => {
    const result = htmlToPayloadLexical(
      '<table><tr><td colspan="2" rowspan="3">cell</td></tr></table>',
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

  it('treats list-only chapters as substantive', () => {
    const result = htmlToPayloadLexical('<ul><li>Step 1</li><li>Step 2</li></ul>')
    expect(isSubstantiveChapterContent(result)).toBe(true)
  })

  it('sets newTab when a link opens in a new window', () => {
    const result = htmlToPayloadLexical('<p><a href="https://example.com" target="_blank">click</a></p>')
    const links = findNodes(result, 'link')
    expect(links[0].fields.newTab).toBe(true)
  })

  // --- Tables ---

  it('converts basic <table><tr><td> to table/tablerow/tablecell nodes', () => {
    const result = htmlToPayloadLexical('<table><tr><td>cell</td></tr></table>')
    expect(findNodes(result, 'table')).toHaveLength(1)
    expect(findNodes(result, 'tablerow')).toHaveLength(1)
    expect(findNodes(result, 'tablecell')).toHaveLength(1)
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

  it('all block nodes have version 1, format "", indent 0, direction "ltr"', () => {
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
