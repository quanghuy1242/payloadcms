import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import type { ListViewClientProps } from 'payload'

import BooksListView from '@/components/admin/books/BooksListView'

const booksListMocks = vi.hoisted(() => ({
  lastDefaultListViewProps: undefined as ListViewClientProps | undefined,
  useConfig: vi.fn(),
}))

vi.mock('@payloadcms/ui', async () => {
  const MockButton = (): ReactElement | null => null

  const MockDefaultListView = (props: ListViewClientProps): ReactElement => {
    booksListMocks.lastDefaultListViewProps = props

    return createElement('div', { 'data-testid': 'default-list-view' })
  }

  return {
    Button: MockButton,
    DefaultListView: MockDefaultListView,
    useConfig: booksListMocks.useConfig,
  }
})

beforeEach(() => {
  booksListMocks.useConfig.mockReturnValue({
    config: {
      routes: {
        admin: '/admin',
      },
    },
  })
})

afterEach(() => {
  cleanup()
  booksListMocks.lastDefaultListViewProps = undefined
  booksListMocks.useConfig.mockReset()
  vi.restoreAllMocks()
})

describe('BooksListView', () => {
  it('hides the create action and adds an import menu button', () => {
    render(
      createElement(BooksListView, {
        Table: createElement('div'),
        collectionSlug: 'books',
        columnState: [],
        hasCreatePermission: true,
        newDocumentURL: '/admin/collections/books/create',
        viewType: 'list',
      } as ListViewClientProps),
    )

    expect(booksListMocks.lastDefaultListViewProps?.hasCreatePermission).toBe(false)
    expect(booksListMocks.lastDefaultListViewProps?.collectionSlug).toBe('books')
    expect(booksListMocks.lastDefaultListViewProps?.listMenuItems).toHaveLength(1)
    expect(
      booksListMocks.lastDefaultListViewProps?.listMenuItems?.[0],
    ).toMatchObject({
      props: {
        buttonStyle: 'pill',
        children: 'Import EPUB',
        className: 'list-create-new-doc__create-new-button',
        el: 'link',
        size: 'small',
        to: '/admin/collections/books/import',
      },
    })
  })
})