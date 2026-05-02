import type { CollectionConfig } from 'payload'

import { adminAccess } from '../utils/access'
import {
  COMMENT_STATUSES,
  commentsBeforeChangeHook,
  commentsBeforeValidateHook,
} from '../utils/comments'

const COMMENT_STATUS_OPTIONS = COMMENT_STATUSES.map((status) => ({
  label: status.charAt(0).toUpperCase() + status.slice(1),
  value: status,
}))

export const Comments: CollectionConfig = {
  slug: 'comments',
  access: {
    create: adminAccess,
    read: adminAccess,
    update: adminAccess,
    delete: adminAccess,
  },
  admin: {
    useAsTitle: 'content',
    defaultColumns: [
      'status',
      'author',
      'chapter',
      'post',
      'parentComment',
      'createdAt',
      'updatedAt',
    ],
  },
  hooks: {
    beforeValidate: [commentsBeforeValidateHook],
    beforeChange: [commentsBeforeChangeHook],
  },
  fields: [
    {
      name: 'chapter',
      type: 'relationship',
      relationTo: 'chapters',
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: COMMENT_STATUS_OPTIONS,
      index: true,
    },
    {
      name: 'parentComment',
      type: 'relationship',
      relationTo: 'comments',
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'moderatedAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'moderatedBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        readOnly: true,
      },
    },
  ],
  indexes: [
    { fields: ['chapter', 'status', 'createdAt'] },
    { fields: ['post', 'status', 'createdAt'] },
    { fields: ['chapter', 'author', 'status', 'createdAt'] },
    { fields: ['post', 'author', 'status', 'createdAt'] },
    { fields: ['status', 'createdAt'] },
  ],
}
