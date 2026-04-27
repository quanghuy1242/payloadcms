'use client'

import { RichTextField } from '@payloadcms/ui'
import type { RichTextFieldClientComponent } from 'payload'

import { ChapterAccessNotice, useChapterAccessState } from './chapterAccess'

const ChapterContentField: RichTextFieldClientComponent = (props) => {
  const { canEdit } = useChapterAccessState()

  if (!canEdit) {
    return (
      <ChapterAccessNotice message="Only the chapter owner can edit this content in the admin portal." />
    )
  }

  return <RichTextField {...props} />
}

export default ChapterContentField
