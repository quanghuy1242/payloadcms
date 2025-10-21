import type { Access } from 'payload'

import { toNullableString } from './strings'

export const USER_ROLES = ['admin', 'user'] as const

export type UserRole = (typeof USER_ROLES)[number]

type AccessUser = {
  id?: string | number | null
  role?: UserRole | null
}

export const normalizeEntityId = (value: unknown): string | number | null => {
  if (typeof value === 'object' && value !== null) {
    if ('id' in value) {
      return normalizeEntityId((value as { id?: unknown }).id)
    }
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length === 0) {
      return null
    }

    const numeric = Number(normalized)

    if (!Number.isNaN(numeric) && String(numeric) === normalized) {
      return numeric
    }

    return normalized
  }

  return null
}

export const getUserId = (user?: AccessUser | null): string | number | null => {
  if (!user) {
    return null
  }

  return normalizeEntityId(user.id)
}

export const isAdminUser = (user?: AccessUser | null): boolean => {
  return user?.role === 'admin'
}

export const publicReadAccess: Access = () => true

export const authenticatedAccess: Access = ({ req }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  return getUserId(req.user) != null
}

export const ownerAccess = (field: string): Access => {
  return ({ req }) => {
    if (isAdminUser(req.user)) {
      return true
    }

    const userId = getUserId(req.user)

    if (userId == null) {
      return false
    }

    return {
      [field]: {
        equals: userId,
      },
    }
  }
}

// @ts-ignore
export const postsReadAccess: Access = ({ req }) => {
  if (!req.user) {
    return {
      _status: {
        equals: 'published',
      },
    }
  }

  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  if (userId == null) {
    return false
  }

  return {
    author: {
      equals: userId,
    },
  }
}

export const categoriesReadAccess: Access = ({ req }) => {
  if (!req.user) {
    return true
  }

  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  if (userId == null) {
    return false
  }

  return {
    createdBy: {
      equals: userId,
    },
  }
}

// Allow public reads only when the asset is tied to a published post
export const publishedMediaReadAccess: Access = async ({ req, data, id }) => {
  if (isAdminUser(req.user)) {
    return true
  }

  const userId = getUserId(req.user)

  const mediaIdRaw = data?.id ?? id
  const mediaId = normalizeEntityId(mediaIdRaw)

  if (mediaId == null) {
    return false
  }

  const mediaRecord =
    data ??
    (await req.payload
      .findByID({
        collection: 'media',
        id: mediaId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null))

  const ownerId = normalizeEntityId(mediaRecord?.owner)

  if (userId != null && ownerId != null && String(ownerId) === String(userId)) {
    return true
  }

  const mediaIdString = toNullableString(mediaId)

  const postReferenceConditions = [
    {
      coverImage: {
        equals: mediaId,
      },
    },
    {
      'meta.image': {
        equals: mediaId,
      },
    },
    mediaIdString
      ? {
          content: {
            contains: `"id":${mediaIdString}`,
          },
        }
      : null,
    mediaIdString
      ? {
          content: {
            contains: `"id":"${mediaIdString}"`,
          },
        }
      : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  const isReferencedByPosts = await req.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: {
      // @ts-ignore
      or: postReferenceConditions,
    },
  })

  if (isReferencedByPosts.docs.length > 0) {
    return true
  }

  const isReferencedByCategories = await req.payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: {
      image: {
        equals: mediaId,
      },
    },
  })

  if (isReferencedByCategories.docs.length > 0) {
    return true
  }

  if (userId != null) {
    return {
      owner: {
        equals: userId,
      },
    }
  }

  return false
}
