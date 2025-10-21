import type { GraphQLObjectType } from 'graphql'

import type { CloudflareImageFit } from '../../../lib/cloudflareImages'
import {
  cloudflareImageDefaults,
  createPostsCoverImageTransformsResolver,
  type PostsCoverImageTransformsArgs,
  type PostsCoverImageTransformsContext,
} from './resolver'

let postsCoverImageTransformType: GraphQLObjectType | null = null

const getPostsCoverImageTransformType = (GraphQL: typeof import('graphql')) => {
  if (!postsCoverImageTransformType) {
    const { GraphQLID, GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } = GraphQL

    postsCoverImageTransformType = new GraphQLObjectType({
      name: 'PostCoverImageTransform',
      fields: {
        postId: { type: new GraphQLNonNull(GraphQLID) },
        mediaId: { type: GraphQLID },
        url: { type: GraphQLString },
        sourceUrl: { type: GraphQLString },
        directives: { type: GraphQLString },
        width: { type: GraphQLInt },
        height: { type: GraphQLInt },
        quality: { type: GraphQLInt },
        format: { type: GraphQLString },
        fit: { type: GraphQLString },
        error: { type: GraphQLString },
      },
    })
  }

  return postsCoverImageTransformType
}

type PostsCoverImageQueryConfig = Record<
  'postsCoverImageTransforms',
  {
    args: Record<string, unknown>
    resolve: (
      parent: unknown,
      args: PostsCoverImageTransformsArgs,
      context: PostsCoverImageTransformsContext,
    ) => Promise<unknown>
    type: unknown
  }
>

export const createPostsCoverImageTransformsQuery = (
  GraphQL: typeof import('graphql'),
): PostsCoverImageQueryConfig => {
  const { GraphQLID, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } = GraphQL

  const type = getPostsCoverImageTransformType(GraphQL)
  const resolver = createPostsCoverImageTransformsResolver(cloudflareImageDefaults)

  return {
    postsCoverImageTransforms: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))),
      args: {
        ids: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLID))),
        },
        width: {
          type: GraphQLInt,
          defaultValue: cloudflareImageDefaults.defaultWidth,
        },
        height: {
          type: GraphQLInt,
        },
        format: {
          type: GraphQLString,
          defaultValue: cloudflareImageDefaults.defaultFormat,
        },
        quality: {
          type: GraphQLInt,
          defaultValue: cloudflareImageDefaults.defaultQuality,
        },
        fit: {
          type: GraphQLString,
          defaultValue: cloudflareImageDefaults.defaultFit as CloudflareImageFit,
        },
      },
      resolve: resolver,
    },
  }
}

