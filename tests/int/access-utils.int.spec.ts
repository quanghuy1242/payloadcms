import { describe, expect, it } from 'vitest'

import { normalizeEntityId } from '@/utils/access'

describe('Access utilities', () => {
  it('preserves numeric identifiers as numbers', () => {
    expect(normalizeEntityId(42)).toBe(42)
    expect(normalizeEntityId('42')).toBe(42)
  })

  it('preserves non-numeric identifiers as strings', () => {
    expect(normalizeEntityId('book_abc')).toBe('book_abc')
  })

  it('reads id fields from nested objects', () => {
    expect(normalizeEntityId({ id: '7' })).toBe(7)
  })
})