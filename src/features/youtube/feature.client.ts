'use client'

import type { ClientFeatureProviderMap } from '@payloadcms/richtext-lexical'

import {
  createClientFeature,
  toolbarAddDropdownGroupWithItems,
  slashMenuBasicGroupWithItems,
} from '@payloadcms/richtext-lexical/client'
import { $isNodeSelection } from '@payloadcms/richtext-lexical/lexical'

import { YouTubeNode, $isYouTubeNode } from './nodes/YouTubeNode'
import { YouTubePlugin, INSERT_YOUTUBE_COMMAND } from './plugin'
import { YouTubeIcon } from './icons/YouTubeIcon'

export const YouTubeFeatureClient = createClientFeature(({}) => {
  return {
    nodes: [YouTubeNode],
    plugins: [
      {
        Component: YouTubePlugin,
        position: 'normal',
      },
    ],
    toolbarFixed: {
      groups: [
        toolbarAddDropdownGroupWithItems([
          {
            ChildComponent: YouTubeIcon,
            isActive: ({ selection }) => {
              if (!$isNodeSelection(selection) || !selection.getNodes().length) {
                return false
              }
              const firstNode = selection.getNodes()[0]
              return $isYouTubeNode(firstNode)
            },
            key: 'youtube',
            label: ({ i18n }) => {
              return i18n.t('lexical:youtube:label')
            },
            onSelect: ({ editor }) => {
              const url = prompt('Enter YouTube URL:')
              if (url) {
                editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { url })
              }
            },
            order: 20,
          },
        ]),
      ],
    },
    slashMenu: {
      groups: [
        slashMenuBasicGroupWithItems([
          {
            Icon: YouTubeIcon,
            key: 'youtube',
            keywords: ['youtube', 'video', 'embed', 'yt'],
            label: ({ i18n }) => {
              return i18n.t('lexical:youtube:label')
            },
            onSelect: ({ editor }) => {
              const url = prompt('Enter YouTube URL:')
              if (url) {
                editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { url })
              }
            },
          },
        ]),
      ],
    },
  }
})
