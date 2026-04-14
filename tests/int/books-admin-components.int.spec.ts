import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'

import ChapterListButton from '@/components/admin/books/ChapterListButton'
import * as booksUtils from '@/utils/books'

const chapterUiMocks = vi.hoisted(() => ({
  lastUseListDrawerArgs: undefined as
    | {
        collectionSlugs?: string[]
        filterOptions?: Record<string, unknown>
        selectedCollection?: string
      }
    | undefined,
  useDocumentInfo: vi.fn(),
  useListDrawer: vi.fn(),
}))

vi.mock('@payloadcms/ui', async () => {
  return {
    useDocumentInfo: chapterUiMocks.useDocumentInfo,
    useListDrawer: chapterUiMocks.useListDrawer,
  }
})

const installListDrawerMock = (): void => {
  chapterUiMocks.useListDrawer.mockImplementation((args) => {
    chapterUiMocks.lastUseListDrawerArgs = args

    const MockListDrawer = () => createElement('div', { 'data-testid': 'chapter-drawer' })

    const MockListDrawerToggler = (props: ComponentProps<'button'>): ReactElement => {
      const { children, type, ...buttonProps } = props

      return createElement(
        'button',
        {
          ...buttonProps,
          'data-testid': 'chapter-toggler',
          type: type ?? 'button',
        },
        children,
      )
    }

    return [
      MockListDrawer,
      MockListDrawerToggler,
      {
        closeDrawer: vi.fn(),
        collectionSlugs: args.collectionSlugs ?? [],
        drawerDepth: 0,
        drawerSlug: 'book-chapters',
        isDrawerOpen: false,
        openDrawer: vi.fn(),
        setCollectionSlugs: vi.fn(),
        toggleDrawer: vi.fn(),
      },
    ]
  })
}

beforeEach(() => {
  installListDrawerMock()
})

afterEach(() => {
  cleanup()
  chapterUiMocks.useDocumentInfo.mockReset()
  chapterUiMocks.useListDrawer.mockReset()
  chapterUiMocks.lastUseListDrawerArgs = undefined
  vi.restoreAllMocks()
})

describe('Book admin components', () => {
  it('scopes the chapter drawer to the current book and renders one toggler button', async () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({ id: 'book-1' })
    vi.spyOn(booksUtils, 'fetchBookChapterCount').mockResolvedValue(3)

    render(createElement(ChapterListButton))

    await waitFor(() => {
      expect(booksUtils.fetchBookChapterCount).toHaveBeenCalledWith(
        'book-1',
        expect.anything(),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('chapter-toggler').textContent).toBe('Chapters (3)')
    })

    expect(chapterUiMocks.lastUseListDrawerArgs).toMatchObject({
      collectionSlugs: ['chapters'],
      filterOptions: {
        chapters: {
          book: {
            equals: 'book-1',
          },
        },
      },
      selectedCollection: 'chapters',
    })

    const toggler = screen.getByTestId('chapter-toggler') as HTMLButtonElement

    expect(toggler.disabled).toBe(false)
    expect(toggler.querySelector('button')).toBeNull()
  })

  it('disables the chapter drawer trigger before the book is saved', () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({ id: null })

    render(createElement(ChapterListButton))

    const toggler = screen.getByTestId('chapter-toggler') as HTMLButtonElement

    expect(toggler.disabled).toBe(true)
    expect(toggler.textContent).toBe('Chapters')
    expect(chapterUiMocks.lastUseListDrawerArgs).toMatchObject({
      collectionSlugs: ['chapters'],
      filterOptions: undefined,
      selectedCollection: 'chapters',
    })
  })
})