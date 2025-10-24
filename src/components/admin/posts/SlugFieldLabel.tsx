'use client'

import React from 'react'
import { TextFieldLabelClientComponent } from 'payload'
import { FieldLabel, useFormFields, useField } from '@payloadcms/ui'
import slugify from 'slugify'

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

    const base = slugify(title.value, {
      lower: true,
      strict: true,
      locale: 'vi', // Vietnamese locale support
      trim: true,
    })

    const suffix = generateRandomSuffix(12)
    const formatted = base ? `${base}-${suffix}` : suffix

    setValue(formatted)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        // gap: '1.5rem',
        justifySelf: 'flex-start',
        marginBottom: '0.5rem',
      }}
    >
      <FieldLabel label={field?.label || field?.name} path={path} required={field?.required} />
      <span style={{ paddingBottom: 5 }}>&nbsp; — &nbsp;</span>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!title?.value || isPublished}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: isPublished || !title?.value ? '#888' : 'inherit',
          textDecoration: 'underline',
          cursor: isPublished || !title?.value ? 'not-allowed' : 'pointer',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          paddingBottom: 5,
        }}
      >
        Auto-generate
      </button>
    </div>
  )
}

export default SlugFieldLabel
