'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { FootnoteRefNode } from './nodes/FootnoteRefNode'

export const EpubFootnoteRefFeatureClient = createClientFeature({
  nodes: [FootnoteRefNode],
})