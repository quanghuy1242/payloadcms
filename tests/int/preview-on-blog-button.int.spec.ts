import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import PreviewOnBlogButton from '@/components/admin/PreviewOnBlogButton'
import * as httpUtils from '@/utils/http'

const previewMocks = vi.hoisted(() => ({
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
  useDocumentInfo: vi.fn(),
  windowOpen: vi.fn(),
}))

vi.mock('@payloadcms/ui', () => {
  const MockButton = (
    props: ComponentProps<'button'> & {
      buttonStyle?: string
      size?: string
      tooltip?: string
    },
  ): ReactElement => {
    const { children, type, tooltip, buttonStyle, size, ...buttonProps } = props

    previewMocks.lastButtonProps = props

    return createElement(
      'button',
      {
        ...buttonProps,
        'data-testid': 'preview-on-blog-button',
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
    useDocumentInfo: previewMocks.useDocumentInfo,
  }
})

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BLOG_URL', 'https://blog.quanghuy.dev')
  previewMocks.windowOpen = vi.fn()
  Object.defineProperty(window, 'open', {
    value: previewMocks.windowOpen,
    writable: true,
  })
  window.alert = vi.fn()
})

afterEach(() => {
  cleanup()
  previewMocks.useDocumentInfo.mockReset()
  previewMocks.lastButtonProps = undefined
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('PreviewOnBlogButton', () => {
  describe('button state', () => {
    it('renders disabled when no document id is available', () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: null, collectionSlug: null })

      render(createElement(PreviewOnBlogButton))

      expect(previewMocks.lastButtonProps).toMatchObject({
        buttonStyle: 'secondary',
        disabled: true,
        size: 'medium',
        tooltip: 'Save the document first',
      })

      const button = screen.getByTestId<HTMLButtonElement>('preview-on-blog-button')
      expect(button.disabled).toBe(true)
      expect(button.textContent).toBe('Preview on blog')
    })

    it('renders enabled when a document id exists', () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: '42', collectionSlug: 'books' })

      render(createElement(PreviewOnBlogButton))

      expect(previewMocks.lastButtonProps).toMatchObject({
        buttonStyle: 'secondary',
        disabled: false,
        size: 'medium',
        tooltip: 'Preview this document on the blog',
      })

      const button = screen.getByTestId('preview-on-blog-button') as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
  })

  describe('successful preview', () => {
    it('calls GraphQL with the correct query for books and opens the blog', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      const requestSpy = vi
        .spyOn(httpUtils, 'requestJSON')
        .mockResolvedValue({
          data: {
            previewToken: {
              token: 'abc.def',
              slug: 'my-book',
            },
          },
        })

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          '/api/graphql',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.stringContaining('previewToken'),
          }),
        )
      })

      const body = JSON.parse(
        (requestSpy.mock.calls[0][1] as RequestInit).body as string,
      ) as { query: string; variables: { docType: string; docId: string } }
      expect(body.query).toContain('query PreviewToken')
      expect(body.variables).toEqual({ docType: 'books', docId: '42' })

      await waitFor(() => {
        expect(previewMocks.windowOpen).toHaveBeenCalledWith(
          expect.stringContaining('/api/draft?token=abc.def&redirect='),
          '_blank',
        )
      })

      const [url] = previewMocks.windowOpen.mock.calls[0]
      expect(decodeURIComponent(url as string)).toContain('/books/my-book')
    })

    it('calls GraphQL with the correct query for posts', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: '7', collectionSlug: 'posts' })

      const requestSpy = vi
        .spyOn(httpUtils, 'requestJSON')
        .mockResolvedValue({
          data: {
            previewToken: {
              token: 'xyz.ghi',
              slug: 'hello-world',
            },
          },
        })

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        const body = JSON.parse(
          (requestSpy.mock.calls[0][1] as RequestInit).body as string,
        ) as { query: string; variables: { docType: string; docId: string } }
        expect(body.variables).toEqual({ docType: 'posts', docId: '7' })
      })

      await waitFor(() => {
        const [url] = previewMocks.windowOpen.mock.calls[0]
        expect(decodeURIComponent(url as string)).toContain('/posts/hello-world')
      })
    })

    it('shows loading state while fetching', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      let resolvePromise: (value: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      vi.spyOn(httpUtils, 'requestJSON').mockReturnValue(pendingPromise as Promise<unknown>)

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(button.textContent).toBe('Previewing...')
        expect((button as HTMLButtonElement).disabled).toBe(true)
      })

      resolvePromise!({
        data: { previewToken: { token: 'abc.def', slug: 'my-book' } },
      })

      await waitFor(() => {
        expect(previewMocks.windowOpen).toHaveBeenCalled()
      })
    })
  })

  describe('error handling', () => {
    it('shows alert on GraphQL error', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      vi.spyOn(httpUtils, 'requestJSON').mockResolvedValue({
        errors: [{ message: 'You are not authorized to preview this document' }],
      })

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith(
          'You are not authorized to preview this document',
        )
      })
    })

    it('shows alert when response has no data', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      vi.spyOn(httpUtils, 'requestJSON').mockResolvedValue({ data: null })

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Failed to get preview token')
      })
    })

    it('shows alert on network error', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      vi.spyOn(httpUtils, 'requestJSON').mockRejectedValue(new Error('Network error'))

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Network error')
      })
    })

    it('shows alert when NEXT_PUBLIC_BLOG_URL is not configured', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })
      vi.stubEnv('NEXT_PUBLIC_BLOG_URL', '')

      const requestSpy = vi.spyOn(httpUtils, 'requestJSON')

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('NEXT_PUBLIC_BLOG_URL is not configured')
      })

      expect(requestSpy).not.toHaveBeenCalled()
    })

    it('resets loading state after error', async () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: 'books' })

      vi.spyOn(httpUtils, 'requestJSON').mockResolvedValue({
        errors: [{ message: 'Error' }],
      })

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(button.textContent).toBe('Preview on blog')
        expect((button as HTMLButtonElement).disabled).toBe(false)
      })
    })

    it('does not call GraphQL when docId is null', () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: null, collectionSlug: 'books' })

      const requestSpy = vi.spyOn(httpUtils, 'requestJSON')

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      expect(requestSpy).not.toHaveBeenCalled()
    })

    it('does not call GraphQL when collectionSlug is empty', () => {
      previewMocks.useDocumentInfo.mockReturnValue({ id: 42, collectionSlug: undefined })

      const requestSpy = vi.spyOn(httpUtils, 'requestJSON')

      render(createElement(PreviewOnBlogButton))

      const button = screen.getByTestId('preview-on-blog-button')
      fireEvent.click(button)

      expect(requestSpy).not.toHaveBeenCalled()
    })
  })
})
