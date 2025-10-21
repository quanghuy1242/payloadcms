import type { PayloadRequest } from 'payload'

import {
  buildCloudflareImageUrl,
  normalizeCloudflareImageFit,
  resolveMediaAssetPath,
  type CloudflareImageFit,
  type MediaWithStorageMeta,
} from '../../../lib/cloudflareImages'
import type { CloudflareImageConfig } from '../../../lib/env'
import type { Post } from '../../../payload-types'
import { sanitizeIdentifiers } from '../../../utils/identifiers'
import { sanitizeDimension, sanitizeQuality } from '../../../utils/numbers'
import { toNullableString } from '../../../utils/strings'

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

export const createPostsCoverImageTransformsResolver =
  (defaults: CloudflareImageConfig) =>
  async (
    _parent: unknown,
    args: PostsCoverImageTransformsArgs,
    context: PostsCoverImageTransformsContext,
  ) => {
    const { req } = context

    if (!req?.payload) {
      throw new Error('Missing Payload request context for GraphQL resolver.')
    }

    const ids = sanitizeIdentifiers(args.ids)

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

    const requestedWidth = sanitizeDimension(args.width) ?? defaults.defaultWidth
    const requestedHeight = sanitizeDimension(args.height) ?? null
    const requestedQuality = sanitizeQuality(args.quality) ?? defaults.defaultQuality
    const requestedFormat = toNullableString(args.format) ?? defaults.defaultFormat

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
          ? (postDoc.coverImage as MediaWithStorageMeta)
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
