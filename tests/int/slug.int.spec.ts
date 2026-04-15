import { describe, expect, it } from 'vitest'

import { createRandomizedSlugHook, formatSlug } from '@/utils/slug'

describe('slug utilities', () => {
  it('formats locale-aware slugs', () => {
    expect(formatSlug('Đắk Lắk', 'vi')).toBe('dak-lak')
    expect(formatSlug('Đắk Lắk', 'en')).toBe('djak-lak')
  })

  it('uses the configured locale field when generating randomized slugs', () => {
    const hook = createRandomizedSlugHook('title', {
      defaultLocale: 'en',
      localeField: 'language',
      randomLength: 6,
    })

    const vietnameseResult = hook({
      data: {
        language: 'vi',
        title: 'Đắk Lắk',
      },
      operation: 'create',
    } as any) as { slug?: string }

    const englishResult = hook({
      data: {
        language: 'en',
        title: 'Đắk Lắk',
      },
      operation: 'create',
    } as any) as { slug?: string }

    // Verify Vietnamese locale formatting with random suffix (dak-lak + 6 hex chars)
    expect(vietnameseResult.slug).toMatch(/^dak-lak-[a-f0-9]{6}$/)
    // Verify English locale formatting with random suffix (djak-lak + 6 hex chars)
    expect(englishResult.slug).toMatch(/^djak-lak-[a-f0-9]{6}$/)
  })
})
