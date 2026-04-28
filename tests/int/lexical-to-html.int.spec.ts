import { describe, expect, it } from 'vitest'

import { collectUploadIdsFromLexicalState, lexicalToHtml } from '@/utils/lexicalToHtml'

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

describe('lexicalToHtml', () => {
  it('serializes upload nodes with media URLs from the lookup map', () => {
    const state = createEditorState({
      type: 'upload',
      version: 3,
      relationTo: 'media',
      value: 42,
      fields: { alt: 'Cover image' },
    })

    const html = lexicalToHtml(state as never, {
      baseUrl: 'https://cms.quanghuy.dev',
      mediaById: new Map([
        [
          '42',
          {
            id: 42,
            url: '/media/cover.jpg',
          },
        ],
      ]),
    })

    expect(html).toContain('<img')
    expect(html).toContain('src="https://cms.quanghuy.dev/media/cover.jpg"')
    expect(html).toContain('alt="Cover image"')
  })

  it('serializes horizontal rule nodes', () => {
    const state = createEditorState({
      type: 'horizontalrule',
      version: 1,
    })

    expect(lexicalToHtml(state as never)).toContain('<hr />')
  })

  it('serializes YouTube nodes from the repo\'s top-level node shape', () => {
    const state = createEditorState({
      type: 'youtube',
      version: 1,
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })

    const html = lexicalToHtml(state as never)

    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"')
    expect(html).toContain('Watch on YouTube')
  })

  it('treats table cells with combined header flags as header cells', () => {
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
              headerState: 3,
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  children: [
                    {
                      type: 'text',
                      version: 1,
                      text: 'Header',
                      format: 0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(lexicalToHtml(state as never)).toContain('<th><p>Header</p></th>')
  })
})

describe('collectUploadIdsFromLexicalState', () => {
  it('collects upload ids recursively and deduplicates them', () => {
    const state = createEditorState(
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Intro',
            format: 0,
          },
        ],
      },
      {
        type: 'quote',
        version: 1,
        children: [
          {
            type: 'upload',
            version: 3,
            relationTo: 'media',
            value: { id: 42 },
            fields: { alt: 'Nested image' },
          },
          {
            type: 'upload',
            version: 3,
            relationTo: 'media',
            value: 42,
            fields: { alt: 'Duplicate image' },
          },
        ],
      },
    )

    expect(collectUploadIdsFromLexicalState(state as never)).toEqual(['42'])
  })
})
