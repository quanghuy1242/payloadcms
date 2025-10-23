'use client'

import React from 'react'
import { TextFieldLabelClientComponent } from 'payload'
import { FieldLabel, useFormFields, useField, Button } from '@payloadcms/ui'

const SlugFieldLabel: TextFieldLabelClientComponent = ({ field, path }) => {
  const title = useFormFields(([fields]) => fields.title as { value: string })
  const status = useFormFields(([fields]) => fields._status as { value: string })
  const { setValue } = useField({ path })

  const isPublished = status?.value === 'published'

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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        justifySelf: 'flex-start',
        marginBottom: '0.5rem',
      }}
    >
      <FieldLabel label={field?.label || field?.name} path={path} required={field?.required} />
      <Button
        buttonStyle="subtle"
        size="xsmall"
        onClick={handleGenerate}
        disabled={!title?.value || isPublished}
        margin={false}
      >
        Generate from Title
      </Button>
    </div>
  )
}

export default SlugFieldLabel
