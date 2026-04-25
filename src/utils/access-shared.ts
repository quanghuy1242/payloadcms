import type { Access } from 'payload'

import { getUserId, isAdminUser, normalizeEntityId } from '../../shared/auth/identity'

export { getUserId, isAdminUser, normalizeEntityId }

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
