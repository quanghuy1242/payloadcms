'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'

const DeleteBookButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [chapterCount, setChapterCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(bookId != null)

  useEffect(() => {
    let isMounted = true

    if (bookId == null) {
      setChapterCount(null)
      setIsLoading(false)
      return undefined
    }

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
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [bookId])

  useEffect(() => {
    let isMounted = true

    if (bookId == null) {
      return undefined
    }

    const handleChapterChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ bookId?: string | number }>

      if (customEvent.detail?.bookId == null) {
        return
      }

      if (String(customEvent.detail.bookId) !== String(bookId)) {
        return
      }

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
        })
    }

    window.addEventListener(BOOK_CHAPTERS_UPDATED_EVENT, handleChapterChange as EventListener)

    return () => {
      isMounted = false
      window.removeEventListener(BOOK_CHAPTERS_UPDATED_EVENT, handleChapterChange as EventListener)
    }
  }, [bookId])

  if (bookId == null) {
    return null
  }

  if (!isLoading && chapterCount === 0) {
    return null
  }

  return (
    <div style={{ display: 'inline-flex' }}>
      <Button
        buttonStyle="secondary"
        disabled
        size="small"
        title={
          isLoading
            ? 'Checking chapter count before deleting this book.'
            : 'Remove all chapters before deleting this book.'
        }
      >
        Delete book
      </Button>
    </div>
  )
}

export default DeleteBookButton