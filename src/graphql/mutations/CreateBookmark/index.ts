import type { GraphQLFieldConfig } from 'graphql'

import { createBookmarkResolver } from './resolver'

export const CreateBookmark = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const bookmarkType = payload.collections['bookmarks']?.graphQL?.type

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'CreateBookmarkResult',
      fields: {
        bookmark: { type: bookmarkType },
        created: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      },
    }),
    args: {
      contentType: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      chapterId: { type: GraphQL.GraphQLID },
      bookId: { type: GraphQL.GraphQLID },
    },
    resolve: createBookmarkResolver,
  }
}
