import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'

import DownloadEpubButton from '@/components/admin/books/DownloadEpubButton'
import * as httpUtils from '@/utils/http'

const downloadMocks = vi.hoisted(() => ({
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
  locationAssign: vi.fn(),
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

    downloadMocks.lastButtonProps = props

    return createElement(
      'button',
      {
        ...buttonProps,
        'data-testid': 'download-epub-button',
        'data-button-size': size,
        'data-button-style': buttonStyle,
        type: type ?? 'button',
        title: tooltip,
      },
      children,
    )
  }

  return {
    Button: MockButton,
    useDocumentInfo: downloadMocks.useDocumentInfo,
  }
})

beforeEach(() => {
  downloadMocks.locationAssign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      assign: downloadMocks.locationAssign,
    },
  })
  window.alert = vi.fn()
})

afterEach(() => {
  cleanup()
  downloadMocks.useDocumentInfo.mockReset()
  downloadMocks.lastButtonProps = undefined
  vi.restoreAllMocks()
})

describe('DownloadEpubButton', () => {
  it('renders disabled when the document has not been saved yet', () => {
    downloadMocks.useDocumentInfo.mockReturnValue({ id: null })

    render(createElement(DownloadEpubButton))

    expect(downloadMocks.lastButtonProps).toMatchObject({
      buttonStyle: 'secondary',
      disabled: true,
      size: 'medium',
      tooltip: 'Save the document first',
    })

    const button = screen.getByTestId<HTMLButtonElement>('download-epub-button')
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Download as EPUB')
  })

  it('calls the GraphQL mutation and navigates to the signed download URL', async () => {
    downloadMocks.useDocumentInfo.mockReturnValue({ id: 42 })

    const requestSpy = vi.spyOn(httpUtils, 'requestJSON').mockResolvedValue({
      data: {
        generateEpub: {
          downloadUrl: 'https://cms.quanghuy.dev/api/epub-download/signed-token',
          filename: 'my-book.epub',
          expiresAt: '2026-04-29T00:00:00.000Z',
        },
      },
    })

    render(createElement(DownloadEpubButton))

    fireEvent.click(screen.getByTestId('download-epub-button'))

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(
        '/api/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('generateEpub'),
        }),
      )
    })

    const body = JSON.parse(
      (requestSpy.mock.calls[0][1] as RequestInit).body as string,
    ) as { query: string; variables: { bookId: string } }

    expect(body.query).toContain('mutation GenerateEpub')
    expect(body.variables).toEqual({ bookId: '42' })

    await waitFor(() => {
      expect(downloadMocks.locationAssign).toHaveBeenCalledWith(
        'https://cms.quanghuy.dev/api/epub-download/signed-token',
      )
    })
  })

  it('shows an alert when the mutation returns a GraphQL error', async () => {
    downloadMocks.useDocumentInfo.mockReturnValue({ id: 42 })

    vi.spyOn(httpUtils, 'requestJSON').mockResolvedValue({
      errors: [{ message: 'Only the book owner can export EPUB' }],
    })

    render(createElement(DownloadEpubButton))

    fireEvent.click(screen.getByTestId('download-epub-button'))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Only the book owner can export EPUB')
    })
  })
})
