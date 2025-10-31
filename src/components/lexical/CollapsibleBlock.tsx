'use client'

import React, { useState } from 'react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

interface CollapsibleBlockProps {
  title: string
  content: SerializedEditorState
  defaultOpen?: boolean
}

export const CollapsibleBlock: React.FC<CollapsibleBlockProps> = ({
  title,
  content,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  // Simple function to extract text content from Lexical state
  const extractTextContent = (editorState: SerializedEditorState): string => {
    const getText = (node: any): string => {
      if (node.type === 'text') {
        return node.text || ''
      }
      if (node.children && Array.isArray(node.children)) {
        return node.children.map(getText).join('')
      }
      return ''
    }

    if (editorState?.root?.children) {
      return editorState.root.children.map(getText).join('\n')
    }
    return ''
  }

  const textContent = extractTextContent(content)

  return (
    <div
      style={{
        margin: '1rem 0',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          border: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          textAlign: 'left',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#f9fafb'
        }}
      >
        <span>{title}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fff',
            borderTop: '1px solid #e5e7eb',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6',
          }}
        >
          {textContent}
        </div>
      )}
    </div>
  )
}
