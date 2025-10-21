import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess, publicReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import { createSlugHook, validateImmutableSlug } from '../utils/slug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticatedAccess,
    read: publicReadAccess,
    update: ownerAccess('createdBy'),
    delete: ownerAccess('createdBy'),
  },
  admin: {
    useAsTitle: 'name',
  },
  hooks: {
    beforeValidate: [enforceOwnershipHook('createdBy'), createSlugHook('name')],
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
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users' as const,
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
