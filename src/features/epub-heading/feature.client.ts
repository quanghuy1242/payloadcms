'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { EpubHeadingNode } from './nodes/EpubHeadingNode'

export const EpubHeadingFeatureClient = createClientFeature({
  nodes: [EpubHeadingNode],
})
