import type { GraphQLFieldConfig } from 'graphql'

import { similarPostsResolver } from './resolver'

export const SimilarPosts = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const postsType = payload.collections['posts'].graphQL?.type

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'SimilarPostsResult',
      fields: {
        docs: {
          type: new GraphQL.GraphQLList(postsType as any),
        },
        totalDocs: { type: GraphQL.GraphQLInt },
      },
    }),
    args: {
      postId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      limit: {
        type: GraphQL.GraphQLInt,
        defaultValue: 4,
        description: 'Number of similar posts to return (1-10)',
      },
    },
    resolve: similarPostsResolver,
  }
}
