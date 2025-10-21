import type { CollectionConfig } from 'payload'
import { createSlugHook, validateImmutableSlug } from '../utils/slug'
import { publicReadAccess } from '../utils/access'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    read: publicReadAccess,
  },
  admin: {
    useAsTitle: 'name',
  },
  hooks: {
    beforeValidate: [createSlugHook('name')],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'Automatically generated from the name on first save.',
        position: 'sidebar',
      },
      // @ts-ignore
      validate: validateImmutableSlug,
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media' as const,
      required: true,
    },
  ],
}
