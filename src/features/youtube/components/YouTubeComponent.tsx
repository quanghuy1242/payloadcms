'use client'

import type { NodeKey } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

export interface YouTubeComponentProps {
  nodeKey: NodeKey
  videoId: string
  url: string
}

/**
 * React component that renders the YouTube embed in the editor
 */
export const YouTubeComponent: React.FC<YouTubeComponentProps> = ({ videoId }) => {
  console.log('YouTubeComponent rendering with videoId:', videoId)

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '800px',
        margin: '1em auto',
        border: '2px solid #e0e0e0',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', // 16:9 aspect ratio
        }}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={`YouTube video ${videoId}`}
        />
      </div>
    </div>
  )
}
