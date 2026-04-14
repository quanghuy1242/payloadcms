import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import ChapterListButton from '@/components/admin/books/ChapterListButton'
import DeleteBookButton from '@/components/admin/books/DeleteBookButton'
import * as booksUtils from '@/utils/books'

const chapterUiMocks = vi.hoisted(() => ({
  lastButtonProps: undefined as
    | {
        buttonStyle?: string
        children?: ReactNode
        disabled?: boolean
        onClick?: ComponentProps<'button'>['onClick']
        size?: string
        tooltip?: string
      }
    | undefined,
  lastListDrawerProps: undefined as
    | {
        onSelect?: (args: { collectionSlug: string; doc: { id: string | number }; docID: string }) => void
      }
    | undefined,
  lastUseListDrawerArgs: undefined as
    | {
        collectionSlugs?: string[]
        filterOptions?: Record<string, unknown>
        selectedCollection?: string
      }
    | undefined,
  openDrawer: vi.fn(),
  closeDrawer: vi.fn(),
  routerPush: vi.fn(),
  useConfig: vi.fn(),
  useDocumentInfo: vi.fn(),
  useListDrawer: vi.fn(),
}))

vi.mock('next/navigation', () => {
  return {
    useRouter: () => ({
      push: chapterUiMocks.routerPush,
    }),
  }
})

vi.mock('@payloadcms/ui', async () => {
  const MockButton = (
    props: ComponentProps<'button'> & {
      buttonStyle?: string
      size?: string
      tooltip?: string
    },
  ): ReactElement => {
    const { children, type, tooltip, buttonStyle, size, ...buttonProps } = props

    chapterUiMocks.lastButtonProps = props

    return createElement(
      'button',
      {
        ...buttonProps,
        'data-testid': 'payload-button',
        'data-button-style': buttonStyle,
        'data-button-size': size,
        type: type ?? 'button',
        title: tooltip,
      },
      children,
    )
  }

  return {
    Button: MockButton,
    useConfig: chapterUiMocks.useConfig,
    useDocumentInfo: chapterUiMocks.useDocumentInfo,
    useListDrawer: chapterUiMocks.useListDrawer,
  }
})

const installListDrawerMock = (): void => {
  chapterUiMocks.useListDrawer.mockImplementation((args) => {
    chapterUiMocks.lastUseListDrawerArgs = args

    const MockListDrawer = (
      props: Record<string, unknown> & {
        onSelect?: (args: { collectionSlug: string; doc: { id: string | number }; docID: string }) => void
      },
    ): ReactElement => {
      chapterUiMocks.lastListDrawerProps = props

      return createElement('div', { 'data-testid': 'chapter-drawer' })
    }

    const MockListDrawerToggler = (): ReactElement | null => null

    return [
      MockListDrawer,
      MockListDrawerToggler,
      {
        collectionSlugs: args.collectionSlugs ?? [],
        drawerDepth: 0,
        drawerSlug: 'book-chapters',
        isDrawerOpen: false,
        openDrawer: chapterUiMocks.openDrawer,
        closeDrawer: chapterUiMocks.closeDrawer,
        setCollectionSlugs: vi.fn(),
        toggleDrawer: vi.fn(),
      },
    ]
  })
}

beforeEach(() => {
  chapterUiMocks.useConfig.mockReturnValue({
    config: {
      routes: {
        admin: '/admin',
      },
    },
  })
  installListDrawerMock()
})

afterEach(() => {
  cleanup()
  chapterUiMocks.closeDrawer.mockReset()
  chapterUiMocks.lastListDrawerProps = undefined
  chapterUiMocks.useDocumentInfo.mockReset()
  chapterUiMocks.useListDrawer.mockReset()
  chapterUiMocks.openDrawer.mockReset()
  chapterUiMocks.routerPush.mockReset()
  chapterUiMocks.useConfig.mockReset()
  chapterUiMocks.lastButtonProps = undefined
  chapterUiMocks.lastUseListDrawerArgs = undefined
  vi.restoreAllMocks()
})

describe('Book admin components', () => {
  it('scopes the chapter drawer to the current book and renders a medium button', async () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({ id: 'book-1' })
    vi.spyOn(booksUtils, 'fetchBookChapterCount').mockResolvedValue(3)

    const { rerender } = render(createElement(ChapterListButton))

    const initialDrawerArgs = chapterUiMocks.lastUseListDrawerArgs

    await waitFor(() => {
      expect(booksUtils.fetchBookChapterCount).toHaveBeenCalledWith(
        'book-1',
        expect.anything(),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('payload-button').textContent).toBe('Chapters (3)')
    })

    rerender(createElement(ChapterListButton))

    expect(chapterUiMocks.lastUseListDrawerArgs?.collectionSlugs).toBe(
      initialDrawerArgs?.collectionSlugs,
    )
    expect(chapterUiMocks.lastUseListDrawerArgs?.filterOptions).toBe(
      initialDrawerArgs?.filterOptions,
    )

    expect(chapterUiMocks.lastButtonProps).toMatchObject({
      buttonStyle: 'secondary',
      disabled: false,
      size: 'medium',
      tooltip: 'Open the chapter drawer for this book.',
    })

    const button = screen.getByTestId('payload-button') as HTMLButtonElement

    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(chapterUiMocks.openDrawer).toHaveBeenCalledTimes(1)

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

    expect(chapterUiMocks.lastListDrawerProps?.onSelect).toEqual(expect.any(Function))

    chapterUiMocks.lastListDrawerProps?.onSelect?.({
      collectionSlug: 'chapters',
      doc: { id: 'chapter-1' },
      docID: 'chapter-1',
    })

    expect(chapterUiMocks.closeDrawer).toHaveBeenCalledTimes(1)
    expect(chapterUiMocks.routerPush).toHaveBeenCalledWith('/admin/collections/chapters/chapter-1')
  })

  it('disables the chapter drawer trigger before the book is saved', () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({ id: null })

    render(createElement(ChapterListButton))

    const button = screen.getByTestId('payload-button') as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(chapterUiMocks.lastButtonProps).toMatchObject({
      buttonStyle: 'secondary',
      disabled: true,
      size: 'medium',
      tooltip: 'Save the book first',
    })
    expect(chapterUiMocks.lastUseListDrawerArgs).toMatchObject({
      collectionSlugs: ['chapters'],
      filterOptions: undefined,
      selectedCollection: 'chapters',
    })
  })

  it('renders the delete guard button at the same medium height', async () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({ id: 'book-1' })
    vi.spyOn(booksUtils, 'fetchBookChapterCount').mockResolvedValue(2)

    render(createElement(DeleteBookButton))

    await waitFor(() => {
      expect(booksUtils.fetchBookChapterCount).toHaveBeenCalledWith(
        'book-1',
        expect.anything(),
      )
    })

    expect(chapterUiMocks.lastButtonProps).toMatchObject({
      buttonStyle: 'secondary',
      disabled: true,
      size: 'medium',
      tooltip: 'Remove all chapters before deleting this book.',
    })
    expect(screen.getByTestId('payload-button').textContent).toBe('Delete book')
  })
})