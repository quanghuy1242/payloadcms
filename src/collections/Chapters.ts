import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess } from '../utils/access'
import { createChapterLexicalEditor } from '../utils/chapterRichText'
import { enforceChapterBookOwnershipHook, enforceUniqueChapterOrderHook } from '../utils/books'
import { enforceOwnershipHook } from '../utils/ownership'
import { createSlugHook } from '../utils/slug'

export const Chapters: CollectionConfig = {
  slug: 'chapters',
  access: {
    create: authenticatedAccess,
    read: authenticatedAccess,
    update: ownerAccess('createdBy'),
    delete: ownerAccess('createdBy'),
  },
  admin: {
    hidden: true,
    useAsTitle: 'title',
    defaultColumns: ['title', 'book', 'order', '_status', 'updatedAt'],
    components: {
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
    beforeChange: [enforceChapterBookOwnershipHook, enforceUniqueChapterOrderHook],
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
