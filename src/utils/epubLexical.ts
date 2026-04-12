import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $createParagraphNode, $getRoot, type SerializedEditorState } from 'lexical'

import { chapterLexicalNodes } from './chapterLexicalNodes'
import { sanitizeLexicalLinkURLValue } from './epubImport'

const unwrapElement = (element: Element) => {
  const parent = element.parentNode

  if (!parent) {
    return
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }

  parent.removeChild(element)
}

const normalizeLexicalLinks = (document: Document) => {
  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    const sanitizedHref = sanitizeLexicalLinkURLValue(anchor.getAttribute('href') ?? '')

    if (!sanitizedHref) {
      unwrapElement(anchor)
      continue
    }

    anchor.setAttribute('href', sanitizedHref)
  }
}

export const convertHtmlToChapterLexicalState = (html: string): SerializedEditorState => {
  const parser = new DOMParser()
  const dom = parser.parseFromString(html, 'text/html')

  normalizeLexicalLinks(dom)

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
