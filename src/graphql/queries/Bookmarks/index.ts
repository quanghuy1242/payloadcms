import type { GraphQLFieldConfig } from 'graphql'

import { bookmarksResolver } from './resolver'

export const Bookmarks = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  const bookmarkType = payload.collections['bookmarks']?.graphQL?.type

  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'BookmarksResult',
      fields: {
        docs: { type: new GraphQL.GraphQLList(bookmarkType) },
        totalDocs: { type: GraphQL.GraphQLInt },
      },
    }),
    args: {
      contentType: { type: GraphQL.GraphQLString },
      contentId: { type: GraphQL.GraphQLID },
      limit: { type: GraphQL.GraphQLInt, defaultValue: 50 },
      page: { type: GraphQL.GraphQLInt, defaultValue: 1 },
    },
    resolve: bookmarksResolver,
  }
}
