import { createNode, createServerFeature } from '@payloadcms/richtext-lexical'

import { FootnoteRefNode, type SerializedFootnoteRefNode } from './nodes/FootnoteRefNode'

const escapeHtmlValue = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const EpubFootnoteRefFeature = createServerFeature({
  feature: {
    ClientFeature: '@/features/epub-footnote-ref/feature.client#EpubFootnoteRefFeatureClient',
    nodes: [
      createNode({
        node: FootnoteRefNode,
        converters: {
          html: {
            converter: async ({ node }) => {
              const serializedNode = node as SerializedFootnoteRefNode
              const marker = serializedNode.fields?.marker ?? ''
              const noteId = serializedNode.fields?.noteId ?? ''

              return `<sup class="epub-footnote-ref" data-note-id="${escapeHtmlValue(noteId)}">${escapeHtmlValue(marker)}</sup>`
            },
            nodeTypes: [FootnoteRefNode.getType()],
          },
        },
      }),
    ],
  },
  key: 'epubFootnoteRef',
})