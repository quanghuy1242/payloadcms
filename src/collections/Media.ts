import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess, publishedMediaReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: authenticatedAccess,
    read: publishedMediaReadAccess,
    update: ownerAccess('owner'),
    delete: ownerAccess('owner'),
  },
  hooks: {
    beforeValidate: [enforceOwnershipHook('owner')],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users' as const,
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  upload: true,
}
