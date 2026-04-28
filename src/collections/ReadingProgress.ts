import type { CollectionConfig } from 'payload'

import {
  authenticatedAccess,
  ownerAccess,
} from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import { readingProgressBeforeChangeHook } from '../utils/readingFeatures'

export const ReadingProgress: CollectionConfig = {
  slug: 'reading-progress',
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
      name: 'book',
      type: 'relationship',
      relationTo: 'books',
      required: true,
      index: true,
    },
    {
      name: 'chapter',
      type: 'relationship',
      relationTo: 'chapters',
      required: true,
      index: true,
    },
    {
      name: 'progress',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 0,
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
  hooks: {
    beforeValidate: [enforceOwnershipHook('user')],
    beforeChange: [readingProgressBeforeChangeHook],
  },
}
