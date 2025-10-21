import type { CollectionConfig } from 'payload'

import { USER_ROLES, isAdminUser } from '../utils/access'

const USER_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  label: role === 'admin' ? 'Admin' : 'User',
  value: role,
}))

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    create: ({ req }) => isAdminUser(req.user),
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
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
      name: 'fullName',
      type: 'text',
      required: true,
    },
    // Email added by default
    // Add more fields as needed
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
