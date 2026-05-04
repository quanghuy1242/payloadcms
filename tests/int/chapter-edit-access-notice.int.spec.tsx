import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import ChapterEditAccessNotice from '@/components/admin/chapters/ChapterEditAccessNotice'

const noticeMocks = vi.hoisted(() => ({
  useAuthUser: { id: 1, role: 'admin' } as { id?: number; role?: string } | null,
  useDocumentData: { createdBy: 1 } as { createdBy?: number } | null,
  useOperationValue: 'update' as 'create' | 'update' | undefined,
}))

vi.mock('@payloadcms/ui', () => {
  return {
    useAuth: () => ({
      user: noticeMocks.useAuthUser,
    }),
    useDocumentInfo: () => ({
      data: noticeMocks.useDocumentData,
    }),
    useOperation: () => noticeMocks.useOperationValue,
  }
})

describe('ChapterEditAccessNotice', () => {
  beforeEach(() => {
    noticeMocks.useAuthUser = { id: 1, role: 'admin' }
    noticeMocks.useDocumentData = { createdBy: 1 }
    noticeMocks.useOperationValue = 'update'
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('stays hidden for owners and admins', () => {
    render(<ChapterEditAccessNotice />)

    expect(screen.queryByText('Access denied')).toBeNull()
  })

  it('shows a rejection message for non-owners', () => {
    noticeMocks.useAuthUser = { id: 9, role: 'user' }
    noticeMocks.useDocumentData = { createdBy: 1 }

    render(<ChapterEditAccessNotice />)

    expect(
      screen.getByText('You do not own this chapter, so editing is blocked in the admin portal.'),
    ).toBeTruthy()
  })

  it('stays hidden on create', () => {
    noticeMocks.useOperationValue = 'create'
    noticeMocks.useAuthUser = { id: 9, role: 'user' }

    render(<ChapterEditAccessNotice />)

    expect(screen.queryByText('Access denied')).toBeNull()
  })
})
