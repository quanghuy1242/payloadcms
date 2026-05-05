import { z } from 'zod'

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, '')
}

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    const normalized = trimTrailingSlash(value)

    new URL(normalized)

    return normalized
  })

const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'

let cachedAuthBaseUrl: string | undefined

export const getAuthBaseUrl = (): string => {
  if (cachedAuthBaseUrl) {
    return cachedAuthBaseUrl
  }

  const envValue = process.env.AUTH_BASE_URL

  if (!envValue) {
    if (isNextBuild) {
      cachedAuthBaseUrl = 'http://localhost:3000'

      return cachedAuthBaseUrl
    }

    throw new Error('AUTH_BASE_URL must be configured to use Better Auth integration.')
  }

  cachedAuthBaseUrl = urlSchema.parse(envValue)

  return cachedAuthBaseUrl
}

let cachedClientId: string | undefined
let cachedBlogClientId: string | null | undefined

export const getPayloadClientId = (): string => {
  if (cachedClientId) {
    return cachedClientId
  }

  const envValue = process.env.PAYLOAD_CLIENT_ID

  if (!envValue) {
    if (isNextBuild) {
      cachedClientId = 'build-client-id'

      return cachedClientId
    }

    throw new Error('PAYLOAD_CLIENT_ID must be configured to use Better Auth integration.')
  }

  cachedClientId = envValue.trim()

  if (!cachedClientId) {
    throw new Error('PAYLOAD_CLIENT_ID cannot be empty.')
  }

  return cachedClientId
}

export const getBlogClientId = (): string | null => {
  if (cachedBlogClientId !== undefined) {
    return cachedBlogClientId
  }

  const envValue = process.env.BLOG_CLIENT_ID

  if (!envValue) {
    if (isNextBuild) {
      cachedBlogClientId = 'build-blog-client-id'

      return cachedBlogClientId
    }

    cachedBlogClientId = null

    return cachedBlogClientId
  }

  const trimmed = envValue.trim()

  cachedBlogClientId = trimmed.length > 0 ? trimmed : null

  return cachedBlogClientId
}

let cachedClientSecret: string | undefined

export const getPayloadClientSecret = (): string => {
  if (cachedClientSecret) {
    return cachedClientSecret
  }

  const envValue = process.env.PAYLOAD_CLIENT_SECRET

  if (!envValue) {
    if (isNextBuild) {
      cachedClientSecret = 'build-client-secret'

      return cachedClientSecret
    }

    throw new Error('PAYLOAD_CLIENT_SECRET must be configured to use Better Auth integration.')
  }

  cachedClientSecret = envValue.trim()

  if (!cachedClientSecret) {
    throw new Error('PAYLOAD_CLIENT_SECRET cannot be empty.')
  }

  return cachedClientSecret
}

let cachedRedirectUri: string | null | undefined

export const getPayloadRedirectUri = (): string | null => {
  if (cachedRedirectUri !== undefined) {
    return cachedRedirectUri
  }

  const envValue = process.env.PAYLOAD_REDIRECT_URI

  if (!envValue) {
    cachedRedirectUri = null

    return cachedRedirectUri
  }

  cachedRedirectUri = urlSchema.parse(envValue)

  return cachedRedirectUri
}

const optionalStringSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()

let cachedSignupSecret: string | null | undefined

export const getBetterAuthSignupSecret = (): string | null => {
  if (cachedSignupSecret !== undefined) {
    return cachedSignupSecret
  }

  cachedSignupSecret = optionalStringSchema.parse(process.env.BETTER_AUTH_SIGNUP_SECRET ?? null)

  return cachedSignupSecret
}

let cachedIssuer: string | null | undefined

export const getBetterAuthExpectedIssuer = (): string | null => {
  if (cachedIssuer !== undefined) {
    return cachedIssuer
  }

  const envValue = optionalStringSchema.parse(process.env.BETTER_AUTH_JWT_ISSUER ?? null)

  cachedIssuer = envValue ?? null

  return cachedIssuer
}

let cachedPayloadResourceServerAudience: string | undefined

export const getPayloadResourceServerAudience = (): string => {
  if (cachedPayloadResourceServerAudience) {
    return cachedPayloadResourceServerAudience
  }

  const envValue = process.env.PAYLOAD_RESOURCE_SERVER_AUDIENCE?.trim()

  cachedPayloadResourceServerAudience = envValue && envValue.length > 0 ? envValue : 'payload-content-api'

  return cachedPayloadResourceServerAudience
}

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export const shouldAcceptClientAudiences = (): boolean => {
  return parseBooleanEnv(process.env.PAYLOAD_ACCEPT_CLIENT_AUDIENCES)
}

let cachedAudience: string[] | null | undefined

export const getBetterAuthExpectedAudience = (): string[] | null => {
  if (cachedAudience !== undefined) {
    return cachedAudience
  }

  const envValue = optionalStringSchema.parse(process.env.BETTER_AUTH_JWT_AUDIENCE ?? null)
  const configuredAudience = envValue
    ? envValue
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []

  const resourceAudience = getPayloadResourceServerAudience()
  const clientAudiences = [getPayloadClientId(), getBlogClientId()].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  const acceptsClientAudiences = shouldAcceptClientAudiences()
  const clientAudienceSet = new Set(clientAudiences)
  const configuredResourceAudiences = acceptsClientAudiences
    ? configuredAudience
    : configuredAudience.filter((value) => !clientAudienceSet.has(value))
  const migrationAudiences = acceptsClientAudiences
    ? clientAudiences
    : []

  const mergedAudience = [...new Set([resourceAudience, ...configuredResourceAudiences, ...migrationAudiences])]

  if (mergedAudience.length === 0) {
    cachedAudience = null

    return cachedAudience
  }

  cachedAudience = mergedAudience

  return cachedAudience
}

export const BETTER_AUTH_TOKEN_COOKIE = 'betterAuthToken'
export const BETTER_AUTH_STATE_COOKIE = 'betterAuthState'

const PAYLOAD_COOKIE_PREFIX = process.env.PAYLOAD_COOKIE_PREFIX || 'payload'

export const PAYLOAD_ADMIN_TOKEN_COOKIE = `${PAYLOAD_COOKIE_PREFIX}-token`
