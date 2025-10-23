'use client'

import React from 'react'
import { TextFieldClientComponent } from 'payload'
import { useFormFields, TextField } from '@payloadcms/ui'

const SlugField: TextFieldClientComponent = (props) => {
  const status = useFormFields(([fields]) => fields._status as { value: string })
  const isPublished = status?.value === 'published'

  return <TextField {...props} readOnly={isPublished} />
}

export default SlugField
