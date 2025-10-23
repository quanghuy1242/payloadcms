'use client'

import React from 'react'
import { TextFieldClientComponent } from 'payload'
import { useFormFields, useField, Button, TextField } from '@payloadcms/ui'

const GenerateSlugButton: TextFieldClientComponent = (props) => {
  const { path } = props
  const title = useFormFields(([fields]) => fields.title as { value: string })
  const { value: slugValue, setValue } = useField({ path })

  const generateRandomSuffix = (length: number): string => {
    const array = new Uint8Array(Math.ceil(length / 2))
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length)
  }

  const handleGenerate = () => {
    if (!title?.value) {
      return
    }

    const base = title.value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')

    const suffix = generateRandomSuffix(12)
    const formatted = base ? `${base}-${suffix}` : suffix

    setValue(formatted)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <TextField {...props} />
      <div>
        <Button
          buttonStyle="secondary"
          size="small"
          onClick={handleGenerate}
          disabled={!title?.value}
        >
          Generate from Title
        </Button>
      </div>
    </div>
  )
}

export default GenerateSlugButton
