'use client'

import React from 'react'
import { useListQuery, useListDrawerContext, useSelection } from '@payloadcms/ui'
import Link from 'next/link'
import { CheckboxInput } from '@payloadcms/ui'

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
  const { selected, setSelection, count, totalDocs, toggleAll } = useSelection()

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
        {!isInDrawer && (
          <div className="media-grid-selection-controls">
            <span className="selection-status">
              {count > 0 ? `${count} of ${totalDocs} selected` : `${totalDocs} items`}
            </span>
            <div className="selection-buttons">
              <button
                type="button"
                className="selection-button"
                onClick={() => toggleAll(true)}
                disabled={count === totalDocs}
              >
                Select All
              </button>
              <button
                type="button"
                className="selection-button"
                onClick={() => toggleAll(false)}
                disabled={count === 0}
              >
                Deselect All
              </button>
            </div>
          </div>
        )}
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
                {/* Selection Checkbox - Only show when NOT in drawer mode */}
                {!isInDrawer && (
                  <div className="media-grid-checkbox">
                    <CheckboxInput
                      checked={Boolean(selected.get(doc.id))}
                      onToggle={() => setSelection(doc.id)}
                      aria-label={`Select ${doc.alt || doc.filename}`}
                    />
                  </div>
                )}

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

        .media-grid-selection-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
          background: var(--theme-elevation-50);
          border: 1px solid var(--theme-elevation-150);
          border-radius: 6px;
        }

        .selection-status {
          font-size: 0.875rem;
          color: var(--theme-elevation-700);
          font-weight: 500;
        }

        .selection-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .selection-button {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          background: var(--theme-elevation-100);
          color: var(--theme-elevation-900);
          border: 1px solid var(--theme-elevation-200);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .selection-button:hover:not(:disabled) {
          background: var(--theme-elevation-200);
          border-color: var(--theme-elevation-300);
        }

        .selection-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .media-grid-selection-controls {
            flex-direction: column;
            gap: 0.75rem;
            align-items: stretch;
          }

          .selection-status {
            text-align: center;
          }

          .selection-buttons {
            justify-content: center;
          }
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
          position: relative;
          z-index: 1;
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

        .media-grid-checkbox {
          position: absolute;
          top: 0.5rem;
          left: 0.5rem;
          z-index: 20;
          pointer-events: all;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 4px;
          padding: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
        }

        .media-grid-checkbox:hover {
          background: rgba(255, 255, 255, 1);
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
          transform: scale(1.05);
        }

        .media-grid-checkbox :global(.checkbox-input) {
          margin: 0 !important;
          cursor: pointer;
        }

        .media-grid-checkbox :global(label) {
          margin: 0 !important;
          padding: 0 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-height: unset !important;
        }

        .media-grid-checkbox :global(input[type='checkbox']) {
          cursor: pointer !important;
          width: 18px !important;
          height: 18px !important;
          margin: 0 !important;
        }

        .media-grid-checkbox :global(.checkbox-input__icon) {
          cursor: pointer !important;
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
