import { z } from 'zod'

const createUrlSchema = () =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\/+$/, ''))

const r2PublicBaseUrlSchema = createUrlSchema()

const autherBaseUrlSchema = createUrlSchema()

const autherApiKeySchema = z.string().trim().min(1)

let cachedR2PublicBaseUrl: string | null | undefined
let cachedAutherBaseUrl: string | undefined
let cachedAutherApiKey: string | undefined

export const getR2PublicBaseUrl = (): string | null => {
  if (cachedR2PublicBaseUrl !== undefined) {
    return cachedR2PublicBaseUrl
  }

  const value = process.env.R2_PUBLIC_BASE_URL

  if (!value) {
    cachedR2PublicBaseUrl = null

    return cachedR2PublicBaseUrl
  }

  cachedR2PublicBaseUrl = r2PublicBaseUrlSchema.parse(value)

  return cachedR2PublicBaseUrl
}

export const getAutherBaseUrl = (): string => {
  if (cachedAutherBaseUrl !== undefined) {
    return cachedAutherBaseUrl
  }

  const value = process.env.AUTHER_BASE_URL

  if (!value) {
    throw new Error('AUTHER_BASE_URL is not set')
  }

  cachedAutherBaseUrl = autherBaseUrlSchema.parse(value)

  return cachedAutherBaseUrl
}

export const getAutherApiKey = (): string => {
  if (cachedAutherApiKey !== undefined) {
    return cachedAutherApiKey
  }

  const value = process.env.AUTHER_API_KEY

  if (!value) {
    throw new Error('AUTHER_API_KEY is not set')
  }

  cachedAutherApiKey = autherApiKeySchema.parse(value)

  return cachedAutherApiKey
}
