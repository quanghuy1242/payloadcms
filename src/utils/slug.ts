import type { CollectionBeforeValidateHook } from 'payload'

import { isNonEmptyString, toNullableString } from './strings'

export const formatSlug = (value: unknown): string => {
  const normalized = toNullableString(value)

  if (!normalized) {
    return ''
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

type SlugRecord = {
  slug?: string | null
  [key: string]: unknown
}

export const createSlugHook = (sourceField: string): CollectionBeforeValidateHook => {
  return ({ data, originalDoc, operation }) => {
    const workingData = data || {}
    const workingRecord = workingData as SlugRecord
    const originalRecord = (originalDoc as SlugRecord | undefined) ?? {}

    const candidateSource = workingRecord[sourceField] ?? originalRecord[sourceField]
    const sourceValue = isNonEmptyString(candidateSource) ? candidateSource : undefined

    const hasSlug = isNonEmptyString(workingRecord.slug)

    if (operation === 'create') {
      if (!hasSlug && sourceValue) {
        workingRecord.slug = formatSlug(sourceValue)
      }
    }

    if (operation === 'update') {
      const originalSlug = isNonEmptyString(originalRecord.slug) ? originalRecord.slug : undefined

      if (originalSlug) {
        workingRecord.slug = originalSlug
      } else if (!hasSlug && sourceValue) {
        workingRecord.slug = formatSlug(sourceValue)
      }
    }

    return workingData
  }
}

type ValidateArgs = { operation?: string; previousValue?: { slug?: string | null } | null }

export const validateImmutableSlug = (
  value: unknown,
  { operation, previousValue }: ValidateArgs,
) => {
  if (!isNonEmptyString(value)) {
    return 'Slug is required.'
  }

  if (
    operation === 'update' &&
    isNonEmptyString(previousValue?.slug) &&
    value !== previousValue.slug
  ) {
    return 'Slug cannot be changed after creation.'
  }

  return true
}
