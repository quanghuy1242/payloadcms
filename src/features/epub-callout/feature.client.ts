'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { EpubCalloutNode } from './nodes/EpubCalloutNode'

export const EpubCalloutFeatureClient = createClientFeature({
  nodes: [EpubCalloutNode],
})
