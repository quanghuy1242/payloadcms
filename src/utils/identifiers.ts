import { toNullableString } from './strings'

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
