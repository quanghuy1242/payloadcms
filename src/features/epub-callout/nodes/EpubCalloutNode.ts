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

export type CalloutVariant = 'note' | 'tip' | 'warning' | 'important'

export type SerializedEpubCalloutNode<T extends SerializedLexicalNode = SerializedLexicalNode> = {
  fields: {
    variant: CalloutVariant
  }
} & StronglyTypedElementNode<SerializedElementNode, 'epub-callout', T>

export class EpubCalloutNode extends ElementNode {
  __fields: {
    variant: CalloutVariant
  }

  static clone(node: EpubCalloutNode): EpubCalloutNode {
    return new EpubCalloutNode(node.__fields, node.__key)
  }

  static getType(): string {
    return 'epub-callout'
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-callout-variant')) {
          return null
        }

        return {
          conversion: convertEpubCalloutElement,
          priority: 2,
        }
      },
    }
  }

  static importJSON(serializedNode: SerializedEpubCalloutNode): EpubCalloutNode {
    const node = $createEpubCalloutNode(serializedNode.fields?.variant ?? 'note')
    return node.updateFromJSON(serializedNode)
  }

  constructor(fields: { variant: CalloutVariant }, key?: NodeKey) {
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
    const div = document.createElement('div')
    div.setAttribute('data-callout-variant', this.__fields.variant)
    div.className = `epub-callout epub-callout--${this.__fields.variant}`
    return div
  }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    div.setAttribute('data-callout-variant', this.__fields.variant)
    div.className = `epub-callout epub-callout--${this.__fields.variant}`
    return { element: div }
  }

  exportJSON(): SerializedEpubCalloutNode {
    return {
      ...super.exportJSON(),
      type: 'epub-callout',
      fields: this.__fields,
      version: 1,
    }
  }

  getFields(): { variant: CalloutVariant } {
    return this.getLatest().__fields
  }

  getVariant(): CalloutVariant {
    return this.getLatest().__fields.variant
  }

  isInline(): false {
    return false
  }

  updateDOM(prevNode: EpubCalloutNode, dom: HTMLElement): boolean {
    if (prevNode.__fields.variant !== this.__fields.variant) {
      dom.setAttribute('data-callout-variant', this.__fields.variant)
      dom.className = `epub-callout epub-callout--${this.__fields.variant}`
    }

    return false
  }

  setFields(fields: { variant: CalloutVariant }): this {
    const writable = this.getWritable()
    writable.__fields = fields
    return writable
  }

  setVariant(variant: CalloutVariant): this {
    return this.setFields({ variant })
  }
}

function convertEpubCalloutElement(domNode: HTMLElement): DOMConversionOutput {
  const variant = (domNode.getAttribute('data-callout-variant') as CalloutVariant) ?? 'note'
  const node = $createEpubCalloutNode(variant)
  return { node }
}

export function $createEpubCalloutNode(variant: CalloutVariant): EpubCalloutNode {
  return $applyNodeReplacement(new EpubCalloutNode({ variant }))
}

export function $isEpubCalloutNode(
  node: LexicalNode | null | undefined,
): node is EpubCalloutNode {
  return node instanceof EpubCalloutNode
}
