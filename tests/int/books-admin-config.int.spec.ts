import { describe, expect, it } from 'vitest'

import { Books } from '@/collections/Books'
import { Chapters } from '@/collections/Chapters'
import { chaptersReadAccess, publicBooksReadAccess } from '@/utils/access'

describe('Book admin config', () => {
  it('hides chapters from the admin navigation', () => {
    expect(Chapters.admin?.hidden).toBe(true)
  })

  it('wires the chapter list and delete controls into the edit header', () => {
    expect(Books.admin?.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/books/DeleteBookButton',
      '/components/admin/books/ChapterListButton',
      '/components/admin/books/BookAccessPanel',
    ])

    expect(Books.access?.read).toBe(publicBooksReadAccess)
    expect(Chapters.access?.read).toBe(chaptersReadAccess)

    expect(Books.fields.some((field) => 'name' in field && field.name === 'visibility')).toBe(true)
    expect(Chapters.fields.some((field) => 'name' in field && field.name === 'password')).toBe(true)
    expect(Chapters.fields.some((field) => 'name' in field && field.name === 'hasPassword')).toBe(true)
  })
})