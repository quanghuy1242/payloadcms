import type { CollectionBeforeValidateHook } from 'payload'

export const formatSlug = (value: string) =>
  value
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

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
    const sourceValue = typeof candidateSource === 'string' ? candidateSource : undefined

    const hasSlug = typeof workingRecord.slug === 'string' && workingRecord.slug.trim() !== ''

    if (operation === 'create') {
      if (!hasSlug && sourceValue) {
        workingRecord.slug = formatSlug(sourceValue)
      }
    }

    if (operation === 'update') {
      const originalSlug = typeof originalRecord.slug === 'string' ? originalRecord.slug : undefined

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

export const validateImmutableSlug = (value: unknown, { operation, previousValue }: ValidateArgs) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Slug is required.'
  }

  if (operation === 'update' && previousValue?.slug && value !== previousValue.slug) {
    return 'Slug cannot be changed after creation.'
  }

  return true
}
