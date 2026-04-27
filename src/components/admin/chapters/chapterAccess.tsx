'use client'

import { useAuth, useDocumentInfo, useOperation } from '@payloadcms/ui'
import React from 'react'

import { normalizeEntityId } from '@/utils/identifiers'

type ChapterDoc = {
  createdBy?: unknown
}

type ChapterAccessState = {
  canEdit: boolean
  isAdmin: boolean
  isCreate: boolean
  isOwner: boolean
}

export const useChapterAccessState = (): ChapterAccessState => {
  const { user } = useAuth()
  const { data } = useDocumentInfo()
  const operation = useOperation()

  const isCreate = operation === 'create'
  const isAdmin = user?.role === 'admin'
  const chapterOwnerId = normalizeEntityId((data as ChapterDoc | undefined)?.createdBy)
  const userId = normalizeEntityId(user?.id)
  const isOwner = chapterOwnerId != null && userId != null && String(chapterOwnerId) === String(userId)
  const canEdit = isCreate || isAdmin || isOwner

  return {
    canEdit,
    isAdmin,
    isCreate,
    isOwner,
  }
}

export const ChapterAccessNotice = ({ message }: { message: string }) => {
  return (
    <div
      style={{
        border: '1px solid var(--theme-error-300, #fca5a5)',
        borderRadius: '8px',
        color: 'var(--theme-error-700, #b91c1c)',
        padding: '0.85rem 1rem',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Access denied</strong>
      <span>{message}</span>
    </div>
  )
}
