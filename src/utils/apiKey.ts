import { isNonEmptyString, toNullableString } from './strings'

const DEFAULT_AUTH_COLLECTION_SLUG = 'users'
const API_KEY_SCHEME = 'API-Key'

export type ParsedAPIKeyHeader = {
  collection: string
  apiKey: string
}

const normalizeHeaderSegment = (value: unknown): string | null => {
  const normalized = toNullableString(value)

  if (!isNonEmptyString(normalized)) {
    return null
  }

  return normalized
}

export const buildAPIKeyAuthorizationHeader = (collectionSlug: string, apiKey: string): string => {
  const slug = normalizeHeaderSegment(collectionSlug)
  const key = normalizeHeaderSegment(apiKey)

  if (!slug || !key) {
    throw new Error('collection slug and api key are required to build the Authorization header')
  }

  return `${slug} ${API_KEY_SCHEME} ${key}`
}

export const buildUserAPIKeyAuthorizationHeader = (apiKey: string): string => {
  return buildAPIKeyAuthorizationHeader(DEFAULT_AUTH_COLLECTION_SLUG, apiKey)
}

export const parseAPIKeyAuthorizationHeader = (
  header: string | null | undefined,
): ParsedAPIKeyHeader | null => {
  const normalized = normalizeHeaderSegment(header)

  if (!normalized) {
    return null
  }

  const segments = normalized.split(' ').filter(Boolean)

  if (segments.length < 3) {
    return null
  }

  const [collection, scheme, ...rest] = segments

  if (scheme !== API_KEY_SCHEME) {
    return null
  }

  const key = rest.join(' ')

  if (!isNonEmptyString(collection) || !isNonEmptyString(key)) {
    return null
  }

  return {
    collection,
    apiKey: key,
  }
}

export const createAPIKeyAuthHeaders = (
  apiKey: string,
  collectionSlug = DEFAULT_AUTH_COLLECTION_SLUG,
) => {
  return {
    Authorization: buildAPIKeyAuthorizationHeader(collectionSlug, apiKey),
  }
}
