# Books and Blog Integration Guide

This guide explains how the new `books` and `chapters` APIs fit into the blog system.

The short version:

- Use **GraphQL** for read-heavy blog and public-facing pages.
- Use the **REST API** from browser-side admin components when you need to create or update data.
- Keep all business rules in Payload hooks and shared utilities, not in page components.

## When To Use GraphQL

Payload automatically exposes collections through GraphQL, so `Books` and `Chapters` are available without writing a custom resolver.

Use GraphQL when you need to:

- Render the book index page.
- Render a book detail page.
- Render a chapter page.
- Pull book metadata into blog posts, sidebars, or related-content blocks.
- Fetch read-only data from the frontend.

Use REST when you need to:

- Create a book from the EPUB importer.
- Upload media.
- Patch import state from the browser.
- Perform auth or admin session actions.

## Suggested Data Flow

1. The admin importer creates or updates `books` and `chapters`.
2. The blog frontend reads those collections through GraphQL.
3. Optional custom queries, like `SimilarPosts`, can be used to mix blog content with book content.
4. Hooks and utilities keep the data consistent regardless of whether it was authored manually or imported.

## GraphQL Examples

### List books

```graphql
query BooksPage($limit: Int = 12) {
  Books(limit: $limit, sort: "-createdAt") {
    docs {
      id
      title
      slug
      author
      origin
      importStatus
      cover {
        url
        alt
      }
      updatedAt
    }
    totalDocs
  }
}
```

### Fetch one book by slug

```graphql
query BookBySlug($slug: String!) {
  Books(where: { slug: { equals: $slug } }, limit: 1) {
    docs {
      id
      title
      slug
      author
      origin
      importStatus
      importStartedAt
      importFinishedAt
      cover {
        url
        alt
      }
    }
  }
}
```

### Fetch chapters for a book

```graphql
query ChaptersByBook($bookID: Int!) {
  Chapters(where: { book: { equals: $bookID } }, sort: "order") {
    docs {
      id
      title
      slug
      order
      chapterSourceKey
      chapterSourceHash
      manualEditedAt
      content
    }
    totalDocs
  }
}
```

### Fetch a single chapter

```graphql
query ChapterBySlug($slug: String!) {
  Chapters(where: { slug: { equals: $slug } }, limit: 1) {
    docs {
      id
      title
      slug
      order
      content
    }
  }
}
```

## Blog Integration Patterns

### Book landing page

Use the `Books` query to render cards for each book. A book card can show:

- Cover image.
- Title and author.
- Import status.
- Number of chapters.

If you want chapter counts, query `Chapters` with `where: { book: { equals: <bookID> } }` and read `totalDocs`.

### Book detail page

Use the book slug route to fetch the book and then fetch the chapters in order.

Recommended page shape:

- Header with title, author, and cover.
- Status badge for `manual`, `epub-imported`, or `synced`.
- Ordered chapter list.
- Optional read-only preview of the first chapter.

### Chapter page

Use the chapter slug route to fetch the chapter content, then render the Lexical JSON in read-only mode.

Keep the preview and reading UI read-only. Editing should happen in the admin shell.

### Blog post cross-links

If a post references a book, show a related book panel or chapter teaser next to the post.

If you want related blog content on a book page, the existing `SimilarPosts` custom GraphQL query can be used alongside the books and chapters queries.

## REST Usage For Admin Components

Browser-side admin components should use REST for mutations. That includes:

- Creating the initial `books` document.
- Patching import progress.
- Creating or updating `chapters`.
- Uploading media files.

This is the right place for `requestJSON` or `requestJSONWithRetry`-style helpers. Keep those helpers in `src/utils/http.ts` so every component uses the same transport behavior.

## Recommended File Responsibilities

- `src/components/admin/books/EpubImporter.tsx`: browser-side import orchestration.
- `src/utils/http.ts`: shared request helpers.
- `src/graphql/queries/SimilarPosts/`: blog recommendation query example.
- `docs/graphql-best-practices.md`: how to structure new queries or mutations.

## Notes For Later Phases

- Prefer GraphQL for frontend reads.
- Prefer REST for admin-side writes.
- Keep book and chapter business rules in hooks and shared utilities.
- Reuse the same Lexical JSON shape in the admin editor and the read-only blog renderer.
- If you add new book-facing queries, put them under `src/graphql/queries/` and document them here.
