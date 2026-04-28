'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import { requestJSON } from '@/utils/http'

const PREVIEWABLE_COLLECTIONS = ['books', 'posts'] as const
type PreviewableCollection = (typeof PREVIEWABLE_COLLECTIONS)[number]

const isPreviewableCollection = (value: unknown): value is PreviewableCollection => {
  return typeof value === 'string' && PREVIEWABLE_COLLECTIONS.includes(value as PreviewableCollection)
}

const getBlogURL = (): string => {
  const blogURL = process.env.NEXT_PUBLIC_BLOG_URL?.trim()

  if (!blogURL) {
    throw new Error('NEXT_PUBLIC_BLOG_URL is not configured')
  }

  return blogURL
}

const PreviewOnBlogButton: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const docId = typeof id === 'string' || typeof id === 'number' ? id : null
  const [isLoading, setIsLoading] = useState(false)

  const handlePreview = useCallback(async () => {
    if (docId == null || !isPreviewableCollection(collectionSlug)) {
      return
    }

    setIsLoading(true)
    try {
      const blogURL = getBlogURL()

      const query = `
        query PreviewToken($docType: String!, $docId: ID!) {
          previewToken(docType: $docType, docId: $docId) {
            token
            slug
          }
        }
      `

      const result = await requestJSON<{
        data?: { previewToken?: { token: string; slug: string } }
        errors?: Array<{ message: string }>
      }>('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { docType: collectionSlug, docId: String(docId) },
        }),
      })

      if (result.errors?.length) {
        throw new Error(result.errors[0].message)
      }

      const previewToken = result.data?.previewToken
      if (!previewToken) {
        throw new Error('Failed to get preview token')
      }

      const path =
        collectionSlug === 'books'
          ? `/books/${previewToken.slug}`
          : `/posts/${previewToken.slug}`

      window.open(
        `${blogURL}/api/draft?token=${encodeURIComponent(previewToken.token)}&redirect=${encodeURIComponent(path)}`,
        '_blank',
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setIsLoading(false)
    }
  }, [docId, collectionSlug])

  const isDisabled = docId == null || !isPreviewableCollection(collectionSlug)

  return (
    <Button
      buttonStyle="secondary"
      disabled={isDisabled || isLoading}
      onClick={isDisabled ? undefined : handlePreview}
      size="medium"
      tooltip={isDisabled ? 'Save the document first' : 'Preview this document on the blog'}
    >
      {isLoading ? 'Previewing...' : 'Preview on blog'}
    </Button>
  )
}

export default PreviewOnBlogButton
