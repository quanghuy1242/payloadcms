import { describe, expect, it } from 'vitest'

import { Books } from '@/collections/Books'
import { Chapters } from '@/collections/Chapters'

describe('Book admin config', () => {
  it('hides chapters from the admin navigation', () => {
    expect(Chapters.admin?.hidden).toBe(true)
  })

  it('wires the book chapter drawer and delete guard components', () => {
    const chapterField = Books.fields.find(
      (field) => 'name' in field && field.name === 'chapterList',
    )

    expect(chapterField).toMatchObject({
      admin: {
        components: {
          Field: '/components/admin/books/ChapterListButton',
        },
      },
      type: 'ui',
    })

    expect(Books.admin?.components?.edit?.beforeDocumentControls).toContain(
      '/components/admin/books/DeleteBookButton',
    )
  })
})