import type { GraphQLExtension } from 'payload'

import { createPostsCoverImageTransformsQuery } from './postsCoverImageTransforms'

export const createQueriesExtension: GraphQLExtension = (GraphQL, _context) => {
  return {
    ...createPostsCoverImageTransformsQuery(GraphQL),
  }
}
