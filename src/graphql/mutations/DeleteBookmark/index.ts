import type { GraphQLFieldConfig } from 'graphql'

import { deleteBookmarkResolver } from './resolver'

export const DeleteBookmark = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'DeleteBookmarkResult',
      fields: {
        ok: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLBoolean) },
      },
    }),
    args: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
    },
    resolve: deleteBookmarkResolver,
  }
}
