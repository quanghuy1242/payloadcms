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
        console.log('INSERT_YOUTUBE_COMMAND called with payload:', payload)

        const { url } = payload
        const videoId = extractYouTubeVideoId(url)

        console.log('Extracted videoId:', videoId)

        if (!videoId) {
          console.error('Invalid YouTube URL:', url)
          alert('Invalid YouTube URL. Please use a valid YouTube video URL.')
          return false
        }

        editor.update(() => {
          const selection = $getSelection()

          if (!$isRangeSelection(selection)) {
            console.error('No range selection available')
            return false
          }

          const focusNode = selection.focus.getNode()

          if (focusNode !== null) {
            const youtubeNode = $createYouTubeNode(videoId, url)
            $insertNodeToNearestRoot(youtubeNode)
            console.log('YouTube node inserted successfully')
          }
        })

        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])

  return null
}
