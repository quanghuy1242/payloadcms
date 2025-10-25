'use client'

import React from 'react'
import { useListQuery, useListDrawerContext } from '@payloadcms/ui'
import Link from 'next/link'

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
  const { isInDrawer, onSelect } = useListDrawerContext()

  if (!data?.docs || data.docs.length === 0) {
    return null
  }

  const docs = data.docs as MediaDoc[]

  // Handler for drawer mode selection
  const handleDrawerSelect = (doc: MediaDoc) => {
    if (isInDrawer && onSelect) {
      onSelect({
        collectionSlug: 'media',
        doc,
        docID: doc.id,
      })
    }
  }

  return (
    <>
      <div className="media-grid-wrapper">
        <div className="media-grid">
          {docs.map((doc) => {
            const thumbnailUrl = doc.optimizedUrl || doc.url
            const placeholderUrl = doc.lowResUrl

            const imageContent = (
              <>
                <div className="media-grid-image-container">
                  {placeholderUrl && (
                    <img
                      src={placeholderUrl}
                      alt=""
                      className="media-grid-placeholder"
                      aria-hidden="true"
                    />
                  )}
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={doc.alt || doc.filename || 'Media'}
                      className="media-grid-image"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="media-grid-no-image">No image URL</div>
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
              </>
            )

            return (
              <div key={doc.id} className="media-grid-item">
                {isInDrawer ? (
                  <button
                    type="button"
                    onClick={() => handleDrawerSelect(doc)}
                    className="media-grid-link media-grid-button"
                  >
                    {imageContent}
                  </button>
                ) : (
                  <Link href={`/admin/collections/media/${doc.id}`} className="media-grid-link">
                    {imageContent}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .media-grid-wrapper {
          padding: 1rem;
          width: 100%;
        }

        .media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
          width: 100%;
        }

        @media (max-width: 640px) {
          .media-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }
          .media-grid-wrapper {
            padding: 0.75rem;
          }
        }

        @media (min-width: 641px) and (max-width: 1024px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 1.25rem;
          }
        }

        @media (min-width: 1025px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
          }
        }

        @media (min-width: 1600px) {
          .media-grid {
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 2rem;
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

        .media-grid-button {
          width: 100%;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }

        .media-grid-image-container {
          position: relative;
          width: 100%;
          padding-bottom: 75%;
          background: var(--theme-elevation-100);
          overflow: hidden;
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
          z-index: 1;
        }

        .media-grid-image {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 2;
          background: var(--theme-elevation-100);
        }

        .media-grid-no-image {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.75rem;
          color: var(--theme-elevation-600);
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

        :global(.collection-list__tables) {
          display: none !important;
        }
      `}</style>
    </>
  )
}

export default MediaGridView
