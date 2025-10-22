import { z } from 'zod'

const r2PublicBaseUrlSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\/+$/, ''))

let cachedR2PublicBaseUrl: string | null | undefined

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
