import { describe, expect, it } from 'vitest'

import { Books } from '@/collections/Books'
import { Chapters } from '@/collections/Chapters'
import { Posts } from '@/collections/Posts'
import { chaptersReadAccess, publicBooksReadAccess } from '@/utils/access'

describe('Book admin config', () => {
  it('hides chapters from the admin navigation', () => {
    expect(Chapters.admin?.hidden).toBe(true)
  })

  it('wires the chapter list, delete, and preview controls into the edit header', () => {
    expect(Books.admin?.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/books/DeleteBookButton',
      '/components/admin/books/ChapterListButton',
      '/components/admin/books/BookAccessPanel',
      '/components/admin/books/ReconcileGrantsButton',
      '/components/admin/PreviewOnBlogButton',
    ])

    expect(Books.access?.read).toBe(publicBooksReadAccess)
    expect(Chapters.access?.read).toBe(chaptersReadAccess)
    expect(Chapters.admin?.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/chapters/ChapterEditAccessNotice',
    ])

    expect(Books.fields.some((field) => 'name' in field && field.name === 'visibility')).toBe(true)
    expect(
      Chapters.fields.find((field) => 'name' in field && field.name === 'password')?.admin?.components?.Field,
    ).toBe('@/components/admin/chapters/ChapterPasswordField')
    expect(Chapters.fields.some((field) => 'name' in field && field.name === 'password')).toBe(true)
    expect(Chapters.fields.some((field) => 'name' in field && field.name === 'hasPassword')).toBe(true)
  })

  it('wires the preview button into the Posts edit header', () => {
    expect(Posts.admin?.components?.edit?.beforeDocumentControls).toEqual([
      '/components/admin/PreviewOnBlogButton',
    ])
  })
})
