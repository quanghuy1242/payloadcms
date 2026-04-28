import type { CollectionConfig } from 'payload'

import {
  authenticatedAccess,
  ownerAccess,
} from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import { bookmarksBeforeChangeHook } from '../utils/readingFeatures'

export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
  access: {
    create: authenticatedAccess,
    read: ownerAccess('user'),
    update: ownerAccess('user'),
    delete: ownerAccess('user'),
  },
  admin: {
    hidden: true,
    useAsTitle: 'id',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'contentType',
      type: 'select',
      required: true,
      options: [
        { label: 'Chapter', value: 'chapter' },
        { label: 'Book', value: 'book' },
      ],
    },
    {
      name: 'chapter',
      type: 'relationship',
      relationTo: 'chapters',
      admin: {
        condition: (data) => data.contentType === 'chapter',
      },
    },
    {
      name: 'book',
      type: 'relationship',
      relationTo: 'books',
      admin: {
        condition: (data) => data.contentType === 'book',
      },
    },
  ],
  hooks: {
    beforeValidate: [enforceOwnershipHook('user')],
    beforeChange: [bookmarksBeforeChangeHook],
  },
}
