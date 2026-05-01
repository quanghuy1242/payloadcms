import { GraphQL } from '@payloadcms/graphql/types'
import { describe, expect, it } from 'vitest'

import { BookExportChunk } from '@/graphql/queries/BookExportChunk'
import { BookExportManifest } from '@/graphql/queries/BookExportManifest'

describe('book export GraphQL schema', () => {
  it('builds a valid schema for the export queries', () => {
    const schema = new GraphQL.GraphQLSchema({
      query: new GraphQL.GraphQLObjectType({
        name: 'Query',
        fields: {
          bookExportManifest: BookExportManifest(GraphQL, {}),
          bookExportChunk: BookExportChunk(GraphQL, {}),
        },
      }),
    })

    expect(() => GraphQL.assertValidSchema(schema)).not.toThrow()
  })

  it('exposes chapter content as a JSON output scalar', () => {
    const resultType = BookExportChunk(GraphQL, {}).type
    const chunkType = GraphQL.getNamedType(resultType)

    expect(chunkType).toBeInstanceOf(GraphQL.GraphQLObjectType)

    if (!(chunkType instanceof GraphQL.GraphQLObjectType)) {
      throw new Error('Expected BookExportChunk to resolve to an object type')
    }

    const chapterType = GraphQL.getNamedType(chunkType.getFields().chapters.type)

    expect(chapterType).toBeInstanceOf(GraphQL.GraphQLObjectType)

    if (!(chapterType instanceof GraphQL.GraphQLObjectType)) {
      throw new Error('Expected chapters to resolve to an object type')
    }

    expect(GraphQL.getNamedType(chapterType.getFields().content.type).name).toBe('JSON')
  })
})
