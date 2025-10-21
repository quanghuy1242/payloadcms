import type { GraphQLObjectType } from 'graphql'

import type { CloudflareImageConfig } from '../../../lib/env'
import {
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
  defaults: CloudflareImageConfig,
): PostsCoverImageQueryConfig => {
  const { GraphQLID, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } = GraphQL

  const type = getPostsCoverImageTransformType(GraphQL)
  const resolver = createPostsCoverImageTransformsResolver(defaults)

  return {
    postsCoverImageTransforms: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))),
      args: {
        ids: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLID))),
        },
        width: {
          type: GraphQLInt,
          defaultValue: defaults.defaultWidth,
        },
        height: {
          type: GraphQLInt,
        },
        format: {
          type: GraphQLString,
          defaultValue: defaults.defaultFormat,
        },
        quality: {
          type: GraphQLInt,
          defaultValue: defaults.defaultQuality,
        },
        fit: {
          type: GraphQLString,
          defaultValue: defaults.defaultFit,
        },
      },
      resolve: resolver,
    },
  }
}
