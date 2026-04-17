'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'

import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'
import { EpubInternalLinkTooltipPlugin } from './plugin/index'

export const EpubInternalLinkFeatureClient = createClientFeature({
  nodes: [EpubInternalLinkNode],
  plugins: [
    {
      Component: EpubInternalLinkTooltipPlugin,
      position: 'normal',
    },
  ],
})