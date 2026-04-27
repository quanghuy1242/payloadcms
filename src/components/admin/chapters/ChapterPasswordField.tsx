'use client'

import React from 'react'
import { TextFieldClientComponent } from 'payload'
import { TextField, useField, useFormFields } from '@payloadcms/ui'

const ChapterPasswordField: TextFieldClientComponent = (props) => {
  const { path } = props
  const { setValue } = useField({ path })
  const hasPassword = useFormFields(([fields]) => fields.hasPassword as { value?: boolean } | undefined)
  const isProtected = Boolean(hasPassword?.value)
  const placeholder = isProtected ? 'Enter a new password' : 'Set a password'
  const fieldAdmin = props.field?.admin ?? {}
  const textFieldProps = {
    ...props,
    field: {
      ...props.field,
      admin: {
        ...fieldAdmin,
        placeholder,
      },
    },
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <TextField {...textFieldProps} />
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
