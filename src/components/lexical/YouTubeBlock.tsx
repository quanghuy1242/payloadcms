'use client'

import React from 'react'

interface YouTubeBlockProps {
  url: string
  title?: string
}

export const YouTubeBlock: React.FC<YouTubeBlockProps> = ({ url, title }) => {
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

  if (!videoId) {
    return (
      <div
        style={{
          padding: '1rem',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c33',
        }}
      >
        Invalid YouTube URL. Please provide a valid YouTube video link.
      </div>
    )
  }

  return (
    <div
      style={{
        margin: '1.5rem 0',
        width: '100%',
      }}
    >
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
    </div>
  )
}
