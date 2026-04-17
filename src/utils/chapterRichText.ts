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
import { EpubCalloutFeature } from '../features/epub-callout/feature.server'

/**
 * Payload block definition for end-of-chapter footnotes.
 * Stores the footnote identifier, display marker, and plain-text content.
 */
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

/**
 * Returns the ordered list of Lexical feature instances used by chapter rich-text fields.
 * Includes standard formatting, headings, code blocks, footnotes, internal links,
 * callouts, lists, tables, and toolbar features.
 */
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
    EpubCalloutFeature(),
    OrderedListFeature(),
    UnorderedListFeature(),
    ChecklistFeature(),
    EXPERIMENTAL_TableFeature(),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ]
}

/**
 * Creates a configured `lexicalEditor` instance for chapter content fields,
 * extending root features with all chapter-specific feature providers.
 */
export const createChapterLexicalEditor = () => {
  return lexicalEditor({
    features: ({ rootFeatures }) => {
      return [...rootFeatures, ...chapterRichTextFeatureProviders()]
    },
  })
}
