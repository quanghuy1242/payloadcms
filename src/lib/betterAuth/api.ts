import crypto from 'node:crypto'

import fetch from 'cross-fetch'

import {
  getAuthBaseUrl,
  getBetterAuthSignupSecret,
  getPayloadClientId,
  getPayloadClientSecret,
} from './env'

type SignUpRequestBody = {
  email: string
  password: string
  name?: string
  username?: string
  displayUsername?: string
}

export type SignUpBetterAuthUserInput = {
  email: string
  name?: string | null
  username?: string | null
  displayUsername?: string | null
  password?: string | null
}

export type SignUpBetterAuthUserResult = {
  id: string
  email: string
  name?: string | null
}

export class BetterAuthRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BetterAuthRequestError'
    this.status = status
  }
}

const generateRandomPassword = (): string => {
  // 32 bytes -> 43 char base64url string, satisfies Better Auth minimums
  return crypto.randomBytes(32).toString('base64url')
}

const resolveSignupSecret = (): string | null => {
  const signupSecret = getBetterAuthSignupSecret()

  if (signupSecret) {
    return signupSecret
  }

  try {
    return getPayloadClientSecret()
  } catch {
    return null
  }
}

export const signUpBetterAuthUser = async ({
  email,
  name,
  username,
  displayUsername,
  password,
}: SignUpBetterAuthUserInput): Promise<SignUpBetterAuthUserResult> => {
  const baseUrl = getAuthBaseUrl()
  const endpoint = new URL('/api/auth/sign-up/email', baseUrl)

  const body: SignUpRequestBody = {
    email,
    password: password?.trim() || generateRandomPassword(),
  }

  if (name) {
    body.name = name
  }

  if (username) {
    body.username = username
  }

  if (displayUsername) {
    body.displayUsername = displayUsername
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const signupSecret = resolveSignupSecret()

  if (signupSecret) {
    headers['x-internal-signup-secret'] = signupSecret
  }

  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)

    if (response.status === 409) {
      throw new BetterAuthUserExistsError(errorText || 'Better Auth user already exists.')
    }

    throw new BetterAuthRequestError(
      `Better Auth sign-up failed (${response.status}): ${errorText}`,
      response.status,
    )
  }

  const data = (await response.json().catch(() => null)) as {
    id?: string
    email?: string
    name?: string | null
  } | null

  if (!data?.id) {
    throw new BetterAuthRequestError(
      'Better Auth sign-up response missing user id.',
      response.status,
    )
  }

  return {
    id: data.id,
    email: data.email ?? email,
    name: data.name ?? name ?? null,
  }
}

export class BetterAuthUserExistsError extends BetterAuthRequestError {
  constructor(message: string = 'Better Auth user already exists.') {
    super(message, 409)
    this.name = 'BetterAuthUserExistsError'
  }
}

export const revokeBetterAuthTokens = async ({ token }: { token: string | null }) => {
  if (!token) {
    return
  }

  const baseUrl = getAuthBaseUrl()

  await fetch(new URL('/api/auth/oauth2/revoke', baseUrl).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token,
      client_id: getPayloadClientId(),
    }),
  }).catch(() => {
    // ignore revocation errors
  })

  await fetch(new URL('/api/auth/logout', baseUrl).toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {
    // swallow errors to avoid blocking logout flow
  })
}
