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
  BlocksFeature,
  CodeBlock,
  EXPERIMENTAL_TableFeature,
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
            // Table support (experimental)
            EXPERIMENTAL_TableFeature(),
            // Code block, YouTube embed, and Collapsible container
            BlocksFeature({
              blocks: [
                // Code block with syntax highlighting
                CodeBlock({
                  defaultLanguage: 'typescript',
                  languages: {
                    js: 'JavaScript',
                    ts: 'TypeScript',
                    tsx: 'TSX',
                    jsx: 'JSX',
                    html: 'HTML',
                    css: 'CSS',
                    python: 'Python',
                    bash: 'Bash',
                    json: 'JSON',
                    plaintext: 'Plain Text',
                  },
                }),
                // YouTube video embed
                {
                  slug: 'youtube',
                  interfaceName: 'YouTubeBlock',
                  admin: {
                    components: {
                      Block: '@/components/lexical/YouTubeBlock#YouTubeBlock',
                    },
                  },
                  fields: [
                    {
                      name: 'url',
                      type: 'text',
                      required: true,
                      label: 'YouTube URL',
                      admin: {
                        description:
                          'Paste the full YouTube URL (e.g., https://www.youtube.com/watch?v=...)',
                      },
                    },
                    {
                      name: 'title',
                      type: 'text',
                      label: 'Video Title',
                      admin: {
                        description: 'Optional title to display above the video',
                      },
                    },
                  ],
                },
                // Collapsible container
                {
                  slug: 'collapsible',
                  interfaceName: 'CollapsibleBlock',
                  admin: {
                    components: {
                      Block: '@/components/lexical/CollapsibleBlock#CollapsibleBlock',
                    },
                  },
                  fields: [
                    {
                      name: 'title',
                      type: 'text',
                      required: true,
                      label: 'Collapsible Title',
                      admin: {
                        description: 'The heading shown in the collapsible bar',
                      },
                    },
                    {
                      name: 'content',
                      type: 'richText',
                      required: true,
                      label: 'Content',
                      editor: lexicalEditor(),
                    },
                    {
                      name: 'defaultOpen',
                      type: 'checkbox',
                      label: 'Open by Default',
                      defaultValue: false,
                    },
                  ],
                },
              ],
            }),
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
