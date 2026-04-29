import { afterEach, describe, expect, it, vi } from 'vitest'

describe('getEpubExportBaseURL', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns the normalized request origin when provided', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.quanghuy.dev')

    const { getEpubExportBaseURL } = await import('@/utils/epubExport')

    expect(getEpubExportBaseURL('https://preview.quanghuy.dev/')).toBe('https://preview.quanghuy.dev')
  })

  it('falls back to NEXT_PUBLIC_SITE_URL via the env layer', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.quanghuy.dev/')

    const { getEpubExportBaseURL } = await import('@/utils/epubExport')

    expect(getEpubExportBaseURL()).toBe('https://cms.quanghuy.dev')
  })

  it('falls back to VERCEL_URL when NEXT_PUBLIC_SITE_URL is unset', async () => {
    vi.stubEnv('VERCEL_URL', 'cms-preview.vercel.app/')

    const { getEpubExportBaseURL } = await import('@/utils/epubExport')

    expect(getEpubExportBaseURL()).toBe('https://cms-preview.vercel.app')
  })

  it('falls back to localhost when no public site env is set', async () => {
    const { getEpubExportBaseURL } = await import('@/utils/epubExport')

    expect(getEpubExportBaseURL()).toBe('http://localhost:3000')
  })
})
