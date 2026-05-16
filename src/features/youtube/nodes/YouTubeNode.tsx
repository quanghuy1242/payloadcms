import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from '@payloadcms/richtext-lexical/lexical'

import { $applyNodeReplacement, DecoratorNode } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

export type SerializedYouTubeNode = Spread<
  {
    videoId: string
    url: string
  },
  SerializedLexicalNode
>

// Lazy-import the React component
const YouTubeComponent = React.lazy(() =>
  import('../components/YouTubeComponent').then((module) => ({
    default: module.YouTubeComponent,
  })),
)

/**
 * Extracts YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/\s]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

/**
 * YouTubeNode is a DecoratorNode that renders a YouTube video embed
 */
export class YouTubeNode extends DecoratorNode<React.ReactElement> {
  __videoId: string
  __url: string

  static getType(): string {
    return 'youtube'
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__videoId, node.__url, node.__key)
  }

  constructor(videoId: string, url: string, key?: NodeKey) {
    super(key)
    this.__videoId = videoId
    this.__url = url
  }

  /**
   * Defines what happens when pasting a YouTube URL from external sources
   */
  static importDOM(): DOMConversionMap | null {
    return {
      iframe: (domNode: HTMLElement) => {
        const src = domNode.getAttribute('src')
        if (!src || !src.includes('youtube.com/embed/')) {
          return null
        }
        return {
          conversion: convertYouTubeElement,
          priority: 1,
        }
      },
    }
  }

  /**
   * Load node from saved JSON data
   */
  static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
    const { videoId, url } = serializedNode
    return $createYouTubeNode(videoId, url)
  }

  /**
   * Export node to JSON for database storage
   */
  exportJSON(): SerializedYouTubeNode {
    return {
      type: 'youtube',
      version: 1,
      videoId: this.__videoId,
      url: this.__url,
    }
  }

  /**
   * Create the DOM element in the editor
   */
  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.className = 'youtube-embed-container'
    div.style.width = '100%'
    div.style.display = 'block'
    div.style.margin = '1em 0'
    return div
  }

  /**
   * Update the DOM element (return false means no update needed)
   */
  updateDOM(): boolean {
    return false
  }

  /**
   * Export to HTML for rendering outside the editor
   */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.className = 'youtube-embed-container'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('width', '560')
    iframe.setAttribute('height', '315')
    iframe.setAttribute('src', `https://www.youtube.com/embed/${this.__videoId}`)
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    )
    iframe.setAttribute('allowfullscreen', 'true')

    element.appendChild(iframe)
    return { element }
  }

  /**
   * Render the React component inside the editor
   */
  decorate(): React.ReactElement {
    return (
      <React.Suspense
        fallback={
          <div style={{ padding: '1em', textAlign: 'center' }}>Loading YouTube video...</div>
        }
      >
        <YouTubeComponent nodeKey={this.__key} videoId={this.__videoId} url={this.__url} />
      </React.Suspense>
    )
  }

  /**
   * Get text content for accessibility/search
   */
  getTextContent(): string {
    return `YouTube video: ${this.__url}`
  }

  /**
   * Whether this is an inline or block element
   */
  isInline(): false {
    return false
  }

  /**
   * Whether this is top-level or can be nested
   */
  isTopLevel(): true {
    return true
  }

  // Getters for the video data
  getVideoId(): string {
    return this.__videoId
  }

  getUrl(): string {
    return this.__url
  }

  // Setters for updating the node
  setVideoId(videoId: string): void {
    const writable = this.getWritable()
    writable.__videoId = videoId
  }

  setUrl(url: string): void {
    const writable = this.getWritable()
    writable.__url = url
  }
}

/**
 * Convert pasted iframe elements to YouTubeNode
 */
function convertYouTubeElement(domNode: HTMLElement): DOMConversionOutput | null {
  const src = domNode.getAttribute('src')
  if (!src) {
    return null
  }

  const videoId = extractYouTubeVideoId(src)
  if (!videoId) {
    return null
  }

  const node = $createYouTubeNode(videoId, src)
  return { node }
}

/**
 * Utility function to create a new YouTubeNode
 */
export function $createYouTubeNode(videoId: string, url: string): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(videoId, url))
}

/**
 * Type guard to check if a node is a YouTubeNode
 */
export function $isYouTubeNode(node: LexicalNode | null | undefined): node is YouTubeNode {
  return node instanceof YouTubeNode
}
