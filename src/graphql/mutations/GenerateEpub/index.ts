import type { GraphQLFieldConfig } from 'graphql'

import { generateEpubResolver } from './resolver'

export const GenerateEpub = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => ({
  type: new GraphQL.GraphQLObjectType({
    name: 'GenerateEpubResult',
    fields: {
      downloadUrl: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      filename: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      expiresAt: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
    },
  }),
  args: {
    bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
  },
  resolve: generateEpubResolver,
})
