import type { Access } from 'payload'

import { normalizeEntityId } from './identifiers'

type AccessUser = {
  id?: string | number | null
  role?: 'admin' | 'user' | null
}

export const getUserId = (user?: AccessUser | null): string | number | null => {
  if (!user) {
    return null
  }

  return normalizeEntityId(user.id)
}

export const isAdminUser = (user?: AccessUser | null): boolean => {
  return user?.role === 'admin'
}

export const ownerAccess = (field: string): Access => {
  return ({ req }) => {
    if (isAdminUser(req.user)) {
      return true
    }

    const userId = getUserId(req.user)

    if (userId == null) {
      return false
    }

    return {
      [field]: {
        equals: userId,
      },
    }
  }
}