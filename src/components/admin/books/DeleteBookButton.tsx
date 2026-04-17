'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

import { BOOK_CHAPTERS_UPDATED_EVENT, fetchBookChapterCount } from '@/utils/books'
import { requestJSON } from '@/utils/http'

const DeleteBookButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [chapterCount, setChapterCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(bookId != null)
  const [isDeleting, setIsDeleting] = useState(false)

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

  const handleDelete = useCallback(async () => {
    if (bookId == null || isDeleting) {
      return
    }

    if (!window.confirm('Delete this book? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      await requestJSON(`/api/books/${bookId}`, { method: 'DELETE' })
      router.push('/admin/collections/books')
    } catch {
      setIsDeleting(false)
    }
  }, [bookId, isDeleting, router])

  if (bookId == null) {
    return null
  }

  const canDelete = !isLoading && !isDeleting && chapterCount === 0
  const isDisabled = !canDelete

  const tooltip = isLoading || isDeleting
    ? 'Checking chapter count before deleting this book.'
    : chapterCount !== null && chapterCount > 0
      ? 'Remove all chapters before deleting this book.'
      : undefined

  return (
    <Button
      buttonStyle="secondary"
      disabled={isDisabled}
      onClick={canDelete ? handleDelete : undefined}
      size="medium"
      tooltip={tooltip}
    >
      {isDeleting ? 'Deleting...' : 'Delete book'}
    </Button>
  )
}

export default DeleteBookButton