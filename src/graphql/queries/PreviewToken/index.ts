import type { GraphQLFieldConfig } from 'graphql'

import { previewTokenResolver } from './resolver'

export const PreviewToken = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'PreviewTokenResult',
      fields: {
        token: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
        slug: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      },
    }),
    args: {
      docType: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      docId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
    },
    resolve: previewTokenResolver,
  }
}
