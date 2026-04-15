import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from '@payloadcms/richtext-lexical/lexical'

import { $applyNodeReplacement, DecoratorNode } from '@payloadcms/richtext-lexical/lexical'
import React from 'react'

export type SerializedFootnoteRefNode = Spread<
  {
    fields: {
      marker: string
      noteId: string
    }
  },
  SerializedLexicalNode
>

const trimToEmpty = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

export class FootnoteRefNode extends DecoratorNode<React.ReactElement> {
  __fields: {
    marker: string
    noteId: string
  }

  static clone(node: FootnoteRefNode): FootnoteRefNode {
    return new FootnoteRefNode(node.__fields, node.__key)
  }

  static getType(): string {
    return 'footnote-ref'
  }

  static importDOM(): DOMConversionMap | null {
    return {
      sup: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-note-id')) {
          return null
        }

        return {
          conversion: convertFootnoteRefElement,
          priority: 2,
        }
      },
    }
  }

  static importJSON(serializedNode: SerializedFootnoteRefNode): FootnoteRefNode {
    return $createFootnoteRefNode(
      serializedNode.fields?.marker ?? '',
      serializedNode.fields?.noteId ?? '',
    )
  }

  constructor(fields: { marker: string; noteId: string }, key?: NodeKey) {
    super(key)
    this.__fields = fields
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement('sup')
    element.className = 'epub-footnote-ref'
    element.setAttribute('data-note-id', this.__fields.noteId)
    return element
  }

  decorate(): React.ReactElement {
    return <>{this.__fields.marker}</>
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('sup')
    element.className = 'epub-footnote-ref'
    element.setAttribute('data-note-id', this.__fields.noteId)
    element.textContent = this.__fields.marker

    return { element }
  }

  exportJSON(): SerializedFootnoteRefNode {
    return {
      ...super.exportJSON(),
      type: 'footnote-ref',
      fields: this.__fields,
      version: 1,
    }
  }

  getFields(): { marker: string; noteId: string } {
    return this.getLatest().__fields
  }

  getTextContent(): string {
    return this.__fields.marker
  }

  isInline(): true {
    return true
  }

  updateDOM(prevNode: FootnoteRefNode, dom: HTMLElement): boolean {
    if (prevNode.__fields.noteId !== this.__fields.noteId) {
      dom.setAttribute('data-note-id', this.__fields.noteId)
    }

    if (prevNode.__fields.marker !== this.__fields.marker) {
      dom.textContent = this.__fields.marker
    }

    return false
  }

  setFields(fields: { marker: string; noteId: string }): this {
    const writable = this.getWritable()
    writable.__fields = fields
    return writable
  }

  setMarker(marker: string): this {
    return this.setFields({
      marker,
      noteId: this.__fields.noteId,
    })
  }

  setNoteId(noteId: string): this {
    return this.setFields({
      marker: this.__fields.marker,
      noteId,
    })
  }
}

function convertFootnoteRefElement(domNode: HTMLElement): DOMConversionOutput | null {
  const noteId = trimToEmpty(domNode.getAttribute('data-note-id'))

  if (!noteId) {
    return null
  }

  const marker = trimToEmpty(domNode.textContent)

  return {
    node: $createFootnoteRefNode(marker, noteId),
  }
}

export function $createFootnoteRefNode(marker: string, noteId: string): FootnoteRefNode {
  return $applyNodeReplacement(new FootnoteRefNode({ marker, noteId }))
}

export function $isFootnoteRefNode(
  node: LexicalNode | null | undefined,
): node is FootnoteRefNode {
  return node instanceof FootnoteRefNode
}