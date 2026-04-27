import type { CollectionAfterReadHook, CollectionBeforeChangeHook } from 'payload'

import {
  hashChapterPassword,
  nextChapterPasswordVersion,
  normalizeChapterPasswordVersion,
} from './chapterPasswords'

type ChapterPasswordRecord = {
  hasPassword?: boolean
  password?: unknown
  passwordVersion?: unknown
  [key: string]: unknown
}

/**
 * Payload `beforeChange` hook that hashes chapter passwords and keeps the derived flags in sync.
 *
 * Preserves the existing hash when the field is omitted, hashes new input, clears the stored hash
 * when the field is explicitly emptied, and bumps the password version so old proofs expire.
 */
export const syncChapterPasswordStateHook: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
}) => {
  const workingData = data ? { ...data } : {}
  const workingRecord = workingData as ChapterPasswordRecord
  const previousRecord = (originalDoc as ChapterPasswordRecord | undefined) ?? {}

  const passwordWasProvided = Object.prototype.hasOwnProperty.call(workingRecord, 'password')

  if (passwordWasProvided) {
    const password = typeof workingRecord.password === 'string' ? workingRecord.password : ''
    const nextVersion = nextChapterPasswordVersion(previousRecord.passwordVersion)

    if (password.length > 0) {
      workingRecord.password = await hashChapterPassword(password)
      workingRecord.hasPassword = true
      workingRecord.passwordVersion = nextVersion
    } else {
      workingRecord.password = null
      workingRecord.hasPassword = false
      workingRecord.passwordVersion = nextVersion
    }
  } else if (operation === 'create') {
    workingRecord.hasPassword = false
    if (workingRecord.password == null) {
      workingRecord.password = null
    }

    if (workingRecord.passwordVersion == null) {
      workingRecord.passwordVersion = normalizeChapterPasswordVersion(previousRecord.passwordVersion)
    }
  } else {
    if (typeof previousRecord.hasPassword === 'boolean' && workingRecord.hasPassword == null) {
      workingRecord.hasPassword = previousRecord.hasPassword
    }

    if (workingRecord.passwordVersion == null && previousRecord.passwordVersion != null) {
      workingRecord.passwordVersion = previousRecord.passwordVersion
    }
  }

  return workingData
}

/**
 * Payload `afterRead` hook that hides the raw chapter password and derives `hasPassword` from storage.
 *
 * Do not re-apply chapter content access here. The `content` field already has a dedicated
 * field-level read access function, and a second gate in `afterRead` can strip content from
 * requests that Payload has already authorized at the field layer.
 */
export const applyChapterPasswordReadStateHook: CollectionAfterReadHook = async ({ doc }) => {
  if (doc == null || typeof doc !== 'object') {
    return doc
  }

  const chapter = doc as ChapterPasswordRecord

  return {
    ...chapter,
    hasPassword: Boolean(chapter.hasPassword ?? chapter.password),
    password: undefined,
    passwordVersion: undefined,
  }
}
