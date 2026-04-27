import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'

import ChapterContentField from '@/components/admin/chapters/ChapterContentField'

const fieldMocks = vi.hoisted(() => ({
  useAuthUser: { id: 1, role: 'admin' } as { id?: number; role?: string } | null,
  useDocumentData: { createdBy: 1 } as { createdBy?: number } | null,
  useOperationValue: 'create' as 'create' | 'update' | undefined,
}))

vi.mock('@payloadcms/ui', () => {
  return {
    RichTextField: () => <div data-testid="rich-text-field" />,
    useAuth: () => ({
      user: fieldMocks.useAuthUser,
    }),
    useDocumentInfo: () => ({
      data: fieldMocks.useDocumentData,
    }),
    useOperation: () => fieldMocks.useOperationValue,
  }
})

describe('ChapterContentField', () => {
  beforeEach(() => {
    fieldMocks.useAuthUser = { id: 1, role: 'admin' }
    fieldMocks.useDocumentData = { createdBy: 1 }
    fieldMocks.useOperationValue = 'create'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the rich-text editor for chapter owners and create flows', () => {
    render(createElement(ChapterContentField, { field: undefined as never, path: 'content' }))

    expect(screen.getByTestId('rich-text-field')).toBeTruthy()
  })

  it('shows a rejection notice for non-owners on update', () => {
    fieldMocks.useOperationValue = 'update'
    fieldMocks.useAuthUser = { id: 99, role: 'user' }
    fieldMocks.useDocumentData = { createdBy: 1 }

    render(createElement(ChapterContentField, { field: undefined as never, path: 'content' }))

    expect(
      screen.getByText('Only the chapter owner can edit this content in the admin portal.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('rich-text-field')).toBeNull()
  })
})
