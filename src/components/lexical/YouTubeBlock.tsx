'use client'

import React from 'react'
import {
  BlockCollapsible,
  BlockEditButton,
  BlockRemoveButton,
} from '@payloadcms/richtext-lexical/client'

interface YouTubeBlockProps {
  formData: {
    url: string
    title?: string
  }
}

export const YouTubeBlock: React.FC<YouTubeBlockProps> = ({ formData }) => {
  const { url, title } = formData || {}

  // Extract video ID from various YouTube URL formats
  const getVideoId = (url: string): string | null => {
    if (!url) return null

    // Handle different YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    return null
  }

  const videoId = getVideoId(url)

  return (
    <BlockCollapsible>
      <div
        style={{
          margin: '0',
          width: '100%',
        }}
      >
        {!videoId ? (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '4px',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {url
                ? 'Invalid YouTube URL. Please edit and provide a valid YouTube video link.'
                : 'No URL provided. Click edit to add a YouTube video URL.'}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <BlockEditButton />
              <BlockRemoveButton />
            </div>
          </div>
        ) : (
          <>
            {title && (
              <h3
                style={{
                  marginBottom: '0.75rem',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                }}
              >
                {title}
              </h3>
            )}
            <div
              style={{
                position: 'relative',
                paddingBottom: '56.25%', // 16:9 aspect ratio
                height: 0,
                overflow: 'hidden',
                borderRadius: '8px',
                backgroundColor: '#000',
                marginBottom: '0.5rem',
              }}
            >
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title={title || 'YouTube video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <BlockEditButton />
              <BlockRemoveButton />
            </div>
          </>
        )}
      </div>
    </BlockCollapsible>
  )
}
