'use client'

import type { LexicalCommand } from '@payloadcms/richtext-lexical/lexical'
import type { PluginComponent } from '@payloadcms/richtext-lexical'

import {
  createCommand,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
} from '@payloadcms/richtext-lexical/lexical'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { $insertNodeToNearestRoot } from '@payloadcms/richtext-lexical/lexical/utils'
import { useEffect } from 'react'

import { $createYouTubeNode, extractYouTubeVideoId } from '../nodes/YouTubeNode'

export type InsertYouTubePayload = {
  url: string
}

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<InsertYouTubePayload> =
  createCommand('INSERT_YOUTUBE_COMMAND')

/**
 * Plugin that registers the command to insert YouTube nodes
 */
export const YouTubePlugin: PluginComponent = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      INSERT_YOUTUBE_COMMAND,
      (payload: InsertYouTubePayload) => {
        const { url } = payload
        const videoId = extractYouTubeVideoId(url)

        if (!videoId) {
          // Invalid YouTube URL
          return false
        }

        const selection = $getSelection()

        if (!$isRangeSelection(selection)) {
          return false
        }

        const focusNode = selection.focus.getNode()

        if (focusNode !== null) {
          const youtubeNode = $createYouTubeNode(videoId, url)
          $insertNodeToNearestRoot(youtubeNode)
        }

        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])

  return null
}
