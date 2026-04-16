import { toNullableString } from './strings'

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

export const sanitizeIdentifiers = (values: Iterable<unknown>): string[] => {
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = toNullableString(value)

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
  }

  return Array.from(seen)
}
