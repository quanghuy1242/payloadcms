import type { Block } from 'payload'

import {
  BlocksFeature,
  CodeBlock,
  lexicalEditor,
  BlockquoteFeature,
  BoldFeature,
  ChecklistFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  InlineCodeFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnderlineFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'

import { EpubInternalLinkFeature } from '../features/epub-internal-link/feature.server'
import { EpubFootnoteRefFeature } from '../features/epub-footnote-ref/feature.server'

const footnoteBlock: Block = {
  slug: 'footnote',
  fields: [
    {
      name: 'noteId',
      type: 'text',
      required: true,
    },
    {
      name: 'marker',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
}

export const chapterRichTextFeatureProviders = () => {
  return [
    ParagraphFeature(),
    BoldFeature(),
    ItalicFeature(),
    UnderlineFeature(),
    InlineCodeFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
    BlockquoteFeature(),
    BlocksFeature({
      blocks: [
        CodeBlock({
          defaultLanguage: 'plaintext',
        }),
        footnoteBlock,
      ],
    }),
    LinkFeature(),
    EpubInternalLinkFeature(),
    EpubFootnoteRefFeature(),
    OrderedListFeature(),
    UnorderedListFeature(),
    ChecklistFeature(),
    EXPERIMENTAL_TableFeature(),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ]
}

export const createChapterLexicalEditor = () => {
  return lexicalEditor({
    features: ({ rootFeatures }) => {
      return [...rootFeatures, ...chapterRichTextFeatureProviders()]
    },
  })
}
