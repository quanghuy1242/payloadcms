import { z } from 'zod'

import { normalizeCloudflareImageFit, type CloudflareImageFit } from './cloudflareImages'
import { sanitizeDimension, sanitizeQuality, toPositiveInteger } from '../utils/numbers'

const positiveIntSchema = z
  .string()
  .transform((value) => toPositiveInteger(value))
  .nullable()

const cloudflareSchema = z.object({
  baseUrl: z
    .string()
    .min(1, 'CLOUDFLARE_IMAGE_BASE_URL must be defined')
    .transform((value) => value.trim().replace(/\/+$/, '')),
  defaultFit: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  defaultFormat: z.string().nullish().transform((value) => value ?? 'webp'),
  defaultQuality: positiveIntSchema.transform((value) => sanitizeQuality(value) ?? 60),
  defaultWidth: positiveIntSchema.transform((value) => sanitizeDimension(value) ?? 32),
})

export type CloudflareImageConfig = {
  baseUrl: string
  defaultFit: CloudflareImageFit
  defaultFormat: string
  defaultQuality: number
  defaultWidth: number
}

const envSchema = z.object({
  CLOUDFLARE_IMAGE_BASE_URL: z.string().min(1),
  CLOUDFLARE_IMAGE_PREVIEW_FIT: z.string().nullish(),
  CLOUDFLARE_IMAGE_PREVIEW_FORMAT: z.string().nullish(),
  CLOUDFLARE_IMAGE_PREVIEW_QUALITY: z.string().nullish(),
  CLOUDFLARE_IMAGE_PREVIEW_WIDTH: z.string().nullish(),
})

const parseCloudflareConfig = (): CloudflareImageConfig => {
  const raw = envSchema.parse(process.env)

  const parsed = cloudflareSchema.parse({
    baseUrl: raw.CLOUDFLARE_IMAGE_BASE_URL,
    defaultFit: raw.CLOUDFLARE_IMAGE_PREVIEW_FIT ?? null,
    defaultFormat: raw.CLOUDFLARE_IMAGE_PREVIEW_FORMAT ?? null,
    defaultQuality: raw.CLOUDFLARE_IMAGE_PREVIEW_QUALITY ?? null,
    defaultWidth: raw.CLOUDFLARE_IMAGE_PREVIEW_WIDTH ?? null,
  })

  return {
    baseUrl: parsed.baseUrl,
    defaultFit: normalizeCloudflareImageFit(parsed.defaultFit) ?? 'cover',
    defaultFormat: parsed.defaultFormat,
    defaultQuality: parsed.defaultQuality,
    defaultWidth: parsed.defaultWidth,
  }
}

let cachedCloudflareConfig: CloudflareImageConfig | undefined

export const getCloudflareImageConfig = (): CloudflareImageConfig => {
  if (!cachedCloudflareConfig) {
    cachedCloudflareConfig = parseCloudflareConfig()
  }

  return cachedCloudflareConfig
}
