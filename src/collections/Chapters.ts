import type { CollectionConfig } from 'payload'

import {
  authenticatedFieldAccess,
  chapterContentReadAccess,
  authenticatedAccess,
  chaptersReadAccess,
  ownerAccess,
} from '../utils/access'
import { createChapterLexicalEditor } from '../utils/chapterRichText'
import {
  applyChapterPasswordReadStateHook,
  syncChapterPasswordStateHook,
} from '../utils/chapterPasswordHooks'
import {
  enforceChapterBookOwnershipHook,
  enforceUniqueChapterOrderHook,
} from '../utils/books'
import { enforceOwnershipHook } from '../utils/ownership'
import { createSlugHook } from '../utils/slug'

export const Chapters: CollectionConfig = {
  slug: 'chapters',
  access: {
    create: authenticatedAccess,
    read: chaptersReadAccess,
    update: ownerAccess('createdBy'),
    delete: ownerAccess('createdBy'),
  },
  admin: {
    hidden: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'book', 'order', '_status', 'updatedAt'],
    components: {
      edit: {
        beforeDocumentControls: [
          '/components/admin/chapters/ChapterEditAccessNotice',
        ],
      },
      views: {
        list: {
          Component: '/components/admin/chapters/ChaptersListView',
        },
      },
    },
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
    beforeValidate: [enforceOwnershipHook('createdBy'), createSlugHook('title')],
    beforeChange: [syncChapterPasswordStateHook, enforceChapterBookOwnershipHook, enforceUniqueChapterOrderHook],
    afterRead: [applyChapterPasswordReadStateHook],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'book',
      type: 'relationship',
      relationTo: 'books' as const,
      required: true,
      index: true,
    },
    {
      name: 'order',
      type: 'number',
      required: true,
      index: true,
      min: 1,
      admin: {
        description: 'Chapter order is unique per book and defines reader sequencing.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'chapterSourceKey',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'chapterSourceHash',
      type: 'text',
      index: true,
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
      name: 'manualEditedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'chapterWordCount',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      editor: createChapterLexicalEditor(),
      access: {
        read: chapterContentReadAccess,
      },
    },
    {
      name: 'password',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Optional. If set, readers must enter this password to view the chapter.',
        components: {
          Field: '@/components/admin/chapters/ChapterPasswordField',
        },
      },
      access: {
        read: authenticatedFieldAccess,
        create: authenticatedFieldAccess,
        update: authenticatedFieldAccess,
      },
    },
    {
      name: 'hasPassword',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Auto-set. True when a password has been configured.',
      },
    },
    {
      name: 'passwordVersion',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-incremented whenever the password changes.',
      },
      access: {
        read: () => false,
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
