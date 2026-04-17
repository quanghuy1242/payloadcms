# Feature Brainstorm

A loose collection of ideas across books, posts, and the reader experience. Nothing committed here - just things worth remembering.

---

## Books

### 1a. Private books (auth-gated content)

The idea is a `visibility` field on a book: `public` or `private`. Private books and their chapters would not appear in the blog's GraphQL query results unless the requester can prove access.

Key decision: **do not reinvent user management or roles here**. Auther already has a full ReBAC engine with groups, policy templates, and a `POST /api/auth/check-permission` endpoint. The right move is to register a `book` entity type in Auther's authorization model, then call Auther's check-permission API from this repo or the blog to gate reads.

Rough role model (leaning on what Auther already supports):

| Role | What they can do |
|---|---|
| admin | Everything, all books visible in Payload admin |
| editor | Create and edit books/posts, see their own drafts on blog |
| viewer | Read-only access to private books they have been granted on |

`editor` and `viewer` are not Payload-level roles today - they would be Auther-level relations on a `book` entity (e.g., `book:{id}` with relation `reader` granted to a user or group). Payload only needs to know "is this request allowed?" and delegate that check to Auther.

On the blog side: forward the Better Auth session token to Payload when fetching books or chapters. Payload already maps that token to a local user and can apply the book read access rule server-side, so the blog does not need a separate permission decision or a manual public/private filter.

Access request flow: "Request access" button on a locked book page that emails the admin or opens an invite link. Auther already has invite/registration context support.

For internal management in Payload admin: a sidebar panel on the book showing who has been granted viewer access (query Auther's access list for that book entity). This avoids duplicating the access list in Payload's own DB.

### 1b. Chapter-level password lock

WordPress-style: a chapter has an optional `password` field in Payload. The blog shows a password input gate before rendering chapter content. No authentication required - anyone with the password can read it.

Implementation sketch:
- Add `password` (text, optional) to `Chapters` collection
- Payload does not expose the password to the GraphQL/REST response (mark as `hidden` in access, or strip it in an afterRead hook, return only a boolean `hasPassword: true`)
- Blog shows a form gate when `hasPassword` is true; the user submits the password, blog sends it to a small Payload endpoint (`/api/chapters/:id/unlock`) which compares and returns a short-lived signed token
- Blog stores the token in session storage; subsequent chapter reads include the token as a query param or header

This is self-contained in this repo. No Auther involved.

### 1c. Reader features (for logged-in viewers)

Ideas gated behind having an authenticated viewer identity:

**Reading progress**
- Store `(userId, chapterId, scrollPercent, lastReadAt)` in a `ReadingProgress` collection in Payload
- Blog saves progress on scroll (debounced) via a REST call
- Book detail page shows a progress bar or "Continue from chapter N" CTA
- For anonymous users: fall back to localStorage, optionally sync to server on login

**Comments**
- Simplest: use Giscus (GitHub Discussions) or a similar hosted service - zero backend work
- In-house option: a `Comments` collection in Payload with `(post/chapter reference, author, content, status: pending|approved)`; admin moderates from Payload admin UI
- Either way the blog renders them at the bottom of a chapter/post

**Inline / paragraph-level comments**
- Complex. Would need anchor data (which Lexical node/block the comment is attached to)
- Worth noting as a future idea but a lot of work to get right

**Bookmarks**
- Simple: `(userId, bookId, chapterId)` collection, heart/bookmark button on chapter pages
- Show bookmarked chapters on a user profile page or in a "Your shelf" section

### 1d. Editor preview mode

Different from private sharing. An editor wants to see exactly how an unpublished chapter looks on the blog before publishing.

Payload already supports draft content (`_status: 'draft'`). Next.js has draft mode (formerly preview mode).

Rough flow:
- Editor clicks a "Preview on blog" button in Payload admin (a custom component)
- That button calls a Payload API route that generates a signed short-lived draft token for that document
- Blog receives the token at `/api/draft?token=...&redirect=/books/...`, validates it, enables Next.js draft mode, which tells the GraphQL client to include `_status: draft` in queries
- Blog renders the unpublished chapter normally, with a "Draft preview" banner

This is orthogonal to private-book access. A draft can be private without being in the viewer sharing system.

### 1e. Other book ideas

- **Estimated reading time** - count words in chapter Lexical content, display alongside chapter title in the ToC (server-side, stored as a computed field updated on save)
- **Search** - full-text search across chapter content; SQLite FTS5 is already there since the DB is SQLite; expose a `/api/search?q=` route returning matching chapters and posts
- **Chapter typography settings** - font size, line height, serif/sans toggle - purely blog-side, localStorage only
- **Download** - "Download as EPUB" button on book detail page that regenerates an EPUB from the stored Lexical content (reverse of the import pipeline)
- **Book series / collections** - group related books into a series with an ordered reading path

---

## Posts

No strong new ideas from you - here are a few worth considering:

- **Post series** - a `series` relationship field linking posts into an ordered sequence; blog renders a "Part N of M" breadcrumb and prev/next within series
- **View counts** - a lightweight anonymous counter; on page view the blog calls a small Payload endpoint that increments a counter field (no auth needed, use rate-limiting to prevent abuse)
- **Reactions** - a single emoji reaction (like a heart count) per post, stored similarly to view counts, no account required
- **Better related posts** - the similar-posts GraphQL query already exists; surface it more prominently below the post content or in the sidebar
- **RSS feed** - expose `GET /feed.xml` from this repo (or the blog) so readers can subscribe; Payload's REST API makes this straightforward to build as a small Next.js route

---

## Cross-cutting

- **Unified search** across posts and book chapters (mentioned above)
- **Webhooks to blog** - Auther already has a full webhook system; on book published / post published, fire a webhook to the blog to trigger ISR revalidation instead of relying on polling
- **API keys for the blog** - Auther supports M2M API keys; the blog's server-side GraphQL client could authenticate with an API key scoped to read-only book/post resources instead of a hardcoded author ID filter
