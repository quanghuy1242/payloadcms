import { createNode, createServerFeature, convertLexicalNodesToHTML } from '@payloadcms/richtext-lexical'

import { EpubCalloutNode, type SerializedEpubCalloutNode } from './nodes/EpubCalloutNode'

const escapeAttributeValue = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const EpubCalloutFeature = createServerFeature({
  feature: {
    ClientFeature: '@/features/epub-callout/feature.client#EpubCalloutFeatureClient',
    nodes: [
      createNode({
        converters: {
          html: {
            converter: async ({
              converters,
              currentDepth,
              depth,
              draft,
              node,
              overrideAccess,
              parent,
              req,
              showHiddenFields,
            }) => {
              const serializedNode = node as SerializedEpubCalloutNode
              const variant = escapeAttributeValue(serializedNode.fields?.variant ?? 'note')

              const childrenHTML = await convertLexicalNodesToHTML({
                converters,
                currentDepth,
                depth,
                draft,
                lexicalNodes: serializedNode.children ?? [],
                overrideAccess,
                parent: {
                  ...serializedNode,
                  parent,
                },
                req,
                showHiddenFields,
              })

              return `<div class="epub-callout epub-callout--${variant}">${childrenHTML}</div>`
            },
            nodeTypes: [EpubCalloutNode.getType()],
          },
        },
        node: EpubCalloutNode,
      }),
    ],
  },
  key: 'epubCallout',
})
