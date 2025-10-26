import type { Payload } from 'payload'

import type { User } from '../../payload-types'
import type { BetterAuthTokenPayload } from './tokens'

const USERS_COLLECTION = 'users'

const isNonNullString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

type UpsertBetterAuthUserArgs = {
  payload: Payload
  token: BetterAuthTokenPayload
}

const normalizeBetterAuthRole = (value: BetterAuthTokenPayload['roles']): string[] => {
  if (Array.isArray(value)) {
    return value.map((role) => role.trim()).filter((role) => role.length > 0)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
  }

  return []
}

const pickPreferredRole = (roles: string[]): User['role'] | null => {
  if (roles.length === 0) {
    return null
  }

  if (roles.some((role) => role === 'admin')) {
    return 'admin'
  }

  if (roles.some((role) => role === 'user')) {
    return 'user'
  }

  return null
}

const updateUserIfNecessary = async ({
  payload,
  user,
  updates,
}: {
  payload: Payload
  user: User
  updates: Partial<User>
}): Promise<User> => {
  if (Object.keys(updates).length === 0) {
    return user
  }

  return (await payload.update({
    collection: USERS_COLLECTION,
    id: user.id,
    data: updates,
    overrideAccess: true,
    depth: 0,
  })) as User
}

export const upsertBetterAuthUser = async ({
  payload,
  token,
}: UpsertBetterAuthUserArgs): Promise<User> => {
  const betterAuthUserId = token.sub

  if (!isNonNullString(betterAuthUserId)) {
    throw new Error('Better Auth token payload missing subject (sub).')
  }

  const existingById = await payload.find({
    collection: USERS_COLLECTION,
    where: {
      betterAuthUserId: {
        equals: betterAuthUserId,
      },
    },
    limit: 1,
    depth: 0,
  })

  const existingUser = existingById.docs[0] as User | undefined

  const tokenEmail = isNonNullString(token.email) ? token.email.trim().toLowerCase() : null
  const tokenName = isNonNullString(token.name) ? token.name.trim() : null

  const rolesFromToken = pickPreferredRole(normalizeBetterAuthRole(token.roles))

  if (existingUser) {
    const updates: Partial<User> = {}

    if (!existingUser.email && tokenEmail) {
      updates.email = tokenEmail
    }

    if ((!existingUser.fullName || existingUser.fullName.trim().length === 0) && tokenName) {
      updates.fullName = tokenName
    }

    if (!existingUser.betterAuthUserId) {
      updates.betterAuthUserId = betterAuthUserId
    }

    if (rolesFromToken === 'admin' && existingUser.role !== 'admin') {
      updates.role = 'admin'
    }

    return updateUserIfNecessary({ payload, user: existingUser, updates })
  }

  if (!tokenEmail) {
    throw new Error('Better Auth token did not include an email address. Unable to create user.')
  }

  const existingByEmail = await payload.find({
    collection: USERS_COLLECTION,
    where: {
      email: {
        equals: tokenEmail,
      },
    },
    limit: 1,
    depth: 0,
  })

  const emailMatch = existingByEmail.docs[0] as User | undefined

  if (emailMatch) {
    const updates: Partial<User> = {}

    if (!emailMatch.betterAuthUserId) {
      updates.betterAuthUserId = betterAuthUserId
    }

    if ((!emailMatch.fullName || emailMatch.fullName.trim().length === 0) && tokenName) {
      updates.fullName = tokenName
    }

    if (rolesFromToken === 'admin' && emailMatch.role !== 'admin') {
      updates.role = 'admin'
    }

    return updateUserIfNecessary({
      payload,
      user: emailMatch,
      updates,
    })
  }

  const role: User['role'] = rolesFromToken === 'admin' ? 'admin' : 'user'

  return (await payload.create({
    collection: USERS_COLLECTION,
    data: {
      email: tokenEmail,
      fullName: tokenName ?? tokenEmail,
      role,
      betterAuthUserId,
    },
    overrideAccess: true,
    depth: 0,
  })) as User
}
