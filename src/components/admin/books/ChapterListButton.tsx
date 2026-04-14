'use client'

import { Button, useConfig, useDocumentInfo, useListDrawer } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import type { Data } from 'payload'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'

const BOOK_CHAPTERS_COLLECTION = 'chapters' as const

const ChapterListButton: React.FC = () => {
  const router = useRouter()
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { id } = useDocumentInfo()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const collectionSlugs = useMemo(() => [BOOK_CHAPTERS_COLLECTION], [])
  const filterOptions = useMemo(
    () =>
      bookId != null
        ? {
            [BOOK_CHAPTERS_COLLECTION]: {
              book: {
                equals: bookId,
              },
            },
          }
        : undefined,
    [bookId],
  )
  const [chapterCount, setChapterCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(bookId != null)
  const wasDrawerOpen = useRef(false)

  const [ListDrawer, , { closeDrawer, isDrawerOpen, openDrawer }] = useListDrawer({
    collectionSlugs,
    filterOptions,
    selectedCollection: BOOK_CHAPTERS_COLLECTION,
  })

  const handleChapterSelect = useCallback(
    ({ collectionSlug, docID }: { collectionSlug: string; doc: Data; docID: string }) => {
      closeDrawer()

      router.push(
        formatAdminURL({
          adminRoute,
          path: `/collections/${collectionSlug}/${docID}`,
        }),
      )
    },
    [adminRoute, closeDrawer, router],
  )

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
      <ListDrawer onSelect={handleChapterSelect} />
      <Button
        buttonStyle="secondary"
        size="medium"
        onClick={openDrawer}
        disabled={bookId == null}
        tooltip={bookId == null ? 'Save the book first' : 'Open the chapter drawer for this book.'}
      >
        {label}
      </Button>
    </>
  )
}

export default ChapterListButton