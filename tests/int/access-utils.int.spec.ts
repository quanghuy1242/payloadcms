import { describe, expect, it } from 'vitest'

import { chaptersReadAccess, normalizeEntityId, publicBooksReadAccess } from '@/utils/access'

describe('Access utilities', () => {
  it('preserves numeric identifiers as numbers', () => {
    expect(normalizeEntityId(42)).toBe(42)
    expect(normalizeEntityId('42')).toBe(42)
  })

  it('preserves non-numeric identifiers as strings', () => {
    expect(normalizeEntityId('book_abc')).toBe('book_abc')
  })

  it('reads id fields from nested objects', () => {
    expect(normalizeEntityId({ id: '7' })).toBe(7)
  })

  it('allows anonymous users to read public published books only', () => {
    expect(publicBooksReadAccess({ req: { user: null } } as never)).toEqual({
      and: [
        {
          visibility: {
            equals: 'public',
          },
        },
        {
          _status: {
            equals: 'published',
          },
        },
      ],
    })
  })

  it('allows authors to read their own books and chapters', () => {
    expect(publicBooksReadAccess({ req: { user: { id: 9, role: 'user' } } } as never)).toEqual({
      or: [
        {
          and: [
            {
              visibility: {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 9,
          },
        },
      ],
    })

    expect(chaptersReadAccess({ req: { user: { id: '17', role: 'user' } } } as never)).toEqual({
      or: [
        {
          and: [
            {
              'book.visibility': {
                equals: 'public',
              },
            },
            {
              _status: {
                equals: 'published',
              },
            },
          ],
        },
        {
          createdBy: {
            equals: 17,
          },
        },
      ],
    })
  })
})