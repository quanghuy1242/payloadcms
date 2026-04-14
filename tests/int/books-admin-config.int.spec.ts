import { describe, expect, it } from 'vitest'

import { Books } from '@/collections/Books'
import { Chapters } from '@/collections/Chapters'

describe('Book admin config', () => {
  it('hides chapters from the admin navigation', () => {
    expect(Chapters.admin?.hidden).toBe(true)
  })

  it('wires the chapter list and delete controls into the edit header', () => {
    expect(Books.admin?.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/books/DeleteBookButton',
      '/components/admin/books/ChapterListButton',
    ])

    expect(Books.fields.some((field) => 'name' in field && field.name === 'chapterList')).toBe(
      false,
    )
  })
})