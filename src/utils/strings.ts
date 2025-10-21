export const toNullableString = (value: unknown): string | null => {
  if (value == null) {
    return null
  }

  const normalized = value.toString().trim()

  return normalized.length > 0 ? normalized : null
}

export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0
}
