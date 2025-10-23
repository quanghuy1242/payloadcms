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

import { authenticatedAccess, ownerAccess, postsReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import { createRandomizedSlugHook, validateImmutableSlug } from '../utils/slug'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: authenticatedAccess,
    read: postsReadAccess,
    update: ownerAccess('author'),
    delete: ownerAccess('author'),
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'author', '_status', 'updatedAt'],
    description:
      'Drafts are private until you publish. Publishing will lock in the current content for readers.',
  },
  versions: {
    drafts: {
      autosave: {
        interval: 30000,
        showSaveDraftButton: true,
      },
    },
  },
  hooks: {
    beforeValidate: [enforceOwnershipHook('author'), createRandomizedSlugHook('title')],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'Automatically generated with a unique suffix on first save.',
        position: 'sidebar',
        components: {
          Label: '@/components/admin/posts/SlugFieldLabel',
          Field: '@/components/admin/posts/SlugField',
        },
      },
      // @ts-ignore
      validate: validateImmutableSlug,
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
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
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media' as const,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users' as const,
      required: true,
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories' as const,
      required: true,
    },
    {
      name: 'tags',
      type: 'array',
      fields: [
        {
          name: 'tag',
          type: 'text',
        },
      ],
    },
  ],
}
