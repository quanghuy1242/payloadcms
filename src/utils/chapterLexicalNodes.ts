import type { Klass, LexicalNode, LexicalNodeReplacement } from 'lexical'
import { LineBreakNode, ParagraphNode, TextNode } from 'lexical'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'

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
]
