import { createNode, createServerFeature, convertLexicalNodesToHTML } from '@payloadcms/richtext-lexical'

import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'

const escapeAttributeValue = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// The importer preserves EPUB internal links as sentinel nodes here.
//
// Frontend read-time resolution (preferred over a two-pass server PATCH):
//   Walk the Lexical tree and replace each `epub-internal-link` node at render time:
//   1. Normalize `fields.epubHref` to its spine-file component (strip the fragment).
//   2. Look it up against the pre-fetched chapter list matched by `chapterSourceKey`.
//   3. Render a Next.js <Link> to that chapter's URL, preserving the fragment as a hash.
//   4. If no matching chapter is found (e.g. appendix not imported), render children as
//      plain text — same fallback as today.
//
// This requires the chapter list to be co-fetched with the chapter page, but avoids
// the extra PATCH calls, idempotency concerns, and state-management complexity of the
// server-side T3-1 approach described in docs/book_clean_code.md.
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