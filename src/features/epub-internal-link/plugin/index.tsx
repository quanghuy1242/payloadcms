'use client'

import type { PluginComponent } from '@payloadcms/richtext-lexical'

import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

import { EpubInternalLinkNode } from '../nodes/EpubInternalLinkNode'

/**
 * Registers a mutation listener that adds a browser-native title tooltip to every
 * epub-internal-link span in the Lexical editor DOM, showing the raw epubHref on hover.
 */
export const EpubInternalLinkTooltipPlugin: PluginComponent = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerMutationListener(EpubInternalLinkNode, (mutations) => {
      mutations.forEach((mutation, key) => {
        if (mutation === 'created' || mutation === 'updated') {
          const element = editor.getElementByKey(key)
          if (element instanceof HTMLElement) {
            const href = element.getAttribute('data-epub-href') ?? ''
            element.setAttribute('title', `Unresolved EPUB link \u2192 ${href}`)
          }
        }
      })
    })
  }, [editor])

  return null
}
