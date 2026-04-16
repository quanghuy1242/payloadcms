import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess } from '../utils/access'
import {
  applyBookImportLifecycleHook,
  BOOK_IMPORT_STATUSES,
  BOOK_ORIGINS,
  BOOK_SOURCE_TYPES,
  BOOK_SYNC_STATUSES,
  bookDeleteAccess,
  enforceBookHasNoChaptersBeforeDelete,
} from '../utils/books'
import { enforceOwnershipHook } from '../utils/ownership'
import { createRandomizedSlugHook, validateImmutableSlug } from '../utils/slug'

const ORIGIN_OPTIONS = BOOK_ORIGINS.map((origin) => ({
  label: origin,
  value: origin,
}))

const SOURCE_TYPE_OPTIONS = BOOK_SOURCE_TYPES.map((sourceType) => ({
  label: sourceType,
  value: sourceType,
}))

const IMPORT_STATUS_OPTIONS = BOOK_IMPORT_STATUSES.map((importStatus) => ({
  label: importStatus,
  value: importStatus,
}))

const SYNC_STATUS_OPTIONS = BOOK_SYNC_STATUSES.map((syncStatus) => ({
  label: syncStatus,
  value: syncStatus,
}))

export const Books: CollectionConfig = {
  slug: 'books',
  access: {
    create: authenticatedAccess,
    read: authenticatedAccess,
    update: ownerAccess('createdBy'),
    delete: bookDeleteAccess,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'origin', 'importStatus', 'syncStatus', 'updatedAt'],
    components: {
      views: {
        list: {
          Component: '/components/admin/books/BooksListView',
        },
      },
      edit: {
        beforeDocumentControls: [
          '/components/admin/books/DeleteBookButton',
          '/components/admin/books/ChapterListButton',
        ],
      },
    },
    description:
      'Books support manual authoring and EPUB imports. Import status fields are managed automatically.',
  },
  versions: {
    drafts: {
      autosave: {
        interval: 5000,
        showSaveDraftButton: true,
      },
    },
  },
  hooks: {
    beforeValidate: [
      enforceOwnershipHook('createdBy'),
      createRandomizedSlugHook('title', { localeField: 'language', defaultLocale: 'en' }),
    ],
    beforeChange: [applyBookImportLifecycleHook],
    beforeDelete: [enforceBookHasNoChaptersBeforeDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'author',
      type: 'text',
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Synopsis or blurb from the EPUB metadata or manually authored.',
      },
    },
    {
      name: 'language',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'BCP 47 language tag (e.g., "en", "vi", "ja").',
      },
    },
    {
      name: 'publisher',
      type: 'text',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publicationDate',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isbn',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Primary ISBN or dc:identifier from EPUB.',
      },
    },
    {
      name: 'subjects',
      type: 'array',
      admin: {
        description: 'Genre and topic tags from EPUB metadata.',
      },
      fields: [
        {
          name: 'subject',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'chapterCount',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'totalWordCount',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'epubVersion',
      type: 'select',
      options: ['2', '3'],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Generated from title and locked after publishing.',
      },
      // @ts-ignore
      validate: validateImmutableSlug,
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media' as const,
    },
    {
      name: 'origin',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: ORIGIN_OPTIONS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceType',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: SOURCE_TYPE_OPTIONS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceId',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceHash',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceVersion',
      type: 'text',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'syncStatus',
      type: 'select',
      required: true,
      defaultValue: 'clean',
      options: SYNC_STATUS_OPTIONS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importBatchId',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importStatus',
      type: 'select',
      required: true,
      defaultValue: 'idle',
      options: IMPORT_STATUS_OPTIONS,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importTotalChapters',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importCompletedChapters',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importStartedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importFinishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importFailedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'lastImportedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'importErrorSummary',
      type: 'textarea',
      admin: {
        description: 'Only populated when the latest import attempt failed.',
      },
    },
    {
      name: 'importFailureLog',
      type: 'json',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Per-chapter failure records from the latest import attempt.',
      },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users' as const,
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
