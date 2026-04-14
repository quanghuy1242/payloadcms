'use client'

import { Button, DefaultListView, useConfig } from '@payloadcms/ui'
import type { ListViewClientProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'

const BOOK_IMPORT_PATH = '/collections/books/import' as const

const BooksListView = (props: ListViewClientProps) => {
  const [titleActionsTarget, setTitleActionsTarget] = useState<HTMLElement | null>(null)

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

  useEffect(() => {
    const timeoutID = window.setTimeout(() => {
      const target = document.querySelector('.collection-list--books .list-header__title-actions')

      if (target instanceof HTMLElement) {
        setTitleActionsTarget(target)
      }
    }, 0)

    return () => {
      window.clearTimeout(timeoutID)
    }
  }, [props.collectionSlug])

  const importTitleAction = useMemo(() => {
    if (!titleActionsTarget) {
      return null
    }

    return createPortal(
      <Button
        aria-label="Import EPUB"
        buttonStyle="pill"
        className="books-list-view__import-button list-create-new-doc__create-new-button"
        el="link"
        size="small"
        to={importURL}
      >
        Import EPUB
      </Button>,
      titleActionsTarget,
    )
  }, [importURL, titleActionsTarget])

  const beforeList = useMemo(() => {
    if (!props.BeforeList && !importTitleAction) {
      return undefined
    }

    return (
      <>
        {props.BeforeList}
        {importTitleAction}
      </>
    )
  }, [importTitleAction, props.BeforeList])

  return (
    <DefaultListView {...props} BeforeList={beforeList} hasCreatePermission={props.hasCreatePermission} />
  )
}

export default BooksListView