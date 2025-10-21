import type { GraphQLExtension } from 'payload'

import type { CloudflareImageConfig } from '../../lib/env'
import { createPostsCoverImageTransformsQuery } from './postsCoverImageTransforms'

export const createQueriesExtension =
  (defaults: CloudflareImageConfig): GraphQLExtension =>
  (GraphQL, _context) => {
    return {
      ...createPostsCoverImageTransformsQuery(GraphQL, defaults),
    }
  }
