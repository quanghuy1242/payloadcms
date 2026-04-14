'use client'

import { Button, DefaultListView, useConfig } from '@payloadcms/ui'
import type { ListViewClientProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { useMemo } from 'react'

const BOOK_IMPORT_PATH = '/collections/books/import' as const

const BooksListView = (props: ListViewClientProps) => {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()

  const importURL = useMemo(() => {
    return formatAdminURL({
      adminRoute,
      path: BOOK_IMPORT_PATH,
    })
  }, [adminRoute])

  const listMenuItems = useMemo(() => {
    const importButton = (
      <Button
        aria-label="Import EPUB"
        buttonStyle="pill"
        className="list-create-new-doc__create-new-button"
        el="link"
        size="small"
        to={importURL}
      >
        Import EPUB
      </Button>
    )

    return [...(props.listMenuItems ?? []), importButton]
  }, [importURL, props.listMenuItems])

  return (
    <DefaultListView
      {...props}
      hasCreatePermission={false}
      listMenuItems={listMenuItems}
    />
  )
}

export default BooksListView