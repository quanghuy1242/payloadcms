import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
} from 'lexical'

import { $applyNodeReplacement } from 'lexical'
import { HeadingNode, type HeadingTagType } from '@lexical/rich-text'
import type {
  SerializedHeadingNode,
  StronglyTypedElementNode,
} from '@payloadcms/richtext-lexical'

import { parseDelimitedIdentifiers, sanitizeIdentifiers } from '../../../utils/identifiers'

export type SerializedEpubHeadingNode<
  T extends SerializedLexicalNode = SerializedLexicalNode,
> = {
  id?: string
  fields?: {
    anchorIds: string[]
  }
} & StronglyTypedElementNode<SerializedHeadingNode, 'heading', T>

const HEADING_TAGS: HeadingTagType[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

const syncHeadingAnchorAttributes = (element: HTMLElement, anchorIds: string[]): void => {
  const primaryAnchorId = anchorIds[0]

  if (primaryAnchorId) {
    element.setAttribute('id', primaryAnchorId)
  } else {
    element.removeAttribute('id')
  }

  if (anchorIds.length > 0) {
    element.setAttribute('data-anchor-ids', anchorIds.join(' '))
  } else {
    element.removeAttribute('data-anchor-ids')
  }
}

const convertEpubHeadingElement = (domNode: HTMLElement): DOMConversionOutput | null => {
  const tag = domNode.tagName.toLowerCase() as HeadingTagType

  if (!HEADING_TAGS.includes(tag)) {
    return null
  }

  return {
    node: $createEpubHeadingNode(tag, [
      domNode.getAttribute('id'),
      ...parseDelimitedIdentifiers(domNode.getAttribute('data-anchor-ids')),
    ]),
  }
}

export class EpubHeadingNode extends HeadingNode {
  __anchorIds: string[]

  static clone(node: EpubHeadingNode): EpubHeadingNode {
    return new EpubHeadingNode(node.__tag, node.__anchorIds, node.__key)
  }

  static getType(): string {
    return 'heading'
  }

  static importDOM(): DOMConversionMap | null {
    const baseImportDOM = HeadingNode.importDOM()

    if (!baseImportDOM) {
      return null
    }

    return {
      ...baseImportDOM,
      h1: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
      h2: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
      h3: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
      h4: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
      h5: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
      h6: () => ({
        conversion: convertEpubHeadingElement,
        priority: 2,
      }),
    }
  }

  static importJSON(serializedNode: SerializedEpubHeadingNode): EpubHeadingNode {
    const node = $createEpubHeadingNode(
      serializedNode.tag,
      [serializedNode.id, ...(serializedNode.fields?.anchorIds ?? [])],
    )

    return node.updateFromJSON(serializedNode)
  }

  constructor(tag: HeadingTagType, anchorIds: Iterable<unknown> = [], key?: NodeKey) {
    super(tag, key)
    this.__anchorIds = sanitizeIdentifiers(anchorIds)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config)
    syncHeadingAnchorAttributes(element, this.__anchorIds)
    return element
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor)

    if (output.element instanceof HTMLElement) {
      syncHeadingAnchorAttributes(output.element, this.__anchorIds)
    }

    return output
  }

  exportJSON(): SerializedEpubHeadingNode {
    const anchorIds = this.getAnchorIds()
    const serializedNode = {
      ...super.exportJSON(),
      tag: this.getTag(),
    } as SerializedEpubHeadingNode

    if (anchorIds.length > 0) {
      serializedNode.id = anchorIds[0]
      serializedNode.fields = {
        anchorIds,
      }
    }

    return serializedNode
  }

  getAnchorId(): string | null {
    return this.__anchorIds[0] ?? null
  }

  getAnchorIds(): string[] {
    return [...this.__anchorIds]
  }

  getFields(): { anchorIds: string[] } {
    return {
      anchorIds: this.getAnchorIds(),
    }
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const didUpdate = super.updateDOM(prevNode, dom, config)
    syncHeadingAnchorAttributes(dom, this.__anchorIds)
    return didUpdate
  }

  updateFromJSON(serializedNode: SerializedEpubHeadingNode): this {
    const writable = super.updateFromJSON(
      serializedNode as unknown as LexicalUpdateJSON<SerializedHeadingNode>,
    ) as this

    writable.__anchorIds = sanitizeIdentifiers([
      serializedNode.id,
      ...(serializedNode.fields?.anchorIds ?? []),
    ])

    return writable
  }

  setAnchorIds(anchorIds: Iterable<unknown>): this {
    const writable = this.getWritable()
    writable.__anchorIds = sanitizeIdentifiers(anchorIds)
    return writable
  }
}

export function $createEpubHeadingNode(
  tag: HeadingTagType = 'h2',
  anchorIds: Iterable<unknown> = [],
): EpubHeadingNode {
  return $applyNodeReplacement(new EpubHeadingNode(tag, anchorIds))
}

export function $isEpubHeadingNode(
  node: LexicalNode | null | undefined,
): node is EpubHeadingNode {
  return node instanceof EpubHeadingNode
}
