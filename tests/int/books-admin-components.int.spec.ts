import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import BookAccessPanel from '@/components/admin/books/BookAccessPanel'
import ChapterListButton from '@/components/admin/books/ChapterListButton'
import DeleteBookButton from '@/components/admin/books/DeleteBookButton'
import * as booksUtils from '@/utils/books'
import * as httpUtils from '@/utils/http'

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
        allowCreate?: boolean
        enableRowSelections?: boolean
        onBulkSelect?: (ids: Map<number | string, boolean>) => void
        onSelect?: (args: { collectionSlug: string; doc: { id: string | number }; docID: string }) => void
      }
    | undefined,
  lastDocumentDrawerProps: undefined as
    | {
        collectionSlug?: string
        drawerSlug?: string
        id?: string | number | null
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
  useDocumentDrawer: vi.fn(),
  useListDrawer: vi.fn(),
  useModal: vi.fn(),
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
    Drawer: ({ children }: { children?: ReactNode }): ReactElement =>
      createElement('div', { 'data-testid': 'payload-drawer' }, children),
    useConfig: chapterUiMocks.useConfig,
    useDocumentDrawer: chapterUiMocks.useDocumentDrawer,
    useDocumentInfo: chapterUiMocks.useDocumentInfo,
    useListDrawer: chapterUiMocks.useListDrawer,
    useModal: chapterUiMocks.useModal,
  }
})

const installListDrawerMock = (): void => {
  chapterUiMocks.useDocumentDrawer.mockImplementation((args) => {
    const MockDocumentDrawer = (
      props: Record<string, unknown> & {
        children?: ReactNode
      },
    ): ReactElement => {
      chapterUiMocks.lastDocumentDrawerProps = {
        ...args,
        ...props,
      }

      return createElement('div', { 'data-testid': 'chapter-document-drawer' }, props.children)
    }

    return [
      MockDocumentDrawer,
      () => null,
      {
        closeDrawer: chapterUiMocks.closeDrawer,
        drawerDepth: 0,
        drawerSlug: 'chapter-document-drawer',
        isDrawerOpen: false,
        openDrawer: chapterUiMocks.openDrawer,
        toggleDrawer: vi.fn(),
      },
    ]
  })

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
  chapterUiMocks.useModal.mockReturnValue({
    openModal: vi.fn(),
  })
  installListDrawerMock()
})

afterEach(() => {
  cleanup()
  chapterUiMocks.closeDrawer.mockReset()
  chapterUiMocks.lastDocumentDrawerProps = undefined
  chapterUiMocks.lastListDrawerProps = undefined
  chapterUiMocks.useDocumentInfo.mockReset()
  chapterUiMocks.useDocumentDrawer.mockReset()
  chapterUiMocks.useListDrawer.mockReset()
  chapterUiMocks.openDrawer.mockReset()
  chapterUiMocks.routerPush.mockReset()
  chapterUiMocks.useConfig.mockReset()
  chapterUiMocks.useModal.mockReset()
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
    expect(chapterUiMocks.lastListDrawerProps).toMatchObject({
      allowCreate: false,
      enableRowSelections: true,
    })
    expect(chapterUiMocks.lastListDrawerProps?.onBulkSelect).toEqual(expect.any(Function))

    await act(async () => {
      chapterUiMocks.lastListDrawerProps?.onSelect?.({
        collectionSlug: 'chapters',
        doc: { id: 1 },
        docID: '1',
      })
    })

    await waitFor(() => {
      expect(chapterUiMocks.openDrawer).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(chapterUiMocks.lastDocumentDrawerProps).toMatchObject({
        collectionSlug: 'chapters',
        id: 1,
      })
    })

    expect(screen.getByTestId('chapter-document-drawer')).toBeTruthy()
  })

  it('renders private book access grants and the grant button', async () => {
    chapterUiMocks.useDocumentInfo.mockReturnValue({
      data: {
        visibility: 'private',
      },
      id: 'book-99',
    })

    vi.spyOn(httpUtils, 'requestJSONWithRetry').mockResolvedValue({
      grants: [
        {
          relation: 'reader',
          tupleId: 'tuple-1',
          userEmail: 'reader@example.com',
          userId: 'user-1',
        },
      ],
    } as never)

    render(createElement(BookAccessPanel))

    await waitFor(() => {
      expect(httpUtils.requestJSONWithRetry).toHaveBeenCalledWith(
        '/api/books/book-99/access',
        {},
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    expect(screen.getByText('reader@example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grant reader' })).toBeTruthy()
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
