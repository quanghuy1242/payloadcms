import type { GraphQLFieldConfig } from 'graphql'

import { unlockChapterPasswordResolver } from './resolver'

export const UnlockChapterPassword = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'UnlockChapterPasswordResult',
      fields: {
        chapterId: {
          type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID),
        },
        expiresAt: {
          type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString),
        },
        proof: {
          type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString),
        },
      },
    }),
    args: {
      chapterId: {
        type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID),
      },
      password: {
        type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString),
      },
    },
    resolve: unlockChapterPasswordResolver,
  }
}
