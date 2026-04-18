import type { CollectionConfig } from 'payload'

import { adminAccess } from '../utils/access'

export const DeferredGrants: CollectionConfig = {
  slug: 'deferred-grants',
  access: {
    create: adminAccess,
    read: adminAccess,
    update: adminAccess,
    delete: adminAccess,
  },
  admin: {
    hidden: true,
    useAsTitle: 'tupleId',
    defaultColumns: ['betterAuthUserId', 'tupleId', 'entityType', 'entityId', 'status', 'createdAt'],
    description:
      'Internal queue for grant events that arrived before the target Payload user was created.',
  },
  fields: [
    {
      name: 'betterAuthUserId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Better Auth user ID from the grant event.',
      },
    },
    {
      name: 'tupleId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Auther tuple ID from the grant event.',
      },
    },
    {
      name: 'entityType',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'entityId',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'relation',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'sourceSubjectType',
      type: 'select',
      required: true,
      options: [
        { label: 'User', value: 'user' },
        { label: 'Group', value: 'group' },
      ],
      admin: { readOnly: true },
    },
    {
      name: 'hasCondition',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processed', value: 'processed' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    {
      name: 'processedAt',
      type: 'date',
      admin: { readOnly: true },
    },
    {
      name: 'type',
      type: 'select',
      defaultValue: 'grant',
      index: true,
      options: [
        { label: 'Grant', value: 'grant' },
        {
          label: 'Revocation Tombstone',
          value: 'revocation_tombstone',
          // Written when grant.revoked arrives before the corresponding grant.created.
          // Prevents a late-arriving grant.created retry from restoring an already-revoked row.
        },
      ],
      admin: { readOnly: true },
    },
  ],
}
