import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  buildBookCacheTags,
  buildBookDetailCacheTags,
  buildBookPurgeTags,
  buildBookSlugCacheTags,
  buildBooksListCacheTags,
  buildChapterPageCacheTags,
  buildChapterPageLookupCacheTags,
  buildChapterPurgeTags,
  buildChapterSlugCacheTags,
  buildChaptersByBookCacheTags,
  normalizeCacheTags,
} from '@/utils/books'
import { purgeCloudflareCacheTags } from '@/lib/cloudflareCache'

beforeAll(() => {
  process.env.CLOUDFLARE_CACHE_ZONE_ID = 'zone-123'
  process.env.CLOUDFLARE_CACHE_API_TOKEN = 'api-token-123'
})

afterAll(() => {
  delete process.env.CLOUDFLARE_CACHE_ZONE_ID
  delete process.env.CLOUDFLARE_CACHE_API_TOKEN
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Cloudflare cache tags', () => {
  it('normalizes and deduplicates tags', () => {
    expect(normalizeCacheTags([' books:list ', 'books:list', '', null, undefined, 'book:1'])).toEqual([
      'books:list',
      'book:1',
    ])
  })

  it('builds the book and chapter tag sets', () => {
    expect(buildBooksListCacheTags()).toEqual(['books:list'])
    expect(buildBookCacheTags(42)).toEqual(['book:42'])
    expect(buildBookSlugCacheTags(' sample-book ')).toEqual(['book:slug:sample-book'])
    expect(buildBookDetailCacheTags(42)).toEqual(['book:42', 'chapters:book:42'])
    expect(buildChaptersByBookCacheTags(42)).toEqual(['chapters:book:42'])
    expect(buildChapterPageCacheTags(42, 7)).toEqual(['book:42', 'chapter:7', 'chapters:book:42'])
    expect(buildChapterSlugCacheTags(' chapter-seven ')).toEqual(['chapter:slug:chapter-seven'])
    expect(buildChapterPageLookupCacheTags(42, ' chapter-seven ')).toEqual([
      'chapter-page:book:42:chapter-seven',
      'book:42',
      'chapter:slug:chapter-seven',
      'chapters:book:42',
    ])
  })

  it('builds purge tags for books and chapters', () => {
    expect(buildBookPurgeTags(42)).toEqual(['books:list', 'book:42', 'chapters:book:42'])
    expect(buildChapterPurgeTags({ bookId: 42, chapterId: 7 })).toEqual([
      'books:list',
      'book:42',
      'chapter:7',
      'chapters:book:42',
    ])
    expect(
      buildChapterPurgeTags({
        bookId: 42,
        chapterId: 7,
        previousBookId: 99,
      }),
    ).toEqual(['books:list', 'book:42', 'chapter:7', 'chapters:book:42', 'book:99', 'chapters:book:99'])
  })
})

describe('Cloudflare cache purge', () => {
  it('posts cache tags to Cloudflare', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(purgeCloudflareCacheTags([' books:list ', 'book:42', 'book:42'], 'books')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache')
    expect(init).toEqual(
      expect.objectContaining({
        credentials: 'omit',
        method: 'POST',
      }),
    )

    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer api-token-123',
        'Content-Type': 'application/json',
      }),
    )

    expect(JSON.parse(String(init.body))).toEqual({
      tags: ['books:list', 'book:42'],
    })
  })

  it('logs API failures without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ message: 'Denied' }] }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(purgeCloudflareCacheTags(['book:42'], 'books')).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
