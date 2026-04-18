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
  adminAccess,
  adminFieldAccess,
  USER_ROLES,
  adminOrSelfAccess,
  adminOrSelfFieldAccess,
  isAdminUser,
  authenticatedAccess,
  authenticatedFieldAccess,
  usersAfterOperationHook,
  usersBeforeChangeHook,
  usersBeforeValidateHook,
} from '../utils/access'
import { betterAuthStrategy } from '../lib/betterAuth/strategy'

const USER_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  label: role === 'admin' ? 'Admin' : 'User',
  value: role,
}))

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    create: adminAccess,
    read: authenticatedAccess,
    update: adminOrSelfAccess,
    delete: adminAccess,
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true,
    strategies: [betterAuthStrategy],
    tokenExpiration: 86400, // 24 hours in seconds (matches Better Auth session time)
  },
  hooks: {
    beforeValidate: [usersBeforeValidateHook],
    beforeChange: [usersBeforeChangeHook],
    afterOperation: [usersAfterOperationHook],
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
        read: authenticatedFieldAccess,
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
        read: authenticatedFieldAccess,
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
        create: adminFieldAccess,
        read: adminFieldAccess,
        update: adminFieldAccess,
      },
    },
    {
      name: 'betterAuthUserId',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Identifier from Better Auth, used for SSO linking.',
      },
      access: {
        read: adminFieldAccess,
      },
    },
  ],
}
