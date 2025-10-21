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
import { createSlugHook, validateImmutableSlug } from '../utils/slug'
import { publishedPostsReadAccess } from '../utils/access'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    read: publishedPostsReadAccess,
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
    beforeValidate: [createSlugHook('title')],
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
        description: 'Automatically generated from the title on first save.',
        position: 'sidebar',
      },
      // @ts-ignore
      validate: validateImmutableSlug,
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'date',
      type: 'date',
      admin: {
        description: 'Optional publish date — defaults to the time you hit Publish.',
      },
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
