import type { GraphQLFieldConfig } from 'graphql'

import { bookExportChunkResolver } from './resolver'

export const BookExportChunk = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  const ChapterType = new GraphQL.GraphQLObjectType({
    name: 'BookExportChunkChapter',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      order: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      title: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      content: { type: GraphQL.GraphQLJSON },
    },
  })

  const MediaType = new GraphQL.GraphQLObjectType({
    name: 'BookExportChunkMedia',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      filename: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      mimeType: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      url: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      optimizedUrl: { type: GraphQL.GraphQLString },
      alt: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
    },
  })

  const ResultType = new GraphQL.GraphQLObjectType({
    name: 'BookExportChunkResult',
    fields: {
      page: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      totalPages: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      chapters: {
        type: new GraphQL.GraphQLNonNull(
          new GraphQL.GraphQLList(new GraphQL.GraphQLNonNull(ChapterType)),
        ),
      },
      media: {
        type: new GraphQL.GraphQLNonNull(
          new GraphQL.GraphQLList(new GraphQL.GraphQLNonNull(MediaType)),
        ),
      },
    },
  })

  return {
    type: ResultType,
    args: {
      bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      page: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      limit: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
    },
    resolve: bookExportChunkResolver,
  }
}
