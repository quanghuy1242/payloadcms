import type { CollectionConfig } from 'payload'
import {
  lexicalEditor,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  BoldFeature,
  ItalicFeature,
  ParagraphFeature,
  UnderlineFeature,
} from '@payloadcms/richtext-lexical'

import {
  USER_ROLES,
  adminOrSelfAccess,
  adminOrSelfFieldAccess,
  isAdminUser,
  authenticatedAccess,
} from '../utils/access'

const USER_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  label: role === 'admin' ? 'Admin' : 'User',
  value: role,
}))

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    create: ({ req }) => isAdminUser(req.user),
    read: authenticatedAccess,
    update: adminOrSelfAccess,
    delete: ({ req }) => isAdminUser(req.user),
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    useAPIKey: true,
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc, operation, req }) => {
        if (isAdminUser(req.user)) {
          return data
        }

        if (operation === 'create') {
          return {
            ...data,
            role: 'user',
          }
        }

        return {
          ...data,
          role: originalDoc?.role ?? 'user',
        }
      },
    ],
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      unique: true,
      required: true,
      access: {
        read: adminOrSelfFieldAccess,
      },
    },
    {
      name: 'fullName',
      type: 'text',
      required: true,
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      access: {
        read: () => true,
        update: adminOrSelfFieldAccess,
      },
    },
    {
      name: 'bio',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            ParagraphFeature(),
            UnderlineFeature(),
            BoldFeature(),
            ItalicFeature(),
            HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
            FixedToolbarFeature(),
            InlineToolbarFeature(),
            HorizontalRuleFeature(),
          ]
        },
      }),
      admin: {
        description: 'A short bio about yourself.',
      },
      access: {
        read: () => true,
        update: adminOrSelfFieldAccess,
      },
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'user',
      options: USER_ROLE_OPTIONS,
      required: true,
      admin: {
        position: 'sidebar',
        description: 'Controls access within the Payload admin. Defaults to User.',
      },
      access: {
        create: ({ req }) => isAdminUser(req.user),
        read: ({ req }) => isAdminUser(req.user),
        update: ({ req }) => isAdminUser(req.user),
      },
    },
  ],
}
