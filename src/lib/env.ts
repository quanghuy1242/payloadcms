import { z } from 'zod'

const createUrlSchema = () =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\/+$/, ''))

const r2PublicBaseUrlSchema = createUrlSchema()

const cloudflareCacheZoneIdSchema = z.string().trim().min(1)
const cloudflareCacheApiTokenSchema = z.string().trim().min(1)

const autherBaseUrlSchema = createUrlSchema()

const autherApiKeySchema = z.string().trim().min(1)

const autherWebhookSecretSchema = z.string().trim().min(1)

const qstashTokenSchema = z.string().trim().min(1)
const qstashSigningKeySchema = z.string().trim().min(1)

let cachedR2PublicBaseUrl: string | null | undefined
let cachedCloudflareCacheZoneId: string | null | undefined
let cachedCloudflareCacheApiToken: string | null | undefined
let cachedAutherBaseUrl: string | undefined
let cachedAutherApiKey: string | undefined
let cachedAutherWebhookSecret: string | undefined
let cachedAutherClientId: string | undefined
let cachedQStashToken: string | undefined
let cachedQStashBaseUrl: string | undefined
let cachedQStashCurrentSigningKey: string | undefined
let cachedQStashNextSigningKey: string | undefined
let cachedQueueTargetBaseUrl: string | undefined

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

export const getCloudflareCacheZoneId = (): string | null => {
  if (cachedCloudflareCacheZoneId !== undefined) {
    return cachedCloudflareCacheZoneId
  }

  const value = process.env.CLOUDFLARE_CACHE_ZONE_ID

  if (!value) {
    cachedCloudflareCacheZoneId = null

    return cachedCloudflareCacheZoneId
  }

  const parsedValue = cloudflareCacheZoneIdSchema.safeParse(value)

  cachedCloudflareCacheZoneId = parsedValue.success ? parsedValue.data : null

  return cachedCloudflareCacheZoneId
}

export const getCloudflareCacheApiToken = (): string | null => {
  if (cachedCloudflareCacheApiToken !== undefined) {
    return cachedCloudflareCacheApiToken
  }

  const value = process.env.CLOUDFLARE_CACHE_API_TOKEN

  if (!value) {
    cachedCloudflareCacheApiToken = null

    return cachedCloudflareCacheApiToken
  }

  const parsedValue = cloudflareCacheApiTokenSchema.safeParse(value)

  cachedCloudflareCacheApiToken = parsedValue.success ? parsedValue.data : null

  return cachedCloudflareCacheApiToken
}

export const getAutherBaseUrl = (): string => {
  if (cachedAutherBaseUrl !== undefined) {
    return cachedAutherBaseUrl
  }

  const value = process.env.AUTH_BASE_URL ?? process.env.AUTHER_BASE_URL

  if (!value) {
    throw new Error('AUTH_BASE_URL is not set')
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

export const getAutherWebhookSecret = (): string => {
  if (cachedAutherWebhookSecret !== undefined) {
    return cachedAutherWebhookSecret
  }

  const value = process.env.AUTHER_WEBHOOK_SECRET

  if (!value) {
    throw new Error('AUTHER_WEBHOOK_SECRET is not set')
  }

  cachedAutherWebhookSecret = autherWebhookSecretSchema.parse(value)

  return cachedAutherWebhookSecret
}

/**
 * Returns the Auther OAuth client ID this Payload instance belongs to.
 * When set, the webhook route will reject events not scoped to this client.
 * Optional — if not set, all events pass through without client filtering.
 */
export const getAutherClientId = (): string | null => {
  if (cachedAutherClientId !== undefined) {
    return cachedAutherClientId
  }

  cachedAutherClientId = process.env.AUTHER_CLIENT_ID?.trim() || undefined

  return cachedAutherClientId ?? null
}

export const getQStashToken = (): string => {
  if (cachedQStashToken !== undefined) {
    return cachedQStashToken
  }

  const value = process.env.QSTASH_TOKEN

  if (!value) {
    throw new Error('QSTASH_TOKEN is not set')
  }

  cachedQStashToken = qstashTokenSchema.parse(value)

  return cachedQStashToken
}

export const getQStashBaseUrl = (): string => {
  if (cachedQStashBaseUrl !== undefined) {
    return cachedQStashBaseUrl
  }

  const value = process.env.QSTASH_URL ?? 'https://qstash.upstash.io'

  cachedQStashBaseUrl = value.replace(/\/+$/, '')

  return cachedQStashBaseUrl
}

export const getQStashCurrentSigningKey = (): string => {
  if (cachedQStashCurrentSigningKey !== undefined) {
    return cachedQStashCurrentSigningKey
  }

  const value = process.env.QSTASH_CURRENT_SIGNING_KEY

  if (!value) {
    throw new Error('QSTASH_CURRENT_SIGNING_KEY is not set')
  }

  cachedQStashCurrentSigningKey = qstashSigningKeySchema.parse(value)

  return cachedQStashCurrentSigningKey
}

export const getQStashNextSigningKey = (): string => {
  if (cachedQStashNextSigningKey !== undefined) {
    return cachedQStashNextSigningKey
  }

  const value = process.env.QSTASH_NEXT_SIGNING_KEY ?? getQStashCurrentSigningKey()

  cachedQStashNextSigningKey = qstashSigningKeySchema.parse(value)

  return cachedQStashNextSigningKey
}

export const resolveQueueTargetBaseUrl = (): string => {
  if (cachedQueueTargetBaseUrl !== undefined) {
    return cachedQueueTargetBaseUrl
  }

  const explicitBaseUrl = process.env.QUEUE_TARGET_BASE_URL

  if (explicitBaseUrl) {
    cachedQueueTargetBaseUrl = autherBaseUrlSchema.parse(explicitBaseUrl)

    return cachedQueueTargetBaseUrl
  }

  const vercelUrl = process.env.VERCEL_URL

  if (vercelUrl) {
    const normalizedVercelUrl = /^https?:\/\//i.test(vercelUrl)
      ? vercelUrl
      : `https://${vercelUrl}`

    cachedQueueTargetBaseUrl = autherBaseUrlSchema.parse(normalizedVercelUrl)

    return cachedQueueTargetBaseUrl
  }

  cachedQueueTargetBaseUrl = 'http://localhost:3000'

  return cachedQueueTargetBaseUrl
}
