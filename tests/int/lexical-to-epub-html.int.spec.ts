import { describe, expect, it, vi } from 'vitest'

import {
  lexicalToEpubHtml,
  type EpubImageRef,
  type LexicalToEpubHtmlOptions,
} from '@/utils/lexicalToEpubHtml'

const createEditorState = (...children: Array<Record<string, unknown>>) => ({
  root: {
    type: 'root',
    children,
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

const makeOptions = (overrides?: {
  resolveImage?: (uploadId: string) => EpubImageRef | null
  resolveInternalHref?: (epubHref: string) => string | null
  onWarning?: LexicalToEpubHtmlOptions['onWarning']
}): LexicalToEpubHtmlOptions => ({
  resolveImage: overrides?.resolveImage ?? (() => null),
  resolveInternalHref: overrides?.resolveInternalHref ?? (() => null),
  onWarning: overrides?.onWarning,
})

describe('lexicalToEpubHtml', () => {
  /* ---------------------------------------------------------------- */
  /*  Basic block nodes                                                */
  /* ---------------------------------------------------------------- */

  it('serializes a paragraph', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', version: 1, text: 'Hello world', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<p>Hello world</p>')
  })

  it('serializes an empty paragraph', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<p></p>')
  })

  it('serializes a heading with its tag', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h3',
      children: [{ type: 'text', version: 1, text: 'Section', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h3>Section</h3>')
  })

  it('preserves heading id from top-level id field', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h2',
      id: 'intro',
      children: [{ type: 'text', version: 1, text: 'Introduction', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2 id="intro">Introduction</h2>')
  })

  it('preserves heading id from fields.anchorIds when top-level id is absent', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h2',
      fields: { anchorIds: ['main-heading', 'alias-1'] },
      children: [{ type: 'text', version: 1, text: 'Main', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2 id="main-heading">Main</h2>')
  })

  it('prefers top-level id over fields.anchorIds', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h2',
      id: 'top-id',
      fields: { anchorIds: ['field-id'] },
      children: [{ type: 'text', version: 1, text: 'Text', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2 id="top-id">Text</h2>')
  })

  it('does not emit data-anchor-ids attribute', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h2',
      fields: { anchorIds: ['a', 'b', 'c'] },
      children: [{ type: 'text', version: 1, text: 'Text', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).not.toContain('data-anchor-ids')
  })

  it('serializes ordered and unordered lists', () => {
    const state = createEditorState({
      type: 'list',
      version: 1,
      tag: 'ol',
      listType: 'number',
      children: [
        {
          type: 'listitem',
          version: 1,
          value: 1,
          children: [{ type: 'text', version: 1, text: 'First', format: 0 }],
        },
        {
          type: 'listitem',
          version: 1,
          value: 2,
          children: [{ type: 'text', version: 1, text: 'Second', format: 0 }],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<ol><li>First</li><li>Second</li></ol>')
  })

  it('normalizes checklist items to plain list items', () => {
    const state = createEditorState({
      type: 'list',
      version: 1,
      tag: 'ul',
      listType: 'bullet',
      children: [
        {
          type: 'listitem',
          version: 1,
          value: 1,
          checked: true,
          children: [{ type: 'text', version: 1, text: 'Done', format: 0 }],
        },
        {
          type: 'listitem',
          version: 1,
          value: 2,
          checked: false,
          children: [{ type: 'text', version: 1, text: 'Not done', format: 0 }],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<ul><li>Done</li><li>Not done</li></ul>')
    expect(html).not.toContain('checked')
    expect(html).not.toContain('input')
  })

  it('serializes a blockquote', () => {
    const state = createEditorState({
      type: 'quote',
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: 'Quoted', format: 0 }],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<blockquote><p>Quoted</p></blockquote>')
  })

  /* ---------------------------------------------------------------- */
  /*  Inline formatting                                                */
  /* ---------------------------------------------------------------- */

  it('preserves bold, italic, underline, strike, code, sub, sup', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [
        { type: 'text', version: 1, text: 'bold', format: 1 },
        { type: 'text', version: 1, text: 'italic', format: 2 },
        { type: 'text', version: 1, text: 'strike', format: 4 },
        { type: 'text', version: 1, text: 'underline', format: 8 },
        { type: 'text', version: 1, text: 'code', format: 16 },
        { type: 'text', version: 1, text: 'sub', format: 32 },
        { type: 'text', version: 1, text: 'sup', format: 64 },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<s>strike</s>')
    expect(html).toContain('<u>underline</u>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<sub>sub</sub>')
    expect(html).toContain('<sup>sup</sup>')
  })

  it('escapes special characters in text', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', version: 1, text: 'A < B & C > D', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<p>A &lt; B &amp; C &gt; D</p>')
  })

  it('escapes quotes in text', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', version: 1, text: "It's", format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<p>It&apos;s</p>')
  })

  /* ---------------------------------------------------------------- */
  /*  Link nodes                                                       */
  /* ---------------------------------------------------------------- */

  it('serializes external links without target attribute', () => {
    const state = createEditorState({
      type: 'link',
      version: 3,
      fields: { url: 'https://example.com', newTab: true },
      children: [{ type: 'text', version: 1, text: 'Click here', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<a href="https://example.com">Click here</a>')
    expect(html).not.toContain('target=')
  })

  it('escapes unsafe characters in link href', () => {
    const state = createEditorState({
      type: 'link',
      version: 3,
      fields: { url: 'https://example.com?a=1&b=2' },
      children: [{ type: 'text', version: 1, text: 'Link', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('href="https://example.com?a=1&amp;b=2"')
  })

  /* ---------------------------------------------------------------- */
  /*  Table nodes                                                      */
  /* ---------------------------------------------------------------- */

  it('serializes tables with header and data cells', () => {
    const state = createEditorState({
      type: 'table',
      version: 1,
      children: [
        {
          type: 'tablerow',
          version: 1,
          children: [
            {
              type: 'tablecell',
              version: 1,
              headerState: 1,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [{ type: 'text', version: 1, text: 'Header', format: 0 }],
                },
              ],
            },
            {
              type: 'tablecell',
              version: 1,
              headerState: 0,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [{ type: 'text', version: 1, text: 'Data', format: 0 }],
                },
              ],
            },
          ],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe(
      '<table><tr><th><p>Header</p></th><td><p>Data</p></td></tr></table>',
    )
  })

  it('emits colspan when greater than 1', () => {
    const state = createEditorState({
      type: 'table',
      version: 1,
      children: [
        {
          type: 'tablerow',
          version: 1,
          children: [
            {
              type: 'tablecell',
              version: 1,
              headerState: 0,
              colSpan: 3,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [{ type: 'text', version: 1, text: 'Wide', format: 0 }],
                },
              ],
            },
          ],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('colspan="3"')
    expect(html).not.toContain('rowspan=')
  })

  it('emits rowspan when greater than 1', () => {
    const state = createEditorState({
      type: 'table',
      version: 1,
      children: [
        {
          type: 'tablerow',
          version: 1,
          children: [
            {
              type: 'tablecell',
              version: 1,
              headerState: 0,
              rowSpan: 2,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [{ type: 'text', version: 1, text: 'Tall', format: 0 }],
                },
              ],
            },
          ],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('rowspan="2"')
    expect(html).not.toContain('colspan=')
  })

  it('emits both colspan and rowspan when present', () => {
    const state = createEditorState({
      type: 'table',
      version: 1,
      children: [
        {
          type: 'tablerow',
          version: 1,
          children: [
            {
              type: 'tablecell',
              version: 1,
              headerState: 0,
              colSpan: 2,
              rowSpan: 3,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [{ type: 'text', version: 1, text: 'Big', format: 0 }],
                },
              ],
            },
          ],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('colspan="2"')
    expect(html).toContain('rowspan="3"')
  })

  /* ---------------------------------------------------------------- */
  /*  Code block                                                       */
  /* ---------------------------------------------------------------- */

  it('serializes a code block with language class', () => {
    const state = createEditorState({
      type: 'block',
      version: 2,
      fields: { blockType: 'Code', code: 'const x = 1;', language: 'typescript' },
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe(
      '<pre><code class="language-typescript">const x = 1;</code></pre>',
    )
  })

  it('defaults code language to plaintext', () => {
    const state = createEditorState({
      type: 'block',
      version: 2,
      fields: { blockType: 'Code', code: 'hello' },
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('class="language-plaintext"')
  })

  it('escapes code content', () => {
    const state = createEditorState({
      type: 'block',
      version: 2,
      fields: { blockType: 'Code', code: '<script>alert("xss")</script>' },
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  /* ---------------------------------------------------------------- */
  /*  Footnote ref / block                                             */
  /* ---------------------------------------------------------------- */

  it('serializes footnote ref with matching target id', () => {
    const state = createEditorState({
      type: 'footnote-ref',
      version: 1,
      fields: { marker: '1', noteId: 'note-1' },
      children: [],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe(
      '<sup><a href="#fn-note-1" epub:type="noteref">1</a></sup>',
    )
  })

  it('serializes footnote block with matching id', () => {
    const state = createEditorState({
      type: 'block',
      version: 2,
      fields: { blockType: 'Footnote', noteId: 'note-1', marker: '1', content: 'First note.' },
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe(
      '<aside id="fn-note-1" epub:type="footnote"><p><sup>1</sup> First note.</p></aside>',
    )
  })

  /* ---------------------------------------------------------------- */
  /*  Callout                                                          */
  /* ---------------------------------------------------------------- */

  it('serializes callout variants with stable classes', () => {
    const variants = ['note', 'tip', 'warning', 'important']
    for (const variant of variants) {
      const state = createEditorState({
        type: 'epub-callout',
        version: 1,
        fields: { variant },
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [{ type: 'text', version: 1, text: 'Message', format: 0 }],
          },
        ],
      })
      const html = lexicalToEpubHtml(state as never, makeOptions())
      expect(html).toBe(
        `<aside class="callout callout--${variant}"><p>Message</p></aside>`,
      )
    }
  })

  it('defaults callout variant to note', () => {
    const state = createEditorState({
      type: 'epub-callout',
      version: 1,
      fields: {},
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: 'Message', format: 0 }],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('callout--note')
  })

  /* ---------------------------------------------------------------- */
  /*  Internal links                                                   */
  /* ---------------------------------------------------------------- */

  it('resolves fragment-only epub-internal-link to local anchor', () => {
    const state = createEditorState({
      type: 'epub-internal-link',
      version: 1,
      fields: { epubHref: '#s3' },
      children: [{ type: 'text', version: 1, text: 'Section 3', format: 0 }],
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({
        resolveInternalHref: (href) => href,
      }),
    )
    expect(html).toBe('<a href="#s3">Section 3</a>')
  })

  it('resolves cross-chapter epub-internal-link through callback', () => {
    const state = createEditorState({
      type: 'epub-internal-link',
      version: 1,
      fields: { epubHref: '../Text/chapter02.xhtml#s3' },
      children: [{ type: 'text', version: 1, text: 'Chapter 2', format: 0 }],
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({
        resolveInternalHref: () => 'chapter-0002-the-forest.xhtml#s3',
      }),
    )
    expect(html).toBe('<a href="chapter-0002-the-forest.xhtml#s3">Chapter 2</a>')
  })

  it('emits plain span fallback and warning for unresolved internal link', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'epub-internal-link',
      version: 1,
      fields: { epubHref: 'unknown.xhtml' },
      children: [{ type: 'text', version: 1, text: 'Missing', format: 0 }],
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<span>Missing</span>')
    expect(warn).toHaveBeenCalledWith('Unresolved epub-internal-link: unknown.xhtml')
  })

  it('warns and falls back for empty epubHref', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'epub-internal-link',
      version: 1,
      fields: { epubHref: '' },
      children: [{ type: 'text', version: 1, text: 'Empty', format: 0 }],
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<span>Empty</span>')
    expect(warn).toHaveBeenCalledWith(
      'epub-internal-link node has empty epubHref; falling back to plain text.',
    )
  })

  /* ---------------------------------------------------------------- */
  /*  Upload nodes                                                     */
  /* ---------------------------------------------------------------- */

  it('emits archive-local image path for resolved upload', () => {
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: 42,
      fields: { alt: 'Cover image' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({
        resolveImage: () => ({ id: 'media-42', archivePath: 'media-42-cover.png', alt: 'Cover' }),
      }),
    )
    expect(html).toBe(
      '<img src="../images/media-42-cover.png" alt="Cover image" />',
    )
  })

  it('uses imageRef.alt when node alt is empty', () => {
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: { id: 99 },
      fields: { alt: '' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({
        resolveImage: () => ({ id: 'media-99', archivePath: 'media-99.png', alt: 'Fallback' }),
      }),
    )
    expect(html).toBe(
      '<img src="../images/media-99.png" alt="Fallback" />',
    )
  })

  it('emits visible fallback and warning for unresolved upload', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: 42,
      fields: { alt: 'Missing image' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<p>[Image: Missing image]</p>')
    expect(warn).toHaveBeenCalledWith('Unresolved upload node: 42')
  })

  /* ---------------------------------------------------------------- */
  /*  YouTube                                                          */
  /* ---------------------------------------------------------------- */

  it('degrades YouTube node to a plain external link', () => {
    const state = createEditorState({
      type: 'youtube',
      version: 1,
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe(
      '<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Watch on YouTube</a></p>',
    )
  })

  it('builds YouTube URL from videoId when url is absent', () => {
    const state = createEditorState({
      type: 'youtube',
      version: 1,
      videoId: 'abc123',
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc123"')
  })

  it('warns and emits empty paragraph for YouTube node without URL or videoId', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'youtube',
      version: 1,
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<p></p>')
    expect(warn).toHaveBeenCalledWith('YouTube node has no URL; emitting empty paragraph.')
  })

  /* ---------------------------------------------------------------- */
  /*  Horizontal rule / line break                                     */
  /* ---------------------------------------------------------------- */

  it('serializes horizontal rule as XHTML self-closing tag', () => {
    const state = createEditorState({ type: 'horizontalrule', version: 1 })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<hr />')
  })

  it('serializes line break as XHTML self-closing tag', () => {
    const state = createEditorState({ type: 'linebreak', version: 1 })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<br />')
  })

  /* ---------------------------------------------------------------- */
  /*  Edge cases / error handling                                      */
  /* ---------------------------------------------------------------- */

  it('returns empty string for empty editor state', () => {
    const state = createEditorState()
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('')
  })

  it('returns empty string when root has no children', () => {
    const state = { root: { type: 'root', children: [] } }
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('')
  })

  it('warns for unknown block type', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'block',
      version: 2,
      fields: { blockType: 'UnknownWidget' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('')
    expect(warn).toHaveBeenCalledWith('Unknown block type: UnknownWidget')
  })

  it('warns for unknown node type', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'future-node',
      version: 1,
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('')
    expect(warn).toHaveBeenCalledWith('Unknown node type: future-node')
  })

  it('recursively serializes children for unknown node types that have children', () => {
    const state = createEditorState({
      type: 'future-container',
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text: 'Nested', format: 0 }],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<p>Nested</p>')
  })

  it('filters out null children without crashing', () => {
    const state = createEditorState(
      {
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'text', version: 1, text: 'A', format: 0 },
          null as unknown as never,
          { type: 'text', version: 1, text: 'B', format: 0 },
        ],
      },
      {
        type: 'list',
        version: 1,
        tag: 'ul',
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 1,
            children: [
              { type: 'text', version: 1, text: 'Item', format: 0 },
              null as unknown as never,
            ],
          },
          null as unknown as never,
        ],
      },
    )
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('<p>AB</p>')
    expect(html).toContain('<ul><li>Item</li></ul>')
  })

  it('handles deeply nested inline formatting', () => {
    const state = createEditorState({
      type: 'paragraph',
      version: 1,
      children: [
        { type: 'text', version: 1, text: 'bold-italic', format: 1 | 2 },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    // wrapWithInlineTags wraps bold first, then italic: <em><strong>text</strong></em>
    expect(html).toBe('<p><em><strong>bold-italic</strong></em></p>')
  })

  it('defaults heading tag to h2 when missing', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      children: [{ type: 'text', version: 1, text: 'Title', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2>Title</h2>')
  })

  it('defaults heading tag to h2 when empty string', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: '',
      children: [{ type: 'text', version: 1, text: 'Title', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2>Title</h2>')
  })

  it('does not emit id when anchorIds array is empty', () => {
    const state = createEditorState({
      type: 'heading',
      version: 1,
      tag: 'h2',
      fields: { anchorIds: [] },
      children: [{ type: 'text', version: 1, text: 'Title', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<h2>Title</h2>')
  })

  it('resolves upload node with string value id', () => {
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: 'media-abc',
      fields: { alt: 'Alt text' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({
        resolveImage: () => ({ id: 'media-abc', archivePath: 'media-abc.png', alt: 'Image' }),
      }),
    )
    expect(html).toBe('<img src="../images/media-abc.png" alt="Alt text" />')
  })

  it('warns for upload node with object value missing id', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: { filename: 'x.png' },
      fields: { alt: 'Alt' },
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<p>[Image: Alt]</p>')
    expect(warn).toHaveBeenCalledWith('Unresolved upload node: no id')
  })

  it('degrades YouTube node using fields.videoId and fields.url', () => {
    const state = createEditorState({
      type: 'youtube',
      version: 1,
      fields: { videoId: 'abc123', url: 'https://www.youtube.com/watch?v=abc123' },
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc123"')
  })

  it('serializes nested lists', () => {
    const state = createEditorState({
      type: 'list',
      version: 1,
      tag: 'ul',
      listType: 'bullet',
      children: [
        {
          type: 'listitem',
          version: 1,
          value: 1,
          children: [
            { type: 'text', version: 1, text: 'Outer', format: 0 },
            {
              type: 'list',
              version: 1,
              tag: 'ul',
              listType: 'bullet',
              children: [
                {
                  type: 'listitem',
                  version: 1,
                  value: 1,
                  children: [{ type: 'text', version: 1, text: 'Inner', format: 0 }],
                },
              ],
            },
          ],
        },
      ],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<ul><li>Outer<ul><li>Inner</li></ul></li></ul>')
  })

  it('removes unsafe link protocols and warns', () => {
    const warn = vi.fn()
    const state = createEditorState({
      type: 'link',
      version: 3,
      fields: { url: 'javascript:alert(1)' },
      children: [{ type: 'text', version: 1, text: 'Bad', format: 0 }],
    })
    const html = lexicalToEpubHtml(
      state as never,
      makeOptions({ onWarning: warn }),
    )
    expect(html).toBe('<span>Bad</span>')
    expect(warn).toHaveBeenCalledWith('Unsafe link URL removed: javascript:alert(1)')
  })

  it('allows safe relative link paths', () => {
    const state = createEditorState({
      type: 'link',
      version: 3,
      fields: { url: '../Text/chapter02.xhtml' },
      children: [{ type: 'text', version: 1, text: 'Relative', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<a href="../Text/chapter02.xhtml">Relative</a>')
  })

  it('allows mailto links', () => {
    const state = createEditorState({
      type: 'link',
      version: 3,
      fields: { url: 'mailto:author@example.com' },
      children: [{ type: 'text', version: 1, text: 'Email', format: 0 }],
    })
    const html = lexicalToEpubHtml(state as never, makeOptions())
    expect(html).toBe('<a href="mailto:author@example.com">Email</a>')
  })
})
