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
  authenticatedFieldAccess,
} from '../utils/access'
import {
  signUpBetterAuthUser,
  BetterAuthRequestError,
  BetterAuthUserExistsError,
} from '../lib/betterAuth/api'
import { betterAuthStrategy } from '../lib/betterAuth/strategy'

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
    disableLocalStrategy: true,
    strategies: [betterAuthStrategy],
    tokenExpiration: 86400, // 24 hours in seconds (matches Better Auth session time)
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
    beforeChange: [
      async ({ data, operation, originalDoc }) => {
        if (!data) {
          return data
        }

        if (operation === 'update') {
          const existingIdentifier = (originalDoc as { betterAuthUserId?: unknown } | undefined)
            ?.betterAuthUserId

          if (existingIdentifier != null && existingIdentifier !== '') {
            return {
              ...data,
              betterAuthUserId: existingIdentifier,
            }
          }

          const incomingIdentifier = (data as { betterAuthUserId?: unknown }).betterAuthUserId

          if (typeof incomingIdentifier === 'string' && incomingIdentifier.trim().length > 0) {
            return {
              ...data,
              betterAuthUserId: incomingIdentifier.trim(),
            }
          }

          return {
            ...data,
            betterAuthUserId: null,
          }
        }

        if (operation !== 'create') {
          return data
        }

        const currentIdentifier = (data as { betterAuthUserId?: unknown }).betterAuthUserId

        if (typeof currentIdentifier === 'string' && currentIdentifier.trim().length > 0) {
          return {
            ...data,
            betterAuthUserId: currentIdentifier.trim(),
          }
        }

        const email = typeof data.email === 'string' ? data.email.trim() : ''

        if (!email) {
          throw new Error('Email is required to provision Better Auth users.')
        }

        const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : undefined

        try {
          const signUpResult = await signUpBetterAuthUser({
            email,
            name: fullName ?? undefined,
          })

          return {
            ...data,
            betterAuthUserId: signUpResult.id,
            email: signUpResult.email ?? email,
            fullName: fullName ?? signUpResult.name ?? email,
          }
        } catch (error) {
          if (error instanceof BetterAuthUserExistsError) {
            throw new Error(
              'A Better Auth user with this email already exists. Link the record by providing the Better Auth user ID.',
            )
          }

          if (error instanceof BetterAuthRequestError) {
            throw error
          }

          throw new Error(
            error instanceof Error
              ? error.message
              : 'Unknown error occurred while provisioning Better Auth user.',
          )
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
        create: ({ req }) => isAdminUser(req.user),
        read: ({ req }) => isAdminUser(req.user),
        update: ({ req }) => isAdminUser(req.user),
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
        read: ({ req }) => isAdminUser(req.user),
      },
    },
  ],
}
