import type { PayloadRequest } from 'payload'

import {
  buildCloudflareImageUrl,
  normalizeCloudflareImageFit,
  resolveMediaAssetPath,
  type CloudflareImageFit,
} from '../../../lib/cloudflareImages'
import type { Media as MediaDocument, Post } from '../../../payload-types'

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export type PostsCoverImageTransformsArgs = {
  fit?: string | null
  format?: string | null
  height?: number | null
  ids: (string | number)[]
  quality?: number | null
  width?: number | null
}

export type PostsCoverImageTransformsContext = {
  req: PayloadRequest
}

type CloudflareDefaults = {
  baseUrl: string
  defaultFit: CloudflareImageFit
  defaultFormat: string
  defaultQuality: number
  defaultWidth: number
}

const DEFAULT_PREVIEW_WIDTH = parsePositiveInt(process.env.CLOUDFLARE_IMAGE_PREVIEW_WIDTH, 32)
const DEFAULT_PREVIEW_QUALITY = Math.min(
  100,
  Math.max(10, parsePositiveInt(process.env.CLOUDFLARE_IMAGE_PREVIEW_QUALITY, 60)),
)
const DEFAULT_PREVIEW_FORMAT = process.env.CLOUDFLARE_IMAGE_PREVIEW_FORMAT || 'webp'
const DEFAULT_PREVIEW_FIT =
  normalizeCloudflareImageFit(process.env.CLOUDFLARE_IMAGE_PREVIEW_FIT) ?? 'cover'
const CLOUDFLARE_IMAGE_BASE_URL = process.env.CLOUDFLARE_IMAGE_BASE_URL ?? ''

export const cloudflareImageDefaults: CloudflareDefaults = {
  baseUrl: CLOUDFLARE_IMAGE_BASE_URL,
  defaultFit: DEFAULT_PREVIEW_FIT,
  defaultFormat: DEFAULT_PREVIEW_FORMAT,
  defaultQuality: DEFAULT_PREVIEW_QUALITY,
  defaultWidth: DEFAULT_PREVIEW_WIDTH,
}

const toNullableString = (value: unknown): string | null => {
  if (value == null) {
    return null
  }

  const stringified = value.toString()

  return stringified.length > 0 ? stringified : null
}

const sanitizeIds = (ids: (string | number)[]): string[] => {
  return Array.from(
    new Set(
      ids
        .map((value) => {
          if (typeof value === 'number' || typeof value === 'string') {
            return toNullableString(value)
          }

          return null
        })
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export const createPostsCoverImageTransformsResolver =
  (defaults: CloudflareDefaults) =>
  async (
    _parent: unknown,
    args: PostsCoverImageTransformsArgs,
    context: PostsCoverImageTransformsContext,
  ) => {
    if (!defaults.baseUrl) {
      throw new Error('CLOUDFLARE_IMAGE_BASE_URL must be set to use postsCoverImageTransforms.')
    }

    const { req } = context

    if (!req?.payload) {
      throw new Error('Missing Payload request context for GraphQL resolver.')
    }

    const ids = sanitizeIds(args.ids)

    if (ids.length === 0) {
      return []
    }

    const postsResult = await req.payload.find({
      collection: 'posts',
      depth: 1,
      limit: ids.length,
      overrideAccess: false,
      pagination: false,
      req,
      where: {
        id: {
          in: ids,
        },
      },
    })

    const postsById = new Map<string, Post>(
      postsResult.docs.map((doc) => [doc.id != null ? doc.id.toString() : '', doc]),
    )

    const requestedWidth =
      typeof args.width === 'number' && Number.isFinite(args.width) && args.width > 0
        ? Math.round(args.width)
        : defaults.defaultWidth

    const requestedHeight =
      typeof args.height === 'number' && Number.isFinite(args.height) && args.height > 0
        ? Math.round(args.height)
        : null

    const requestedQuality =
      typeof args.quality === 'number' && Number.isFinite(args.quality)
        ? Math.min(100, Math.max(10, Math.round(args.quality)))
        : defaults.defaultQuality

    const requestedFormat =
      typeof args.format === 'string' && args.format.trim().length > 0
        ? args.format
        : defaults.defaultFormat

    const requestedFit: CloudflareImageFit =
      normalizeCloudflareImageFit(args.fit) ?? defaults.defaultFit

    return ids.map((id) => {
      const postDoc = postsById.get(id)

      const baseResult = {
        directives: null as string | null,
        error: null as string | null,
        fit: requestedFit,
        format: requestedFormat,
        height: requestedHeight,
        mediaId: null as string | null,
        postId: id,
        quality: requestedQuality,
        sourceUrl: null as string | null,
        url: null as string | null,
        width: requestedWidth,
      }

      if (!postDoc) {
        return {
          ...baseResult,
          error: 'POST_NOT_FOUND',
        }
      }

      const coverImageData =
        typeof postDoc.coverImage === 'object' && postDoc.coverImage !== null
          ? (postDoc.coverImage as MediaDocument & { prefix?: string | null; bucket?: string | null })
          : null

      if (!coverImageData) {
        return {
          ...baseResult,
          error: 'COVER_IMAGE_MISSING',
        }
      }

      baseResult.mediaId = coverImageData.id != null ? coverImageData.id.toString() : null
      baseResult.sourceUrl = coverImageData.url ?? null

      let assetPath: string | null = null

      try {
        assetPath = resolveMediaAssetPath(coverImageData, defaults.baseUrl)
      } catch (error) {
        return {
          ...baseResult,
          error: error instanceof Error ? error.message : 'ASSET_PATH_UNAVAILABLE',
        }
      }

      if (!assetPath) {
        return {
          ...baseResult,
          error: 'ASSET_PATH_UNAVAILABLE',
        }
      }

      try {
        const { directives, normalizedOptions, url } = buildCloudflareImageUrl(
          defaults.baseUrl,
          assetPath,
          {
            fit: requestedFit,
            format: requestedFormat,
            height: requestedHeight,
            quality: requestedQuality,
            width: requestedWidth,
          },
        )

        return {
          ...baseResult,
          directives,
          error: null,
          fit: normalizedOptions.fit ?? requestedFit,
          format: normalizedOptions.format,
          height: normalizedOptions.height ?? requestedHeight,
          quality: normalizedOptions.quality,
          url,
          width: normalizedOptions.width ?? requestedWidth,
        }
      } catch (error) {
        return {
          ...baseResult,
          error: error instanceof Error ? error.message : 'TRANSFORM_FAILED',
        }
      }
    })
  }

