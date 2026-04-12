import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestJSON, requestJSONWithRetry } from '@/utils/http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('HTTP utilities', () => {
  it('parses successful JSON responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(requestJSON<{ success: boolean }>('/api/test')).resolves.toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a useful error message for failed JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Nope' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ),
    )

    await expect(requestJSON('/api/test')).rejects.toThrow('Nope')
  })

  it('retries server errors and reports retry attempts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Temporary failure' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const onRetry = vi.fn()

    await expect(
      requestJSONWithRetry<{ ok: boolean }>('/api/test', {}, { onRetry, retryDelayMs: 0, retries: 1 }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(1, 1)
  })
})