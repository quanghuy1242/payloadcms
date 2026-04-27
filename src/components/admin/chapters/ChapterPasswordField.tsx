'use client'

import React from 'react'
import { TextFieldClientComponent } from 'payload'
import { useField, useFormFields } from '@payloadcms/ui'

const ChapterPasswordField: TextFieldClientComponent = (props) => {
  const { path } = props
  const { setValue, value } = useField({ path })
  const hasPassword = useFormFields(([fields]) => fields.hasPassword as { value?: boolean } | undefined)
  const isProtected = Boolean(hasPassword?.value)
  const currentValue = typeof value === 'string' ? value : ''

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <input
        autoComplete="new-password"
        onChange={(event) => {
          setValue(event.target.value)
        }}
        placeholder={isProtected ? 'Enter a new password' : 'Set a password'}
        style={{
          border: '1px solid var(--theme-elevation-200, #d1d5db)',
          borderRadius: '6px',
          fontSize: '1rem',
          padding: '0.6rem 0.75rem',
          width: '100%',
        }}
        type="password"
        value={currentValue}
      />
      <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <p style={{ color: 'var(--theme-elevation-600, #4b5563)', fontSize: '0.875rem', margin: 0 }}>
          {isProtected
            ? 'A password is currently set. Type a new password to replace it, or clear it to remove protection.'
            : 'Leave this blank to keep the chapter unlocked.'}
        </p>
        {isProtected ? (
          <button
            onClick={() => {
              setValue('')
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-link, #2563eb)',
              cursor: 'pointer',
              font: 'inherit',
              padding: 0,
              textDecoration: 'underline',
            }}
            type="button"
          >
            Clear password
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default ChapterPasswordField
