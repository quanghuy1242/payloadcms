import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Auther env', () => {
  afterEach(() => {
    delete process.env.AUTHER_AUTHORIZATION_SPACE_ID
    delete process.env.AUTHER_AUTHORIZATION_SPACE_SLUG
    vi.resetModules()
  })

  it('returns null when R2 authorization space metadata is not configured', async () => {
    const {
      getAutherAuthorizationSpaceId,
      getAutherAuthorizationSpaceSlug,
    } = await import('@/lib/env')

    expect(getAutherAuthorizationSpaceId()).toBeNull()
    expect(getAutherAuthorizationSpaceSlug()).toBeNull()
  })

  it('parses optional R2 authorization space metadata', async () => {
    process.env.AUTHER_AUTHORIZATION_SPACE_ID = 'space_payload_content'
    process.env.AUTHER_AUTHORIZATION_SPACE_SLUG = 'payload-content'

    const {
      getAutherAuthorizationSpaceId,
      getAutherAuthorizationSpaceSlug,
    } = await import('@/lib/env')

    expect(getAutherAuthorizationSpaceId()).toBe('space_payload_content')
    expect(getAutherAuthorizationSpaceSlug()).toBe('payload-content')
  })
})
