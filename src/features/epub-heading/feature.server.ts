import { createNode, createServerFeature } from '@payloadcms/richtext-lexical'

import { EpubHeadingNode } from './nodes/EpubHeadingNode'

export const EpubHeadingFeature = createServerFeature({
  dependencies: ['heading'],
  feature: {
    ClientFeature: '@/features/epub-heading/feature.client#EpubHeadingFeatureClient',
    nodes: [createNode({ node: EpubHeadingNode })],
  },
  key: 'epubHeading',
})
