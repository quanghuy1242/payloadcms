# Book Chapter Management UI — Planning Document

## Overview

Three tightly related changes to the PayloadCMS admin UI for the `books` / `chapters` collections:

1. **Chapter List Drawer** — a "View Chapters" button on the Book edit page that opens a `ListDrawer` flyout pre-filtered to the current book's chapters.
2. **Protected Delete Button** — the Book delete button is disabled when the book has any chapters; it re-enables once all chapters are removed.
3. **Hide Chapters from Nav** — the `chapters` collection no longer appears in the sidebar navigation.

---

## Background & Constraints

| Item | Detail |
|------|--------|
| PayloadCMS version | 3.60.0 (`@payloadcms/ui` 3.60.0) |
| Admin framework | Next.js App Router, `'use client'` components |
| Existing drawer precedent | `MediaGridView.tsx` uses `useListDrawerContext` inside a drawer; `useListDrawer` hook from `@payloadcms/ui` is already a dependency |
| Existing custom component slot | `Books.ts` uses `admin.components.beforeList` for `EpubImporter` |
| Chapter → Book relationship | `chapters.book` field is `type: 'relationship'`, `relationTo: 'books'`, `required: true`, `index: true` |

---

## Feature 1 — Chapter List Drawer

### Goal
On the Book edit/detail page, render a "View Chapters (N)" button that opens a PayloadCMS `ListDrawer` showing only the chapters belonging to the current book. The pattern mirrors the existing upload field flyout (click → modal list → can navigate into a document from within the drawer).

### PayloadCMS API Used

#### `useListDrawer` hook (`@payloadcms/ui`)
```ts
const [ListDrawerToggler, ListDrawer, { isDrawerOpen, openDrawer, closeDrawer }] =
  useListDrawer({
    collectionSlugs: ['chapters'],
    filterOptions: {
      book: { equals: bookId },
    },
    // optional: drawerSlug for uniqueness if multiple instances could exist
  })
```
`filterOptions` maps directly to Payload `where` query syntax. This renders a standard Payload collection list inside a slide-in drawer — identical UX to the media upload flyout.

#### `useDocumentInfo` hook (`@payloadcms/ui`)
```ts
const { id, collectionSlug } = useDocumentInfo()
// id is the book's ID (string | number | null for new docs)
```
Used to obtain the current book ID to pass as the filter value.

#### `useFormFields` hook (`@payloadcms/ui`) — optional
Can be used to read `importTotalChapters` / `importCompletedChapters` fields to show a richer chapter count in the button label without an extra API call.

### New File

**`src/components/admin/books/ChapterListButton.tsx`**

Responsibilities:
- `'use client'` component
- Read current book `id` from `useDocumentInfo`
- Fetch chapter count from `/api/chapters?where[book][equals]={id}&limit=0` on mount (and after drawer closes, to refresh the count)
- Build the `ListDrawer` with `filterOptions: { book: { equals: id } }` and `collectionSlugs: ['chapters']`
- Render a `<Button>` (use `Button` from `@payloadcms/ui` for consistent styling) labelled **"Chapters (N)"**
- When `id` is null (new unsaved document), render the button as disabled with tooltip "Save the book first"
- Wrap `ListDrawerToggler` around the button

State shape:
```ts
type State = {
  chapterCount: number | null   // null = loading
  loading: boolean
}
```

### Integration into `Books.ts`

Add a `ui` type field at the end of the `fields` array:

```ts
{
  name: 'chaptersPanel',
  type: 'ui',
  label: 'Chapters',
  admin: {
    components: {
      Field: '/components/admin/books/ChapterListButton',
    },
    description: 'Browse and manage chapters for this book.',
  },
},
```

`ui` fields render custom React components inline in the form without storing any data to the database — no schema migration needed.

### UX Details

| State | Button label | Button state |
|-------|-------------|--------------|
| Book not yet saved (`id == null`) | "Chapters" | Disabled, tooltip "Save the book first" |
| Loading count | "Chapters (…)" | Normal |
| 0 chapters | "Chapters (0)" | Normal (opens empty drawer) |
| N chapters | "Chapters (N)" | Normal |

Inside the drawer:
- Standard Payload list view for `chapters`, pre-filtered.
- User can click a chapter row to open the chapter's edit drawer (PayloadCMS default drawer-within-drawer behaviour).
- After drawer closes, the count re-fetches automatically.

### Placement in the Form

The `ui` field will appear in the main column of the form below the `content` / richText fields. If a different position is preferred (e.g. sidebar), the field can use `admin.position: 'sidebar'`.

---

## Feature 2 — Protected Delete Button

The delete protection is implemented at **two layers**: API hook (authoritative) and UI hint (user-facing).

### Layer A — `beforeDelete` Hook (API-level guard)

**File**: `src/collections/Books.ts`

```ts
hooks: {
  beforeDelete: [
    async ({ id, req }) => {
      const result = await req.payload.count({
        collection: 'chapters',
        where: { book: { equals: id } },
      })
      if (result.totalDocs > 0) {
        throw new Error(
          `Cannot delete book: it has ${result.totalDocs} chapter(s). Remove all chapters first.`,
        )
      }
    },
  ],
  ...
}
```

This ensures even direct API / REST / GraphQL delete calls are blocked. The error message surfaced here is what the admin UI toast will display.

### Layer B — Custom Delete Button Component (UI-level hint)

**New file**: `src/components/admin/books/DeleteBookButton.tsx`

Responsibilities:
- `'use client'`
- Read `id` from `useDocumentInfo`
- Fetch `/api/chapters?where[book][equals]={id}&limit=0` (same call as `ChapterListButton`, can share a utility function)
- Render the **standard Payload `DeleteDocument` button** when chapter count is 0
- Render a **disabled button** with tooltip "Remove all chapters before deleting this book" when count > 0

PayloadCMS 3.x exposes a `DeleteDocument` component from `@payloadcms/ui` that can be rendered as-is. Our wrapper conditionally renders it or a disabled stand-in.

```tsx
// Pseudocode
if (hasChapters) {
  return <Button disabled title="Remove all chapters first">Delete</Button>
}
return <DeleteDocument /> // standard Payload delete button
```

**Integration in `Books.ts`**:

```ts
admin: {
  components: {
    edit: {
      DeleteButton: '/components/admin/books/DeleteBookButton',
    },
    beforeList: ['/components/admin/books/EpubImporter'],  // keep existing
  },
}
```

### Shared Utility Function

Both `ChapterListButton` and `DeleteBookButton` need the chapter count for a given book. Extract this into a small helper to avoid duplication:

**`src/utils/chapterCount.ts`** (or inline in each file — decide at implementation time based on DRY):
```ts
export async function fetchChapterCount(bookId: string | number): Promise<number> {
  const res = await fetch(`/api/chapters?where[book][equals]=${bookId}&limit=0`)
  const json = await res.json()
  return json.totalDocs ?? 0
}
```

This is a browser-side only utility calling the Payload REST API. Follow the pattern from `src/utils/http.ts` (`requestJSON` / `requestJSONWithRetry`) rather than raw `fetch`.

---

## Feature 3 — Hide Chapters from Nav

### Change

**File**: `src/collections/Chapters.ts`

Add `hidden: true` to the `admin` object:

```ts
admin: {
  hidden: true,           // <-- add this
  useAsTitle: 'title',
  defaultColumns: ['title', 'book', 'order', '_status', 'updatedAt'],
},
```

PayloadCMS `admin.hidden` can be a boolean or a function `({ user }) => boolean`. Using the boolean `true` removes the collection from the sidebar for all users. Chapters are still accessible via the drawer opened from the Book detail page, and admin users can still navigate to `/admin/collections/chapters` directly via URL if needed.

> **Note**: Hiding the collection from nav does **not** remove API access. The `chapters` REST and GraphQL endpoints remain fully functional.

---

## Implementation Order

Because of dependencies between the changes, implement in this order:

| Step | Task | Verify |
|------|------|--------|
| 1 | Add `beforeDelete` hook to `Books.ts` | `DELETE /api/books/{id}` with chapters returns 400 with error message |
| 2 | Add `hidden: true` to `Chapters.ts` admin config | Chapters entry disappears from sidebar nav |
| 3 | Create `ChapterListButton.tsx` and wire as UI field in `Books.ts` | Button appears on Book detail page; drawer opens with filtered chapters |
| 4 | Create `DeleteBookButton.tsx` and wire as `edit.DeleteButton` in `Books.ts` | Delete button is disabled when chapters exist; enabled when none |
| 5 | Extract shared `fetchChapterCount` to `src/utils/http.ts` or a nearby util | Both components import the same function |

Step 2 can be done independently. Steps 3 and 4 can be done in parallel.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/admin/books/ChapterListButton.tsx` | UI field component — chapter drawer trigger |
| `src/components/admin/books/DeleteBookButton.tsx` | Custom delete button with chapter-count guard |

## Files to Modify

| File | Change |
|------|--------|
| `src/collections/Books.ts` | Add `beforeDelete` hook; add `chaptersPanel` UI field; add `edit.DeleteButton` component reference |
| `src/collections/Chapters.ts` | Add `admin.hidden: true` |

---

## Edge Cases & Considerations

### Drafts
Books use drafts with autosave. When a new book is first autosaved, `id` becomes available. The `ChapterListButton` component should react to `id` changing from `null` to a value (re-fetch count, enable button).

### Permissions
The chapter count fetch call hits `/api/chapters` which is guarded by `authenticatedAccess`. The admin panel always runs as an authenticated user so this is fine. No anonymous access edge case.

### Performance
`limit=0` on the chapters query returns `totalDocs` without fetching document bodies — efficient even with many chapters.

### Race Conditions
After the drawer closes, there is a brief window where the chapter count shown on the button is stale. Refresh the count with a short delay or on `onDrawerClose` callback from `useListDrawer`. See whether `useListDrawer` exposes an `onClose` option in 3.60.

### Import Running
If a book import is currently running (adding chapters in the background), the count shown on the button may be incrementally increasing. This is cosmetic — the hook protection is the authoritative gate.

### `@ts-ignore` Policy
Per project conventions (`docs/agentic-ai.md`), do **not** add `@ts-ignore` unless dealing with known Payload plugin type issues. Prefer explicit type casting with `as` to handle gaps in PayloadCMS's public type exports.

### No Schema Migration Needed
The `ui` field type (`chaptersPanel`) is purely a render slot — it writes nothing to the database. No migration is required for Features 1, 2, or 3. The `beforeDelete` hook is also migration-free.

---

## PayloadCMS 3.x Component Slot Reference

For quick reference during implementation:

| Slot path in `CollectionConfig.admin.components` | Purpose |
|------|---------|
| `beforeList` | Banner above the collection list page |
| `beforeListTable` | Content injected before the table rows (used by `MediaGridView`) |
| `edit.DeleteButton` | Replace the delete button on the document edit page |
| `edit.SaveButton` | Replace the save button |
| `edit.Description` | Replace the description area |
| `afterDocument` | Content appended after the whole document form |
| Fields `type: 'ui'` | Custom React component rendered as an inline field — best pattern for adding a chapter drawer button within the form |

---

## Open Questions (resolve before coding)

1. **Position of `chaptersPanel` field**: Main column (default) vs. sidebar? Sidebar may be cleaner since it's metadata rather than content. Decide based on visual review.
2. **`useListDrawer` filter syntax in 3.60**: Confirm `filterOptions` vs `initialWhere` prop name — check `node_modules/@payloadcms/ui` types at implementation time.
3. **`DeleteDocument` export**: Confirm the exact named export from `@payloadcms/ui` for the standard delete button component (`DeleteDocument`, `DeleteWithConfirm`, or similar).
4. **Drawer slug uniqueness**: If a user opens two browser tabs with different books, `useListDrawer` may need a unique `drawerSlug` derived from the book ID to avoid conflicts.
