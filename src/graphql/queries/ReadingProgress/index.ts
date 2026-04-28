import type { GraphQLFieldConfig } from 'graphql'

import { readingProgressResolver } from './resolver'

export const ReadingProgress = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'ReadingProgressResult',
      fields: {
        records: {
          type: new GraphQL.GraphQLList(
            new GraphQL.GraphQLObjectType({
              name: 'ReadingProgressRecord',
              fields: {
                chapterId: { type: GraphQL.GraphQLID },
                progress: { type: GraphQL.GraphQLFloat },
                completedAt: { type: GraphQL.GraphQLString },
                updatedAt: { type: GraphQL.GraphQLString },
              },
            }),
          ),
        },
      },
    }),
    args: {
      bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
    },
    resolve: readingProgressResolver,
  }
}
