import type { Klass, LexicalNode, LexicalNodeReplacement } from 'lexical'
import { LineBreakNode, ParagraphNode, TextNode } from 'lexical'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'

import { EpubCalloutNode } from '../features/epub-callout/nodes/EpubCalloutNode'

/**
 * The complete set of Lexical node classes registered for the chapter rich-text editor.
 * Any node type used inside chapter content must appear here; missing entries cause
 * Lexical to throw an "unknown node" error at render or serialization time.
 */
export const chapterLexicalNodes: Array<Klass<LexicalNode> | LexicalNodeReplacement> = [
  ParagraphNode,
  TextNode,
  LineBreakNode,
  HeadingNode,
  QuoteNode,
  LinkNode,
  AutoLinkNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  EpubCalloutNode,
]
