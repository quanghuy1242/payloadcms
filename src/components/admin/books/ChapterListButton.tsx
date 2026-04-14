'use client'

import {
  Button,
  useDocumentDrawer,
  useDocumentInfo,
  useListDrawer,
} from '@payloadcms/ui'
import type { ListDrawerProps } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'

const BOOK_CHAPTERS_COLLECTION = 'chapters' as const

const ChapterListButton: React.FC = () => {
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
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null)
  const wasDrawerOpen = useRef(false)
  const wasChapterDrawerOpen = useRef(false)
  const pendingChapterDrawerOpen = useRef(false)
  const handleBulkSelect = useCallback(() => undefined, [])

  const [ChapterDrawer, , { isDrawerOpen: isChapterDrawerOpen, openDrawer: openChapterDrawer }] =
    useDocumentDrawer({
      collectionSlug: BOOK_CHAPTERS_COLLECTION,
      id: selectedChapterId,
    })

  const [ListDrawer, , { isDrawerOpen, openDrawer }] = useListDrawer({
    collectionSlugs,
    filterOptions,
    selectedCollection: BOOK_CHAPTERS_COLLECTION,
  })

  const handleChapterSelect = useCallback(
    ({ docID }: Parameters<NonNullable<ListDrawerProps['onSelect']>>[0]) => {
      const parsedChapterId = Number(docID)

      if (!Number.isFinite(parsedChapterId)) {
        return
      }

      setSelectedChapterId(parsedChapterId)
    },
    [],
  )

  useEffect(() => {
    if (selectedChapterId == null) {
      return undefined
    }

    pendingChapterDrawerOpen.current = true
    openChapterDrawer()

    return undefined
  }, [openChapterDrawer, selectedChapterId])

  useEffect(() => {
    if (isChapterDrawerOpen) {
      pendingChapterDrawerOpen.current = false
      wasChapterDrawerOpen.current = true
      return undefined
    }

    if (!pendingChapterDrawerOpen.current && wasChapterDrawerOpen.current && selectedChapterId != null) {
      wasChapterDrawerOpen.current = false
      setSelectedChapterId(null)
    }

    return undefined
  }, [isChapterDrawerOpen, selectedChapterId])

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
      <ListDrawer
        allowCreate={false}
        enableRowSelections
        onBulkSelect={handleBulkSelect}
        onSelect={handleChapterSelect}
      />
      {selectedChapterId != null && (
        <ChapterDrawer />
      )}
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