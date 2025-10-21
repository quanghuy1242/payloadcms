import type { CollectionConfig } from 'payload'
import { publishedMediaReadAccess } from './utils/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: publishedMediaReadAccess,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
