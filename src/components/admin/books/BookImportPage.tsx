'use client'

import { Button, ViewDescription, useConfig } from '@payloadcms/ui'
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
        <div className="books-import-page__heading">
          <h1 className="books-import-page__title">Import Books</h1>
          <ViewDescription
            description="Upload an EPUB to create the book and its chapters."
          />
        </div>

        <div className="books-import-page__actions">
          <Button buttonStyle="pill" el="link" size="small" to={backURL}>
            Back to Books
          </Button>
        </div>
      </div>

      <EpubImporter />
    </div>
  )
}

export default BookImportPage