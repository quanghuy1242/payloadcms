'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import { requestJSON } from '@/utils/http'

const DownloadEpubButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [isLoading, setIsLoading] = useState(false)
  const isDisabled = bookId == null

  const handleDownload = useCallback(async () => {
    if (bookId == null || isLoading) {
      return
    }

    setIsLoading(true)
    try {
      const query = `
        mutation GenerateEpub($bookId: ID!) {
          generateEpub(bookId: $bookId) {
            downloadUrl
            filename
            expiresAt
          }
        }
      `

      const result = await requestJSON<{
        data?: { generateEpub?: { downloadUrl: string; filename: string } }
        errors?: Array<{ message: string }>
      }>('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { bookId: String(bookId) },
        }),
      })

      if (result.errors?.length) {
        throw new Error(result.errors[0].message)
      }

      const downloadUrl = result.data?.generateEpub?.downloadUrl
      if (!downloadUrl) {
        throw new Error('Failed to generate EPUB')
      }

      window.location.assign(downloadUrl)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'EPUB generation failed')
    } finally {
      setIsLoading(false)
    }
  }, [bookId, isLoading])

  return (
    <Button
      buttonStyle="secondary"
      disabled={isDisabled || isLoading}
      onClick={isDisabled ? undefined : handleDownload}
      size="medium"
      tooltip={isDisabled ? 'Save the document first' : 'Download this book as an EPUB file'}
    >
      {isLoading ? 'Generating...' : 'Download as EPUB'}
    </Button>
  )
}

export default DownloadEpubButton
