export type SharedUserIdentity = {
  id?: string | number | null
  role?: 'admin' | 'user' | null
}

export const normalizeEntityId = (value: unknown): string | number | null => {
  if (typeof value === 'object' && value !== null) {
    if ('id' in value) {
      return normalizeEntityId((value as { id?: unknown }).id)
    }
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const normalized = value.trim()

    if (normalized.length === 0) {
      return null
    }

    const numeric = Number(normalized)

    if (!Number.isNaN(numeric) && String(numeric) === normalized) {
      return numeric
    }

    return normalized
  }

  return null
}

export const getUserId = (user?: SharedUserIdentity | null): string | number | null => {
  if (!user) {
    return null
  }

  return normalizeEntityId(user.id)
}

export const isAdminUser = (user?: SharedUserIdentity | null): boolean => {
  return user?.role === 'admin'
}
