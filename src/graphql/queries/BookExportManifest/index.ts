import type { GraphQLFieldConfig } from 'graphql'

import { bookExportManifestResolver } from './resolver'

export const BookExportManifest = (GraphQL: any, _payload: any): GraphQLFieldConfig<any, any> => {
  const CoverType = new GraphQL.GraphQLObjectType({
    name: 'BookExportManifestCover',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      filename: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      mimeType: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      url: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      optimizedUrl: { type: GraphQL.GraphQLString },
      alt: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
    },
  })

  const BookType = new GraphQL.GraphQLObjectType({
    name: 'BookExportManifestBook',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      title: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      slug: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      author: { type: GraphQL.GraphQLString },
      description: { type: GraphQL.GraphQLString },
      language: { type: GraphQL.GraphQLString },
      publisher: { type: GraphQL.GraphQLString },
      publicationDate: { type: GraphQL.GraphQLString },
      isbn: { type: GraphQL.GraphQLString },
      epubVersion: { type: GraphQL.GraphQLString },
      updatedAt: { type: GraphQL.GraphQLString },
      cover: { type: CoverType },
    },
  })

  const ChapterIndexEntryType = new GraphQL.GraphQLObjectType({
    name: 'BookExportManifestChapterIndexEntry',
    fields: {
      id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
      order: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      title: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      slug: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      chapterSourceKey: { type: GraphQL.GraphQLString },
    },
  })

  const ResultType = new GraphQL.GraphQLObjectType({
    name: 'BookExportManifestResult',
    fields: {
      filename: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
      pageSize: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      totalChapters: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      totalPages: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLInt) },
      book: { type: new GraphQL.GraphQLNonNull(BookType) },
      chapterIndex: {
        type: new GraphQL.GraphQLNonNull(
          new GraphQL.GraphQLList(new GraphQL.GraphQLNonNull(ChapterIndexEntryType)),
        ),
      },
    },
  })

  return {
    type: ResultType,
    args: {
      bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLID) },
    },
    resolve: bookExportManifestResolver,
  }
}
