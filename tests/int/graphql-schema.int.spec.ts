import { isEnumType } from 'graphql'
import { describe, expect, it } from 'vitest'

import { createHonoGraphQLSchema } from '../../shared/graphql/schema'

describe('GraphQL schema', () => {
  it('sanitizes invalid enum value names while preserving the stored value', () => {
    const schema = createHonoGraphQLSchema()
    const originType = schema.getType('BookOriginEnum')

    expect(isEnumType(originType)).toBe(true)

    if (!isEnumType(originType)) {
      throw new Error('Expected BookOriginEnum to be a GraphQL enum type.')
    }

    expect(originType.getValues()).toContainEqual(
      expect.objectContaining({
        name: 'epub_imported',
        value: 'epub-imported',
      }),
    )
  })
})
