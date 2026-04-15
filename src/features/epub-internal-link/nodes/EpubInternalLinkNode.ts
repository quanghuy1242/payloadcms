import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SerializedElementNode,
} from '@payloadcms/richtext-lexical/lexical'

import { $applyNodeReplacement, ElementNode } from '@payloadcms/richtext-lexical/lexical'
import type { StronglyTypedElementNode } from '@payloadcms/richtext-lexical'

export type SerializedEpubInternalLinkNode<T extends SerializedLexicalNode = SerializedLexicalNode> = {
  fields: {
    epubHref: string
  }
} & StronglyTypedElementNode<SerializedElementNode, 'epub-internal-link', T>

export class EpubInternalLinkNode extends ElementNode {
  __fields: {
    epubHref: string
  }

  static clone(node: EpubInternalLinkNode): EpubInternalLinkNode {
    return new EpubInternalLinkNode(node.__fields, node.__key)
  }

  static getType(): string {
    return 'epub-internal-link'
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-epub-href')) {
          return null
        }

        return {
          conversion: convertEpubInternalLinkElement,
          priority: 2,
        }
      },
    }
  }

  static importJSON(serializedNode: SerializedEpubInternalLinkNode): EpubInternalLinkNode {
    const node = $createEpubInternalLinkNode(serializedNode.fields?.epubHref ?? '')
    return node.updateFromJSON(serializedNode)
  }

  constructor(fields: { epubHref: string }, key?: NodeKey) {
    super(key)
    this.__fields = fields
  }

  canBeEmpty(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  canInsertTextBefore(): false {
    return false
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('span')
    element.setAttribute('data-epub-href', this.__fields.epubHref)
    return element
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.setAttribute('data-epub-href', this.__fields.epubHref)

    return { element }
  }

  exportJSON(): SerializedEpubInternalLinkNode {
    return {
      ...super.exportJSON(),
      type: 'epub-internal-link',
      fields: this.__fields,
      version: 1,
    }
  }

  getFields(): { epubHref: string } {
    return this.getLatest().__fields
  }

  getEpubHref(): string {
    return this.getLatest().__fields.epubHref
  }

  isInline(): true {
    return true
  }

  updateDOM(prevNode: EpubInternalLinkNode, dom: HTMLElement): boolean {
    if (prevNode.__fields.epubHref !== this.__fields.epubHref) {
      dom.setAttribute('data-epub-href', this.__fields.epubHref)
    }

    return false
  }

  setFields(fields: { epubHref: string }): this {
    const writable = this.getWritable()
    writable.__fields = fields
    return writable
  }

  setEpubHref(epubHref: string): this {
    return this.setFields({ epubHref })
  }
}

function convertEpubInternalLinkElement(domNode: HTMLElement): DOMConversionOutput | null {
  const epubHref = domNode.getAttribute('data-epub-href')

  if (!epubHref) {
    return null
  }

  return {
    node: $createEpubInternalLinkNode(epubHref),
  }
}

export function $createEpubInternalLinkNode(fieldsOrHref: { epubHref: string } | string): EpubInternalLinkNode {
  const fields = typeof fieldsOrHref === 'string' ? { epubHref: fieldsOrHref } : fieldsOrHref
  return $applyNodeReplacement(new EpubInternalLinkNode(fields))
}

export function $isEpubInternalLinkNode(
  node: LexicalNode | null | undefined,
): node is EpubInternalLinkNode {
  return node instanceof EpubInternalLinkNode
}