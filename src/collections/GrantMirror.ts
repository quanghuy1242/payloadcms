import type { CollectionConfig } from 'payload'

import { adminAccess } from '../utils/access'

export const GRANT_MIRROR_ENTITY_TYPES = ['book', 'chapter', 'comment'] as const
export const GRANT_MIRROR_SOURCE_SUBJECT_TYPES = ['user', 'group'] as const
export const GRANT_MIRROR_SYNC_STATUSES = ['active', 'revoked', 'pending'] as const

export type GrantMirrorEntityType = (typeof GRANT_MIRROR_ENTITY_TYPES)[number]
export type GrantMirrorSyncStatus = (typeof GRANT_MIRROR_SYNC_STATUSES)[number]
export type GrantMirrorSourceSubjectType = (typeof GRANT_MIRROR_SOURCE_SUBJECT_TYPES)[number]

export const GrantMirror: CollectionConfig = {
  slug: 'grant-mirror',
  // Composite indexes required by the read-path and event-processing queries.
  // Payload v3 maps these to database-level compound indexes.
  indexes: [
    // Primary read-time query: user + entity type + status
    { fields: ['payloadUserId', 'entityType', 'syncStatus'] },
    // group.member.removed: find group-derived rows for a departing user
    { fields: ['sourceSubjectType', 'payloadUserId'] },
    // Reconciliation staleness scan
    { fields: ['syncStatus', 'syncedAt'] },
  ],
  access: {
    create: adminAccess,
    read: adminAccess,
    update: adminAccess,
    delete: adminAccess,
  },
  admin: {
    hidden: true,
    useAsTitle: 'autherTupleId',
    defaultColumns: ['payloadUserId', 'entityType', 'entityId', 'relation', 'syncStatus', 'syncedAt'],
    description: 'Internal read model: mirrors Auther grant tuples for fast access filtering.',
  },
  fields: [
    {
      name: 'autherTupleId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Stable Auther tuple ID. Idempotency key for upsert operations.',
      },
    },
    {
      name: 'payloadUserId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
        description: 'Local Payload user who has this grant. Always resolved from group membership at sync time.',
      },
    },
    {
      name: 'entityType',
      type: 'select',
      required: true,
      options: GRANT_MIRROR_ENTITY_TYPES.map((t) => ({ label: t, value: t })),
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'entityId',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description: 'Payload entity ID as a string.',
      },
    },
    {
      name: 'relation',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description: 'Auther relation name, e.g. viewer, editor, owner.',
      },
    },
    {
      name: 'sourceSubjectType',
      type: 'select',
      required: true,
      options: GRANT_MIRROR_SOURCE_SUBJECT_TYPES.map((t) => ({ label: t, value: t })),
      admin: {
        readOnly: true,
        description: 'Whether this row came from a direct user grant or a group-expanded grant.',
      },
    },
    {
      name: 'requiresLiveCheck',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'If true, must call Auther check-permission at read time (Lua condition present).',
      },
    },
    {
      name: 'syncStatus',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: GRANT_MIRROR_SYNC_STATUSES.map((s) => ({ label: s, value: s })),
      admin: {
        description: 'active = included in read filters, revoked = excluded, pending = in-progress.',
      },
    },
    {
      name: 'syncedAt',
      type: 'date',
      required: true,
      admin: {
        readOnly: true,
        description: 'Timestamp of the last sync operation that touched this row.',
      },
    },
  ],
}
