import type { Access } from 'payload'

export const publicReadAccess: Access = () => true

export const publishedPostsReadAccess: Access = ({ req: { user } }) => {
  if (user) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}

// Allow public reads only when the asset is tied to a published post
export const publishedMediaReadAccess: Access = async ({ req, data, id }) => {
  if (req.user) {
    return true
  }

  const mediaId = data?.id ?? id

  if (!mediaId) {
    return false
  }

  const mediaIdString = String(mediaId)

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
