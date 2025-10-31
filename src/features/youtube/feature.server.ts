import { createServerFeature } from '@payloadcms/richtext-lexical'

import { YouTubeNode, type SerializedYouTubeNode } from './nodes/YouTubeNode'

export const YouTubeFeature = createServerFeature({
  feature: {
    ClientFeature: '@/features/youtube/feature.client#YouTubeFeatureClient',
    i18n: {
      en: {
        label: 'YouTube Video',
      },
    },
    nodes: [
      {
        node: YouTubeNode,
        // HTML conversion for headless rendering
        converters: {
          html: {
            converter: async ({ node }) => {
              const serializedNode = node as SerializedYouTubeNode
              const videoId = serializedNode.videoId
              return `<div class="youtube-embed-container">
  <iframe 
    width="560" 
    height="315" 
    src="https://www.youtube.com/embed/${videoId}" 
    frameborder="0" 
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
    allowfullscreen>
  </iframe>
</div>`
            },
            nodeTypes: [YouTubeNode.getType()],
          },
        },
      },
    ],
  },
  key: 'youtube',
})
