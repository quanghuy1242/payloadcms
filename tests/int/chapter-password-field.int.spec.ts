import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'

import ChapterPasswordField from '@/components/admin/chapters/ChapterPasswordField'

const fieldMocks = vi.hoisted(() => ({
  setValue: vi.fn(),
  useFieldValue: undefined as string | undefined,
  useHasPasswordValue: false,
}))

vi.mock('@payloadcms/ui', () => {
  return {
    useField: () => ({
      setValue: fieldMocks.setValue,
      value: fieldMocks.useFieldValue,
    }),
    useFormFields: (selector: (fields: [{ hasPassword: { value?: boolean } }]) => unknown) =>
      selector([
        {
          hasPassword: {
            value: fieldMocks.useHasPasswordValue,
          },
        },
      ]),
  }
})

describe('ChapterPasswordField', () => {
  beforeEach(() => {
    fieldMocks.setValue.mockReset()
    fieldMocks.useFieldValue = undefined
    fieldMocks.useHasPasswordValue = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the unlocked placeholder and does not expose a clear action', () => {
    render(createElement(ChapterPasswordField, { field: undefined as never, path: 'password' }))

    expect(screen.getByPlaceholderText('Set a password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear password' })).toBeNull()
  })

  it('shows the protected placeholder and clears the field when requested', () => {
    fieldMocks.useHasPasswordValue = true
    fieldMocks.useFieldValue = 'hashed-or-typed-value'

    render(createElement(ChapterPasswordField, { field: undefined as never, path: 'password' }))

    expect(screen.getByPlaceholderText('Enter a new password')).toBeTruthy()

    const clearButton = screen.getByRole('button', { name: 'Clear password' })
    fireEvent.click(clearButton)

    expect(fieldMocks.setValue).toHaveBeenCalledWith('')
  })
})
