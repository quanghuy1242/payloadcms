import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $createParagraphNode, $getRoot, type SerializedEditorState } from 'lexical'

import { chapterLexicalNodes } from './chapterLexicalNodes'

export const convertHtmlToChapterLexicalState = (html: string): SerializedEditorState => {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')

  const editor = createHeadlessEditor({
    namespace: 'payloadcms-epub-import',
    nodes: chapterLexicalNodes,
    onError: (error) => {
      throw error
    },
  })

  editor.update(
    () => {
      const root = $getRoot()
      const nodes = $generateNodesFromDOM(editor, dom)

      root.clear()

      if (nodes.length > 0) {
        root.append(...nodes)
      } else {
        root.append($createParagraphNode())
      }
    },
    { discrete: true },
  )

  return editor.getEditorState().toJSON()
}
