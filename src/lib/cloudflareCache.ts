import { requestJSON } from '../utils/http'

import { getCloudflareCacheApiToken, getCloudflareCacheZoneId } from './env'

type CloudflarePurgeResponse = {
  errors?: Array<{ code?: number; message?: string }>
  messages?: Array<{ code?: number; message?: string }>
  success?: boolean
}

const CLOUDFLARE_PURGE_CACHE_URL = 'https://api.cloudflare.com/client/v4/zones'

const normalizeCacheTags = (tags: Array<string | null | undefined>): string[] => {
  return Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => tag.length > 0),
    ),
  )
}

export const purgeCloudflareCacheTags = async (
  tags: Array<string | null | undefined>,
  label: string,
): Promise<void> => {
  const zoneId = getCloudflareCacheZoneId()
  const apiToken = getCloudflareCacheApiToken()
  const normalizedTags = normalizeCacheTags(tags)

  if (!zoneId || !apiToken || normalizedTags.length === 0) {
    return
  }

  try {
    const response = await requestJSON<CloudflarePurgeResponse>(
      `${CLOUDFLARE_PURGE_CACHE_URL}/${zoneId}/purge_cache`,
      {
        body: JSON.stringify({
          tags: normalizedTags,
        }),
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
      {
        credentials: 'omit',
      },
    )

    if (response.success === false) {
      console.error(
        `[cloudflare-cache] Failed to purge ${label} cache tags:`,
        response.errors ?? response.messages ?? response,
      )
    }
  } catch (error) {
    console.error(`[cloudflare-cache] Failed to purge ${label} cache tags:`, error)
  }
}
