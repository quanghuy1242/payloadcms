'use client'

import { Button, useConfig } from '@payloadcms/ui'
import { useMemo } from 'react'
import { formatAdminURL } from 'payload/shared'

import EpubImporter from './EpubImporter'

const BOOKS_LIST_PATH = '/collections/books' as const

const BookImportPage = () => {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()

  const backURL = useMemo(() => {
    return formatAdminURL({
      adminRoute,
      path: BOOKS_LIST_PATH,
    })
  }, [adminRoute])

  return (
    <div className="books-import-page">
      <div className="books-import-page__header">
        <div>
          <h1 className="books-import-page__title">Import Books</h1>
          <p className="books-import-page__description">
            Upload an EPUB to create the book and its chapters.
          </p>
        </div>
        <Button buttonStyle="pill" el="link" size="small" to={backURL}>
          Back to Books
        </Button>
      </div>

      <EpubImporter />

      <style jsx>{`
        .books-import-page {
          display: grid;
          gap: 1rem;
          padding: 1rem 1rem 1.5rem;
        }

        .books-import-page__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .books-import-page__title {
          margin: 0;
          font-size: 1.5rem;
          line-height: 1.1;
        }

        .books-import-page__description {
          margin: 0.35rem 0 0;
          color: var(--theme-elevation-700);
        }
      `}</style>
    </div>
  )
}

export default BookImportPage