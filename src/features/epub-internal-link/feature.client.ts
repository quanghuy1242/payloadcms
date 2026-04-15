'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'

export const EpubInternalLinkFeatureClient = createClientFeature({
  nodes: [EpubInternalLinkNode],
})