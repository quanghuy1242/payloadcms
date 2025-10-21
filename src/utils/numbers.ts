export const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

export const clampNumber = (value: number, min: number, max: number): number => {
  if (min > max) {
    throw new Error('clampNumber received a minimum greater than the maximum.')
  }

  if (value < min) {
    return min
  }

  if (value > max) {
    return max
  }

  return value
}

export const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()

    if (!trimmed) {
      return null
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export const toPositiveInteger = (value: unknown): number | null => {
  const numericValue = toFiniteNumber(value)

  if (numericValue == null) {
    return null
  }

  const rounded = Math.round(numericValue)

  return rounded > 0 ? rounded : null
}

export const sanitizeDimension = (value: unknown, max = 5000): number | null => {
  const positive = toPositiveInteger(value)

  if (positive == null) {
    return null
  }

  return Math.min(positive, max)
}

export const sanitizeQuality = (
  value: unknown,
  options?: {
    max?: number
    min?: number
  },
): number | null => {
  const numericValue = toFiniteNumber(value)

  if (numericValue == null) {
    return null
  }

  const { min = 10, max = 100 } = options ?? {}

  return clampNumber(Math.round(numericValue), min, max)
}
