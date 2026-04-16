# Lexical Node Scaffold Example: YouTube feature (existing reference)

## Feature name: `youtube`

## Files created

```
src/features/youtube/
├── feature.server.ts        # YouTubeFeature — createServerFeature
├── feature.client.ts        # YouTubeFeatureClient — createClientFeature + toolbar
├── nodes/
│   └── YouTubeNode.tsx      # DecoratorNode with videoId + url fields
├── components/
│   └── YouTubeComponent.tsx # React embed component (lazy-loaded)
├── plugin/
│   └── index.tsx            # INSERT_YOUTUBE_COMMAND handler
└── icons/
    └── YouTubeIcon.tsx      # SVG icon
```

## Serialized type

```typescript
export type SerializedYouTubeNode = Spread<
  { videoId: string; url: string },
  SerializedLexicalNode
>
```

## `static getType()` → `'youtube'`

## HTML converter output

```html
<div class="youtube-embed-container">
  <iframe src="https://www.youtube.com/embed/{videoId}" ...></iframe>
</div>
```

## Registration

- Added to `src/payload.config.ts` features: `YouTubeFeature()`
- Not in `chapterLexicalNodes.ts` (added only if EPUB imports need to emit it)
