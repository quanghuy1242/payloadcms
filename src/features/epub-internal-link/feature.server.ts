import { createNode, createServerFeature, convertLexicalNodesToHTML } from '@payloadcms/richtext-lexical'

import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'

const escapeAttributeValue = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// The importer preserves EPUB internal links as sentinel nodes here;
// the blog/frontend renderer still needs to resolve them to chapter URLs later.
export const EpubInternalLinkFeature = createServerFeature({
  feature: {
    ClientFeature: '@/features/epub-internal-link/feature.client#EpubInternalLinkFeatureClient',
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
              const childrenHTML = await convertLexicalNodesToHTML({
                converters,
                currentDepth,
                depth,
                draft,
                lexicalNodes: node.children,
                overrideAccess,
                parent: {
                  ...node,
                  parent,
                },
                req,
                showHiddenFields,
              })

              return `<span data-epub-href="${escapeAttributeValue(node.fields.epubHref)}">${childrenHTML}</span>`
            },
            nodeTypes: [EpubInternalLinkNode.getType()],
          },
        },
        node: EpubInternalLinkNode,
      }),
    ],
  },
  key: 'epubInternalLink',
})