---
name: lexical-node-scaffold
description: Scaffold and review custom Lexical feature nodes following the youtube/epub-footnote-ref pattern. Use when adding a new rich text node, Lexical plugin, toolbar button, or asked "how do I add a custom block to the editor?" or "how do I create a Lexical plugin?".
argument-hint: "[NodeName] e.g. Callout, CodeBlock, Footnote"
---

# Lexical Node Scaffold

Use this skill when adding a new custom Lexical feature. All features live under `src/features/`.

## Required directory layout

```
src/features/<feature-name>/
├── feature.server.ts        # createServerFeature() — registers node + HTML converter
├── feature.client.ts        # 'use client' — createClientFeature(), toolbar/slash menu
├── nodes/
│   └── <FeatureName>Node.tsx  # DecoratorNode class + SerializedType
├── components/
│   └── <FeatureName>Component.tsx  # React component rendered by the node (lazy-loaded)
├── plugin/
│   └── index.tsx            # Lexical plugin — handles commands, key bindings
└── icons/
    └── <FeatureName>Icon.tsx  # SVG icon for toolbar button (optional)
```

## Node class contract (`nodes/<Name>Node.tsx`)

```typescript
import { DecoratorNode } from '@payloadcms/richtext-lexical/lexical'
import type { SerializedLexicalNode, Spread } from '@payloadcms/richtext-lexical/lexical'

export type Serialized<Name>Node = Spread<
  { myData: string },        // your node-specific fields
  SerializedLexicalNode
>

export class <Name>Node extends DecoratorNode<React.ReactNode> {
  static getType(): string { return '<feature-name>' }
  static clone(node: <Name>Node): <Name>Node { ... }
  static importJSON(serialized: Serialized<Name>Node): <Name>Node { ... }
  exportJSON(): Serialized<Name>Node { ... }
  createDOM(): HTMLElement { ... }
  updateDOM(): false { return false }
  decorate(): React.ReactNode {
    // Lazy-load the React component
    const Comp = React.lazy(() => import('../components/<Name>Component.js').then(...))
    return <React.Suspense fallback={null}><Comp {...props} /></React.Suspense>
  }
}
export const $is<Name>Node = (node): node is <Name>Node => node instanceof <Name>Node
export const $create<Name>Node = (data: string): <Name>Node => $applyNodeReplacement(new <Name>Node(data))
```

## Server feature contract (`feature.server.ts`)

```typescript
import { createServerFeature } from '@payloadcms/richtext-lexical'
import { <Name>Node } from './nodes/<Name>Node'

export const <Name>Feature = createServerFeature({
  feature: {
    ClientFeature: '@/features/<feature-name>/feature.client#<Name>FeatureClient',
    nodes: [{
      node: <Name>Node,
      converters: {
        html: {
          converter: async ({ node }) => `<div class="<feature-name>">${node.myData}</div>`,
          nodeTypes: [<Name>Node.getType()],
        },
      },
    }],
  },
  key: '<feature-name>',
})
```

## Registration in `src/payload.config.ts`

Add the server feature to the Lexical editor's `features` array:
```typescript
features: [
  // ... existing features
  <Name>Feature(),
]
```

## Check

- `feature.server.ts` uses `createServerFeature` and provides a `ClientFeature` path.
- `feature.client.ts` has `'use client'` at the top and uses `createClientFeature`.
- The node class extends `DecoratorNode`, not `ElementNode` (unless it's a container node).
- `static getType()` returns a unique, stable string key (kebab-case, matches `key` in server feature).
- `exportJSON` / `importJSON` are symmetric (same fields, no data loss on round-trip).
- The React component is **lazy-loaded** inside `decorate()` to avoid SSR issues.
- HTML converter in `feature.server.ts` handles all fields from `SerializedType`.
- The node type is added to `src/utils/chapterLexicalNodes.ts` if it appears in chapter content.
- Toolbar/slash menu entry has a meaningful label and icon.

## Common failure modes

- Forgetting `'use client'` in `feature.client.ts` — causes hydration errors.
- Synchronous import of the React component in `decorate()` — breaks SSR.
- `getType()` returning a value that conflicts with an existing node type.
- `exportJSON` / `importJSON` mismatch — causes data corruption on re-serialization.
- Not registering the node in `chapterLexicalNodes.ts` — EPUB importer cannot emit it.

## Output rule

Describe the full file structure to create, the node's serialized type, and confirm the HTML converter handles all fields. Call out any missing piece explicitly.

## Supporting files

- [template.md](template.md) for a node scaffold skeleton.
- [examples/sample.md](examples/sample.md) for the YouTube node as a reference implementation.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.
