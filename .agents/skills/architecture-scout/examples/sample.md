# Architecture Scout Example

## Request: "Add word count to chapters"

**Layer decision**: Utility (`src/utils/chapterRichText.ts`)

**Rationale**: Word count is a pure, testable operation on Lexical JSON. It has no UI dependency and could be consumed by both the admin UI and a future API endpoint.

**Files to change**:
- `src/utils/chapterRichText.ts` — add `countWordsInLexical(content: SerializedEditorState): number`
- `tests/int/` — add integration spec for the new helper

**Files NOT to change**:
- `src/collections/Chapters.ts` — collection stays thin
- `src/components/admin/chapters/` — call the utility; do not own the logic

**Boundary violation spotted**: A draft PR added the word-count function directly into a React component. That component would then become untestable without a browser renderer.