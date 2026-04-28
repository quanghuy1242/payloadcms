import type { GraphQLFieldConfig } from 'graphql'

import { saveReadingProgressResolver } from './resolver'

export const SaveReadingProgress = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const readingProgressType = payload.collections['reading-progress']?.graphQL?.type

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'SaveReadingProgressResult',
      fields: {
        ok: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
        progress: { type: readingProgressType },
      },
    }),
    args: {
      chapterId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      progress: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLFloat) },
    },
    resolve: saveReadingProgressResolver,
  }
}
