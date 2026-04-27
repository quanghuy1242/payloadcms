'use client'

import { useAuth, useDocumentInfo, useOperation } from '@payloadcms/ui'

import { ChapterAccessNotice } from './chapterAccess'
import { normalizeEntityId } from '@/utils/identifiers'

const ChapterEditAccessNotice = () => {
  const { user } = useAuth()
  const { data } = useDocumentInfo()
  const operation = useOperation()

  if (operation === 'create') {
    return null
  }

  const isAdmin = user?.role === 'admin'
  const chapterOwnerId = normalizeEntityId((data as { createdBy?: unknown } | undefined)?.createdBy)
  const userId = normalizeEntityId(user?.id)
  const isOwner = chapterOwnerId != null && userId != null && String(chapterOwnerId) === String(userId)

  if (isAdmin || isOwner) {
    return null
  }

  return <ChapterAccessNotice message="You do not own this chapter, so editing is blocked in the admin portal." />
}

export default ChapterEditAccessNotice
