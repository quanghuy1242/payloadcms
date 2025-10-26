export type BetterAuthPkceCookiePayload = {
  state: string
  verifier: string
  createdAt: number
}

export const PKCE_COOKIE_MAX_AGE_SECONDS = 10 * 60

const encodePkcePayload = (payload: BetterAuthPkceCookiePayload): string => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

const decodePkcePayload = (value: string): BetterAuthPkceCookiePayload | null => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as
      | BetterAuthPkceCookiePayload
      | null

    if (
      parsed &&
      typeof parsed.state === 'string' &&
      typeof parsed.verifier === 'string' &&
      typeof parsed.createdAt === 'number'
    ) {
      return parsed
    }

    return null
  } catch {
    return null
  }
}

export const createPkceCookieValue = (payload: BetterAuthPkceCookiePayload): string => {
  return encodePkcePayload(payload)
}

export const parsePkceCookieValue = (value: string | null | undefined): BetterAuthPkceCookiePayload | null => {
  if (!value) {
    return null
  }

  return decodePkcePayload(value)
}

export const isPkcePayloadExpired = (payload: BetterAuthPkceCookiePayload, now: number = Date.now()): boolean => {
  const ageSeconds = (now - payload.createdAt) / 1000

  return ageSeconds > PKCE_COOKIE_MAX_AGE_SECONDS
}

const isProduction = process.env.NODE_ENV === 'production'

const sharedCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
}

export const getExpressPkceCookieOptions = () => ({
  ...sharedCookieOptions,
  maxAge: PKCE_COOKIE_MAX_AGE_SECONDS * 1000,
})

export const getNextPkceCookieOptions = () => ({
  ...sharedCookieOptions,
  maxAge: PKCE_COOKIE_MAX_AGE_SECONDS,
})

const clampCookieAge = (seconds: number): number => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return PKCE_COOKIE_MAX_AGE_SECONDS
  }

  return Math.min(Math.floor(seconds), 24 * 60 * 60) // cap at 1 day
}

export const getExpressTokenCookieOptions = (maxAgeSeconds: number) => ({
  ...sharedCookieOptions,
  maxAge: clampCookieAge(maxAgeSeconds) * 1000,
})

export const getNextTokenCookieOptions = (maxAgeSeconds: number) => ({
  ...sharedCookieOptions,
  maxAge: clampCookieAge(maxAgeSeconds),
})
