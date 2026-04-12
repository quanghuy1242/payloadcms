import {
  lexicalEditor,
  BlockquoteFeature,
  BoldFeature,
  ChecklistFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
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
    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
    BlockquoteFeature(),
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
