import {
  BOOK_IMPORT_STATUSES,
  BOOK_ORIGINS,
  BOOK_SOURCE_TYPES,
  BOOK_STATUSES,
  BOOK_SYNC_STATUSES,
  BOOK_VISIBILITIES,
} from '../books/constants'
import { users, books } from '../db/generated/schema'
import { buildBookReadClause } from '../policies/books'
import { USER_ROLES } from '../auth/roles'
import type { EntityDescriptor, EntityFieldType } from './repository'

const enumField = (values: readonly string[]): EntityFieldType => {
  return {
    kind: 'enum',
    values,
  }
}

export const booksEntity: EntityDescriptor = {
  access: buildBookReadClause,
  defaultSortFields: ['updatedAt', 'id'],
  enumFields: {
    importStatus: BOOK_IMPORT_STATUSES,
    origin: BOOK_ORIGINS,
    sourceType: BOOK_SOURCE_TYPES,
    status: BOOK_STATUSES,
    syncStatus: BOOK_SYNC_STATUSES,
    visibility: BOOK_VISIBILITIES,
  },
  fieldTypes: {
    chapterCount: { kind: 'int' },
    createdById: { kind: 'id' },
    id: { kind: 'id' },
    totalWordCount: { kind: 'int' },
  },
  filterFields: ['status', 'visibility', 'origin', 'sourceType', 'importStatus', 'syncStatus'],
  hiddenFields: [],
  key: 'books',
  lookupFields: ['id', 'slug'],
  pluralQuery: 'books',
  relationFields: [
    {
      fieldName: 'createdBy',
      sourceField: 'createdById',
      targetKey: 'users',
      typeName: 'User',
    },
  ],
  searchFields: ['slug', 'title', 'author', 'description'],
  singularQuery: 'book',
  sortFields: ['updatedAt', 'createdAt', 'title', 'id'],
  table: books,
  typeName: 'Book',
}

export const userTypeFields: Record<string, EntityFieldType> = {
  id: { kind: 'id' },
  role: enumField(USER_ROLES),
}

export const userTypeHiddenFields = [
  'betterAuthUserId',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'salt',
  'hash',
  'loginAttempts',
  'lockUntil',
  'enableAPIKey',
  'apiKey',
  'apiKeyIndex',
] as const

export const userTypeTable = users

export const catalog = {
  books: booksEntity,
}
