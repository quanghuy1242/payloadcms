'use client'

import { useDocumentInfo, useListDrawer } from '@payloadcms/ui'
import React, { useEffect, useRef, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'

const BOOK_CHAPTERS_COLLECTION = 'chapters' as const

const ChapterListButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [chapterCount, setChapterCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(bookId != null)
  const wasDrawerOpen = useRef(false)

  const [ListDrawer, ListDrawerToggler, { isDrawerOpen }] = useListDrawer({
    collectionSlugs: [BOOK_CHAPTERS_COLLECTION],
    filterOptions:
      bookId != null
        ? {
            [BOOK_CHAPTERS_COLLECTION]: {
              book: {
                equals: bookId,
              },
            },
          }
        : undefined,
    selectedCollection: BOOK_CHAPTERS_COLLECTION,
  })

  useEffect(() => {
    let isMounted = true

    if (bookId == null) {
      setChapterCount(null)
      setIsLoading(false)
      wasDrawerOpen.current = false
      return undefined
    }

    const shouldNotifyDeleteButton = wasDrawerOpen.current && !isDrawerOpen
    wasDrawerOpen.current = isDrawerOpen
    const controller = new AbortController()

    setIsLoading(true)

    void fetchBookChapterCount(bookId, controller.signal)
      .then((nextCount) => {
        if (!isMounted || controller.signal.aborted) {
          return
        }

        setChapterCount(nextCount)
      })
      .catch(() => {
        if (!isMounted || controller.signal.aborted) {
          return
        }

        setChapterCount(null)
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false)
        }

        if (
          isMounted &&
          !controller.signal.aborted &&
          shouldNotifyDeleteButton &&
          typeof window !== 'undefined'
        ) {
          window.dispatchEvent(
            new CustomEvent(BOOK_CHAPTERS_UPDATED_EVENT, {
              detail: {
                bookId,
              },
            }),
          )
        }
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [bookId, isDrawerOpen])

  const label =
    bookId == null
      ? 'Chapters'
      : isLoading
        ? 'Chapters (...)'
        : chapterCount == null
          ? 'Chapters (?)'
          : `Chapters (${chapterCount})`

  return (
    <>
      <ListDrawer />
      <ListDrawerToggler
        className="btn btn--style-secondary btn--size-small"
        disabled={bookId == null}
        title={bookId == null ? 'Save the book first' : 'Open the chapter drawer for this book.'}
      >
        {label}
      </ListDrawerToggler>
    </>
  )
}

export default ChapterListButton