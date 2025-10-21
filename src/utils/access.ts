import type { Access } from 'payload'

import { toNullableString } from './strings'

export const USER_ROLES = ['admin', 'user'] as const

export type UserRole = (typeof USER_ROLES)[number]

type AccessUser = {
  id?: string | number | null
  role?: UserRole | null
}

export const normalizeEntityId = (value: unknown): string | null => {
  if (typeof value === 'object' && value !== null) {
    if ('id' in value) {
      return toNullableString((value as { id?: unknown }).id)
    }
  }

  return toNullableString(value)
}

export const getUserId = (user?: AccessUser | null): string | null => {
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

  return Boolean(getUserId(req.user))
}

export const ownerAccess = (field: string): Access => {
  return ({ req }) => {
    if (isAdminUser(req.user)) {
      return true
    }

    const userId = getUserId(req.user)

    if (!userId) {
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

  if (!userId) {
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

  if (!userId) {
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

  if (userId) {
    return {
      owner: {
        equals: userId,
      },
    }
  }

  const mediaId = data?.id ?? id

  if (!mediaId) {
    return false
  }

  const mediaIdString = toNullableString(mediaId)

  if (!mediaIdString) {
    return false
  }

  const { docs } = await req.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    where: {
      and: [
        {
          _status: {
            equals: 'published',
          },
        },
        {
          or: [
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
            {
              content: {
                contains: `"id":${mediaIdString}`,
              },
            },
            {
              content: {
                contains: `"id":"${mediaIdString}"`,
              },
            },
          ],
        },
      ],
    },
  })

  return docs.length > 0
}
