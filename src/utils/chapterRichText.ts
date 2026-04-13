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
      ],
    }),
    LinkFeature(),
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
    features: chapterRichTextFeatureProviders,
  })
}
