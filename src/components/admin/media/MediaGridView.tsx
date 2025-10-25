'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useListQuery } from '@payloadcms/ui'

interface MediaDoc {
  id: string
  url?: string
  optimizedUrl?: string
  lowResUrl?: string
  alt?: string
  filename?: string
  mimeType?: string
  width?: number
  height?: number
  createdAt?: string
}

export const MediaGridView: React.FC = () => {
  const { data } = useListQuery()
  const isLoading = !data
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-id')
            if (id) {
              setVisibleItems((prev) => new Set(prev).add(id))
            }
          }
        })
      },
      {
        rootMargin: '50px', // Start loading slightly before items enter viewport
        threshold: 0.01,
      },
    )

    return () => {
      observerRef.current?.disconnect()
    }
  }, [])

  const itemRef = useCallback((node: HTMLDivElement | null) => {
    if (node && observerRef.current) {
      observerRef.current.observe(node)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="media-grid-loading">
        <p>Loading media...</p>
      </div>
    )
  }

  const docs = (data?.docs || []) as MediaDoc[]

  if (docs.length === 0) {
    return (
      <div className="media-grid-empty">
        <p>No media found</p>
      </div>
    )
  }

  return (
    <div className="media-grid-wrapper">
      <div className="media-grid">
        {docs.map((doc) => {
          const isVisible = visibleItems.has(doc.id)
          const thumbnailUrl = doc.optimizedUrl || doc.url
          const placeholderUrl = doc.lowResUrl

          return (
            <div key={doc.id} ref={itemRef} data-id={doc.id} className="media-grid-item">
              <a href={`/admin/collections/media/${doc.id}`} className="media-grid-link">
                <div className="media-grid-image-container">
                  {isVisible ? (
                    <>
                      {placeholderUrl && (
                        <img
                          src={placeholderUrl}
                          alt=""
                          className="media-grid-placeholder"
                          aria-hidden="true"
                        />
                      )}
                      <img
                        src={thumbnailUrl}
                        alt={doc.alt || doc.filename || 'Media'}
                        className="media-grid-image"
                        loading="lazy"
                        decoding="async"
                      />
                    </>
                  ) : (
                    <div className="media-grid-skeleton" />
                  )}
                </div>
                <div className="media-grid-info">
                  <p className="media-grid-alt" title={doc.alt}>
                    {doc.alt || doc.filename}
                  </p>
                  {doc.width && doc.height && (
                    <p className="media-grid-dimensions">
                      {doc.width} × {doc.height}
                    </p>
                  )}
                </div>
              </a>
            </div>
          )
        })}
      </div>

      <style jsx>{`
        .media-grid-wrapper {
          padding: 1rem;
          width: 100%;
        }

        .media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
          width: 100%;
        }

        /* Mobile: 2 columns */
        @media (max-width: 640px) {
          .media-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.75rem;
          }
          .media-grid-wrapper {
            padding: 0.75rem;
          }
        }

        /* Tablet: 3-4 columns */
        @media (min-width: 641px) and (max-width: 1024px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          }
        }

        /* Desktop: 4-6 columns */
        @media (min-width: 1025px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          }
        }

        /* Large desktop: more columns */
        @media (min-width: 1600px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }

        .media-grid-item {
          position: relative;
          background: var(--theme-elevation-50);
          border-radius: 8px;
          overflow: hidden;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
          border: 1px solid var(--theme-elevation-150);
        }

        .media-grid-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          border-color: var(--theme-elevation-200);
        }

        .media-grid-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .media-grid-image-container {
          position: relative;
          width: 100%;
          padding-bottom: 75%; /* 4:3 aspect ratio */
          background: var(--theme-elevation-100);
          overflow: hidden;
        }

        .media-grid-skeleton {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            var(--theme-elevation-100) 0%,
            var(--theme-elevation-150) 50%,
            var(--theme-elevation-100) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        .media-grid-placeholder {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: blur(10px);
          transform: scale(1.1);
        }

        .media-grid-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: opacity 0.3s ease;
        }

        .media-grid-info {
          padding: 0.75rem;
          min-height: 4rem;
        }

        @media (max-width: 640px) {
          .media-grid-info {
            padding: 0.5rem;
            min-height: 3rem;
          }
        }

        .media-grid-alt {
          margin: 0 0 0.25rem 0;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--theme-elevation-900);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .media-grid-alt {
            font-size: 0.8125rem;
          }
        }

        .media-grid-dimensions {
          margin: 0;
          font-size: 0.75rem;
          color: var(--theme-elevation-600);
        }

        @media (max-width: 640px) {
          .media-grid-dimensions {
            font-size: 0.6875rem;
          }
        }

        .media-grid-loading,
        .media-grid-empty {
          padding: 2rem;
          text-align: center;
          color: var(--theme-elevation-600);
        }
      `}</style>
    </div>
  )
}

export default MediaGridView
