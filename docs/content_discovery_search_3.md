# Content Discovery - Search and Recommendations (Phase 3)

Four tightly coupled features:

- **A. Full-text search** — Turso Tantivy-powered keyword search across posts and chapters.
- **B. Vector search** — semantic similarity via Gemini `text-embedding-004` (768 dims) stored in Turso BLOB columns.
- **C. Hybrid search** — merge A + B results with Reciprocal Rank Fusion (RRF) for a single ranked list.
- **D. Recommendations** — content-based (tags/author, Phase 3), semantic (embeddings, Phase 3.5), and behavioral co-reading (Phase 2 data required).

**Critical prerequisite**: Turso's custom FTS and vector functions only work against a Turso/libSQL server. The local `better-sqlite3` fallback does not support `fts_match()`, `fts_score()`, `vector32()`, or `vector_distance_cos()`. Local dev options are discussed in the Dev Strategy section.

---

## Background: Turso vs SQLite FTS

The previous plan was based on SQLite FTS5. **Turso does not support FTS3/FTS4/FTS5.** Instead it implements full-text search via the [Tantivy](https://github.com/quickwit-oss/tantivy) engine with a completely different API:

| Capability | SQLite FTS5 | Turso Tantivy |
|---|---|---|
| Create index | `CREATE VIRTUAL TABLE ... USING fts5` | `CREATE INDEX ... USING fts` |
| Match filter | `WHERE t MATCH 'query'` | `WHERE fts_match(col, 'query')` |
| Score column | `rank` (negative BM25, lower = better) | `fts_score(col, 'query')` (positive, higher = better) |
| Highlight | `highlight(t, n, ...)` | `fts_highlight(col, before, after, query)` |
| Snippets | `snippet(t, ...)` | **Not supported** |
| DML sync | manual triggers required | **Automatic** (no triggers needed) |
| Backfill | manual `INSERT SELECT` required | **Automatic** (index built at `CREATE INDEX` time) |
| Vector search | `sqlite-vec` extension (external) | **Native** `vector32()`, `vector_distance_cos()` |

---

## Dev Strategy: Local SQLite vs Turso

Turso's Tantivy FTS (`fts_match`, `fts_score`, `fts_highlight`) and vector functions (`vector32`, `vector_distance_cos`) only exist in the Turso binary. The `better-sqlite3` driver used for local dev does not know these functions and will throw on any query that uses them.

**Two options for local development:**

**Option A — LIKE fallback (default)**: When `TURSO_DATABASE_URL` is not set, the search API returns a basic `LIKE`-based result with no ranking or highlighting. Good enough for UI development; not useful for tuning search quality.

**Option B — `turso dev` (recommended for search work)**: Run `turso dev --port 8080` to start a local Turso-compatible server that supports all Tantivy and vector features. Set `TURSO_DATABASE_URL=libsql://127.0.0.1:8080` and `TURSO_AUTH_TOKEN=` (empty). The app will use the libsql adapter with full feature parity. The local Turso dev server starts empty; run `pnpm payload migrate` to apply migrations against it.

**Migration guard**: The migration `.ts` file wraps FTS/vector DDL in a `TURSO_DATABASE_URL` check so `pnpm payload migrate` succeeds in both local (better-sqlite3) and Turso environments. The `ALTER TABLE ... ADD COLUMN embedding BLOB` DDL works in both.

---

## Confirmed Table & Column Names

Verified from `src/migrations/*.json`:

| Collection | Table | Relevant columns |
|---|---|---|
| `posts` | `posts` | `id`, `title`, `excerpt`, `_status` |
| `chapters` | `chapters` | `id`, `title`, `book_id`, `_status` |
| `books` | `books` | `id`, `title`, `author`, `_status` |

The chapters-to-book relation is `book_id` (not `book`). FTS indexes are placed directly on these tables.

---

## A. Full-Text Search (Turso Tantivy)

### 1. FTS Indexes

Create a new migration: `pnpm payload migrate:create --name search_setup`

In the generated `.ts` file, manually write:

```ts
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'
import { sql } from 'drizzle-orm'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const isTurso = Boolean(process.env.TURSO_DATABASE_URL)

  if (isTurso) {
    // FTS indexes — Turso Tantivy syntax, not FTS5
    // DML (INSERT/UPDATE/DELETE) automatically maintains these indexes.
    // No triggers or backfill INSERTs needed.
    await db.run(sql`
      CREATE INDEX idx_posts_fts ON posts USING fts (title, excerpt)
        WITH (weights = 'title=2.0,excerpt=1.0')
    `)
    await db.run(sql`
      CREATE INDEX idx_chapters_fts ON chapters USING fts (title)
    `)
  }

  // Vector embedding columns — standard BLOB, works in both better-sqlite3 and Turso
  await db.run(sql`ALTER TABLE posts ADD COLUMN embedding BLOB`)
  await db.run(sql`ALTER TABLE chapters ADD COLUMN embedding BLOB`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const isTurso = Boolean(process.env.TURSO_DATABASE_URL)
  if (isTurso) {
    // Note: DROP INDEX is partially supported in Turso. Verify before running in prod.
    await db.run(sql`DROP INDEX IF EXISTS idx_posts_fts`)
    await db.run(sql`DROP INDEX IF EXISTS idx_chapters_fts`)
  }
  // Dropping BLOB columns requires table recreation in SQLite. Skip for now.
}
```

Key differences from FTS5:
- `CREATE INDEX ... USING fts` (not `CREATE VIRTUAL TABLE ... USING fts5`)
- No triggers — DML automatically updates the Tantivy index
- No backfill `INSERT SELECT` — `CREATE INDEX` indexes all existing rows at creation time
- Per-field weights via `WITH (weights = 'col=N.N')` — title matches rank higher than excerpt

After creating the migration, edit the generated `.json` file to leave the `tables`/`columns` sections empty (this migration only modifies indexes and adds a BLOB column via raw SQL; let Payload's migration runner handle the SQL execution from the `.ts` file).

### 2. Query Sanitization

Turso's Tantivy query parser supports AND, OR, NOT, phrase (`"exact phrase"`), prefix (`word*`), and field-specific (`title:word`) syntax. Strip user input of reserved characters before passing to `fts_match`:

```ts
function sanitizeTantivyQuery(raw: string): string {
  // Remove Tantivy special characters to prevent query injection
  const stripped = raw.replace(/[:"^~()\[\]{}|\\]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!stripped) return '""'
  // Prefix match on last token for autocomplete-style behavior
  return stripped
    .split(' ')
    .map((token, i, arr) => (i === arr.length - 1 ? `${token}*` : token))
    .join(' AND ')
}
```

Using `AND` between tokens means all terms must be present (higher precision). For broader recall, replace `AND` with a space (OR semantics).

### 3. Search API Endpoint

**Route**: `src/app/api/search/route.ts`
(NOT inside `src/app/(payload)/api/` — custom routes placed there conflict with Payload's `[...slug]` catch-all.)

```ts
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

function sanitizeTantivyQuery(raw: string): string {
  const stripped = raw.replace(/[:"^~()\[\]{}|\\]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!stripped) return '""'
  return stripped
    .split(' ')
    .map((t, i, arr) => (i === arr.length - 1 ? `${t}*` : t))
    .join(' AND ')
}

const LIMIT = 20

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return Response.json({ posts: [], chapters: [] })

  const isTurso = Boolean(process.env.TURSO_DATABASE_URL)
  const payload = await getPayload({ config: configPromise })
  const db = (payload.db as { drizzle: LibSQLDatabase }).drizzle

  if (!isTurso) {
    // LIKE fallback for local dev — no ranking, no highlighting
    const likeQ = `%${q.replace(/[%_]/g, '\\$&')}%`
    const posts = await db.all(sql`
      SELECT id, title, excerpt FROM posts
      WHERE (title LIKE ${likeQ} OR excerpt LIKE ${likeQ}) AND _status = 'published'
      LIMIT ${LIMIT}
    `)
    const chapters = await db.all(sql`
      SELECT id, title, book_id FROM chapters
      WHERE title LIKE ${likeQ} AND _status = 'published'
      LIMIT ${LIMIT}
    `)
    return Response.json({ posts, chapters, isFallback: true })
  }

  const safeQ = sanitizeTantivyQuery(q)

  // fts_score() is positive BM25 — ORDER BY score DESC (unlike FTS5 rank which is negative)
  const posts = await db.all(sql`
    SELECT
      id, title, excerpt,
      fts_score(title, excerpt, ${safeQ}) AS score,
      fts_highlight(title, '<mark>', '</mark>', ${safeQ}) AS title_hl,
      fts_highlight(excerpt, '<mark>', '</mark>', ${safeQ}) AS excerpt_hl
    FROM posts
    WHERE fts_match(title, excerpt, ${safeQ}) AND _status = 'published'
    ORDER BY score DESC
    LIMIT ${LIMIT}
  `)

  const chapters = await db.all(sql`
    SELECT
      id, title, book_id,
      fts_score(title, ${safeQ}) AS score,
      fts_highlight(title, '<mark>', '</mark>', ${safeQ}) AS title_hl
    FROM chapters
    WHERE fts_match(title, ${safeQ}) AND _status = 'published'
    ORDER BY score DESC
    LIMIT ${LIMIT}
  `)

  return Response.json({ posts, chapters })
}
```

**Field weight effect**: The index was created with `title=2.0,excerpt=1.0`. This means `fts_score` automatically gives double weight to title matches. You don't need `title:word` in the query — the weight is applied at index time.

**Supported Tantivy query syntax** (pass directly in `q` after sanitization):
- `rust programming` — OR (either term)
- `rust AND programming` — both terms required
- `"full text search"` — exact phrase
- `title:rust` — only title field
- `rust*` — prefix match

### 4. OPTIMIZE INDEX (post-import)

After a bulk EPUB import that creates many chapters, merge Tantivy segments for better query performance:

```sql
OPTIMIZE INDEX idx_chapters_fts;
```

Run this via a Payload admin action button or from the Turso shell after an import batch completes. Not needed for incremental single-document updates.

### 5. Blog Search UI

- **Search input**: `<input>` in nav navigates to `/search?q=...` on submit (no live dropdown for V1)
- **Search results page** (`pages/search.tsx`):
  - `getServerSideProps`: call `${process.env.PAYLOAD_BASE_URL}/api/search?q=...`
  - Two sections: "Posts" and "Chapters", rendered as cards
  - Render `title_hl` / `excerpt_hl` with `dangerouslySetInnerHTML` (safe — HTML generated server-side from your own DB content)
  - "No results" empty state; `isFallback: true` shows a "(basic search)" label in dev

---

## B. Vector Search (Semantic)

### 1. Embedding Strategy

**Model**: Gemini `text-embedding-004` via the Google AI API.
- Dimensions: **768** (fixed for this model)
- Task types: `RETRIEVAL_DOCUMENT` when indexing content; `RETRIEVAL_QUERY` when embedding search queries. This distinction improves retrieval quality.
- Cost: free tier (1,500 requests/day, 100 req/min) — adequate for a personal blog
- Env var: `GEMINI_API_KEY`

**Text to embed**:
- Posts: `${title}. ${excerpt ?? ''}` — title + excerpt is enough (content is Lexical JSON, expensive to extract)
- Chapters: `${title}` — chapter titles are the only indexed text for chapters

### 2. Storage Schema

The `ALTER TABLE ... ADD COLUMN embedding BLOB` migration from section A adds the column. Vectors are stored as Turso's native `vector32` format (a packed float32 blob). Insertion uses the `vector32('[...]')` function:

```sql
UPDATE posts SET embedding = vector32('[0.1, 0.2, ...]') WHERE id = ?
```

The bracket-notation JSON array string is the input format `vector32()` expects.

### 3. Embedding Generation Pipeline

New utility: `src/utils/search.ts`

```ts
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'

const GEMINI_EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

export async function generateEmbedding(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const resp = await fetch(`${GEMINI_EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { role: 'user', parts: [{ text }] },
      taskType,
    }),
  })

  if (!resp.ok) {
    console.error(`[embeddings] Gemini API error ${resp.status}: ${await resp.text()}`)
    return null
  }

  const data = (await resp.json()) as { embedding: { values: number[] } }
  return data.embedding.values  // 768 floats
}

export async function storeEmbedding(
  db: LibSQLDatabase,
  table: 'posts' | 'chapters',
  id: number,
  embedding: number[]
): Promise<void> {
  const vectorStr = `[${embedding.join(',')}]`
  await db.run(sql`
    UPDATE ${sql.raw(table)} SET embedding = vector32(${vectorStr}) WHERE id = ${id}
  `)
}
```

### 4. Payload afterChange Hooks

In `src/collections/Posts.ts`, add to `hooks.afterChange`:

```ts
async ({ doc, req }) => {
  if (doc._status !== 'published') return doc
  if (!process.env.GEMINI_API_KEY || !process.env.TURSO_DATABASE_URL) return doc

  const text = `${doc.title as string}. ${(doc.excerpt as string) ?? ''}`
  const db = (req.payload.db as { drizzle: LibSQLDatabase }).drizzle

  // Fire and forget — embedding failure must not fail the save
  void generateEmbedding(text).then((embedding) => {
    if (embedding) return storeEmbedding(db, 'posts', doc.id as number, embedding)
  }).catch((err) => {
    console.error('[embeddings] Failed to store post embedding:', err)
  })

  return doc
},
```

Same pattern in `src/collections/Chapters.ts` using `doc.title` only.

**Important**: the hook is `void`-fired (non-blocking). If Gemini is down, the save succeeds and the embedding is simply not updated. A backfill script (`scripts/backfill-embeddings.ts`) can regenerate missing embeddings in bulk.

### 5. Vector Search Query

Pure vector similarity (used inside hybrid search — not exposed as a standalone endpoint):

```ts
export async function vectorSearch(
  db: LibSQLDatabase,
  queryEmbedding: number[],
  table: 'posts' | 'chapters',
  limit: number
): Promise<Array<{ id: number; distance: number }>> {
  const vectorStr = `[${queryEmbedding.join(',')}]`
  return db.all(sql`
    SELECT id, vector_distance_cos(embedding, vector32(${vectorStr})) AS distance
    FROM ${sql.raw(table)}
    WHERE embedding IS NOT NULL AND _status = 'published'
    ORDER BY distance ASC
    LIMIT ${limit}
  `) as Promise<Array<{ id: number; distance: number }>>
}
```

**Note on vector indexes**: Turso does not yet support vector indexes (ANN). All vector searches are brute-force scans (`O(n)` per query). For a personal blog with < 5,000 posts+chapters this is fine (< 5ms on Turso's hardware). Monitor query latency if the content library grows.

---

## C. Hybrid Search (FTS + Vector, RRF)

### 1. Reciprocal Rank Fusion Algorithm

RRF merges two ranked lists without requiring score normalization. Each item earns points based on its rank position in each list:

```
rrf_score(item) = 1/(k + rank_fts) + 1/(k + rank_vec)
```

Where:
- `rank_fts` = 1-based position of the item in the FTS results (1 = best)
- `rank_vec` = 1-based position in the vector results (1 = most similar)
- `k = 60` — standard damping constant (makes top-5 differences less extreme than bottom-50)
- Items missing from one list receive 0 contribution from that list

Items that appear high in *both* lists score best. An item that ranks #1 in FTS but not in vector still scores `1/61 ≈ 0.016`, which is reasonably high. RRF is robust to score scale differences and doesn't require FTS BM25 scores and cosine distances to be on the same scale.

### 2. Hybrid Query Implementation

Add to `src/utils/search.ts`:

```ts
interface RankedResult {
  id: number
  contentType: 'post' | 'chapter'
}

export async function hybridSearch(
  db: LibSQLDatabase,
  q: string,
  queryEmbedding: number[],
  limit: number,
  k = 60
): Promise<RankedResult[]> {
  const safeQ = sanitizeTantivyQuery(q)
  const TOP_N = 40  // fetch more than needed before RRF truncates

  // 1. FTS results — one query covers both tables via UNION ALL
  type FtsRow = { id: number; content_type: string; score: number }
  const ftsRows = await db.all(sql`
    SELECT id, 'post' AS content_type, fts_score(title, excerpt, ${safeQ}) AS score
    FROM posts WHERE fts_match(title, excerpt, ${safeQ}) AND _status = 'published'
    ORDER BY score DESC LIMIT ${TOP_N}
    UNION ALL
    SELECT id, 'chapter' AS content_type, fts_score(title, ${safeQ}) AS score
    FROM chapters WHERE fts_match(title, ${safeQ}) AND _status = 'published'
    ORDER BY score DESC LIMIT ${TOP_N}
  `) as FtsRow[]

  // 2. Vector results for posts
  const vecPostRows = await vectorSearch(db, queryEmbedding, 'posts', TOP_N)
  const vecChapterRows = await vectorSearch(db, queryEmbedding, 'chapters', TOP_N)

  // 3. Assign 1-based ranks (ftsRows are already in score-DESC order)
  const rrf = new Map<string, number>()

  ftsRows.forEach((row, i) => {
    const key = `${row.content_type}:${row.id}`
    rrf.set(key, (rrf.get(key) ?? 0) + 1 / (k + i + 1))
  })
  vecPostRows.forEach((row, i) => {
    const key = `post:${row.id}`
    rrf.set(key, (rrf.get(key) ?? 0) + 1 / (k + i + 1))
  })
  vecChapterRows.forEach((row, i) => {
    const key = `chapter:${row.id}`
    rrf.set(key, (rrf.get(key) ?? 0) + 1 / (k + i + 1))
  })

  // 4. Sort and return top-limit
  return [...rrf.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => {
      const [contentType, idStr] = key.split(':')
      return { id: Number(idStr), contentType: contentType as 'post' | 'chapter' }
    })
}
```

**Turso WINDOW function caveat**: `ROW_NUMBER() OVER (ORDER BY score DESC)` is supported in Turso. However, to keep the implementation simple and avoid potential Turso window function edge cases, the RRF rank is assigned in TypeScript from the already-ordered query results rather than in SQL.

### 3. Updated Search Endpoint

When `ENABLE_VECTOR_SEARCH=true` and a Gemini API key is present, the `/api/search` route upgrades to hybrid:

```ts
export async function GET(request: Request) {
  // ... same guards and db setup as section A ...

  const useHybrid =
    process.env.ENABLE_VECTOR_SEARCH === 'true' &&
    Boolean(process.env.GEMINI_API_KEY) &&
    isTurso

  if (useHybrid) {
    const queryEmbedding = await generateEmbedding(q, 'RETRIEVAL_QUERY')
    if (queryEmbedding) {
      const results = await hybridSearch(db, q, queryEmbedding, 20)
      // Fetch full records for the returned ids
      // ...
      return Response.json({ results, mode: 'hybrid' })
    }
    // Fall through to FTS-only if Gemini is unavailable
  }

  // ... FTS-only path from section A ...
}
```

### 4. Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Payload (this repo) | Google AI Studio key; free tier sufficient |
| `ENABLE_VECTOR_SEARCH` | Payload (this repo) | `true` to activate hybrid mode |

Add to `src/lib/env.ts` with Zod validation. Both are optional (no strict mode requirement) — the search endpoint degrades gracefully to FTS-only or LIKE fallback if absent.

---

## D. Recommendation System

### Phase 3.1 — Content-Based (no user data needed)

Recommend via shared tags/author/category using Payload's existing GraphQL layer. No new infrastructure.

**Similar posts** (`src/graphql/queries/similarPosts/`): the query already exists. Verify it's wired to the blog's post detail page; if not, render it in the sidebar.

**Similar books**: new query `src/graphql/queries/similarBooks/`. Match on `author` field:

```graphql
query SimilarBooks($author: String!, $excludeId: Int!) {
  Books(
    where: { AND: [{ author: { equals: $author } }, { id: { not_equals: $excludeId } }, { _status: { equals: published } }] }
    limit: 4
  ) {
    docs { id title slug cover { url } author }
  }
}
```

Adding a `tags` array field to Books enables matching by topic. Migration required. Keep it lightweight: a simple `text[]` field with no join table.

### Phase 3.5 — Semantic Similarity (requires embeddings)

Once embeddings are populated, find semantically similar items with a self-join:

```ts
// Find posts similar to post with id=targetId
async function findSimilarPosts(
  db: LibSQLDatabase,
  targetId: number,
  limit = 5
): Promise<Array<{ id: number; title: string; distance: number }>> {
  return db.all(sql`
    SELECT
      p2.id, p2.title,
      vector_distance_cos(p1.embedding, p2.embedding) AS distance
    FROM posts p1, posts p2
    WHERE p1.id = ${targetId}
      AND p2.id != ${targetId}
      AND p1.embedding IS NOT NULL
      AND p2.embedding IS NOT NULL
      AND p2._status = 'published'
    ORDER BY distance ASC
    LIMIT ${limit}
  `) as Promise<Array<{ id: number; title: string; distance: number }>>
}
```

Expose as a `GET /api/posts/[id]/similar` route (or add to the `SimilarPosts` GraphQL resolver). For books: same pattern on the `books` table once `books.embedding` column exists.

Cosine distance of 0.0 = identical, 1.0 = orthogonal. Empirically, distances < 0.3 are meaningfully related for this model.

### Phase 3.6 — Behavioral Co-Reading (requires Phase 2 ReadingProgress data)

**Prerequisite**: `ReadingProgress` collection from Phase 2 must be accumulating data. This system has no value until 5+ users have meaningful reading overlap.

**Co-occurrence query** (raw SQL, run as a batch job):

```sql
SELECT
  rp2.book_id AS recommended_id,
  COUNT(DISTINCT rp1.user_id) AS overlap_count
FROM reading_progress rp1
JOIN reading_progress rp2 ON rp1.user_id = rp2.user_id
WHERE rp1.book_id = ?        -- source book
  AND rp1.progress > 50
  AND rp2.book_id != ?       -- same as source book
  AND rp2.progress > 50
GROUP BY rp2.book_id
ORDER BY overlap_count DESC
LIMIT 10
```

**Storage**: create a `book_recommendations` table (raw SQL migration, not a Payload collection):

```sql
CREATE TABLE IF NOT EXISTS book_recommendations (
  source_book_id INTEGER NOT NULL,
  recommended_book_id INTEGER NOT NULL,
  score INTEGER NOT NULL,   -- co_reader count
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (source_book_id, recommended_book_id)
);
```

**Batch job**: A Payload endpoint `POST /api/internal/refresh-recommendations` runs the co-occurrence query for every book and upserts `book_recommendations`. Trigger it from a cron (Upstash QStash or a Vercel cron if deployed there) once per day. Protect with `CRON_SECRET` header check (already used elsewhere in the codebase — check `src/app/api/`).

---

## Implementation Order

1. **Migration `search_setup`** — FTS indexes + embedding BLOB columns. FTS is immediately useful even with no embeddings.
2. **`/api/search` route (FTS-only path)** — delivers visible value, testable in dev via `turso dev`.
3. **Blog search UI** — wire the API, build `pages/search.tsx`.
4. **Embedding generation** — `src/utils/search.ts` + `afterChange` hooks on Posts and Chapters.
5. **Backfill script** — `scripts/backfill-embeddings.ts` for existing published content.
6. **Hybrid search** — enable `ENABLE_VECTOR_SEARCH=true` after embeddings are populated.
7. **Content-based recommendations** — GraphQL queries, low effort.
8. **Semantic similarity** — self-join vector query, expose as API route.
9. **Behavioral co-reading** — only after Phase 2 ReadingProgress data exists.

---

## Checklist

### Migration: `search_setup`
- [ ] `pnpm payload migrate:create --name search_setup`
- [ ] Write FTS index DDL (`CREATE INDEX ... USING fts`) guarded by `TURSO_DATABASE_URL` check
- [ ] Write `ALTER TABLE posts ADD COLUMN embedding BLOB`
- [ ] Write `ALTER TABLE chapters ADD COLUMN embedding BLOB`
- [ ] Update generated `.json` migration file (leave tables section empty for raw-SQL-only migration)
- [ ] Test migration against local Turso dev: `turso dev` + `TURSO_DATABASE_URL=libsql://127.0.0.1:8080 pnpm payload migrate`
- [ ] Commit both `.ts` and `.json` files

### FTS Search
- [ ] `src/utils/search.ts` — `sanitizeTantivyQuery()` helper
- [ ] `src/app/api/search/route.ts` — FTS-only path + LIKE fallback
- [ ] Verify CORS already allows `blog.quanghuy.dev` in `payload.config.ts`
- [ ] Blog: search input in nav, `pages/search.tsx` results page with `title_hl`/`excerpt_hl`
- [ ] After first EPUB import batch: run `OPTIMIZE INDEX idx_chapters_fts` via Turso shell

### Embedding Pipeline
- [ ] Add `GEMINI_API_KEY` to `src/lib/env.ts` with Zod (optional field)
- [ ] Add `ENABLE_VECTOR_SEARCH` env var
- [ ] `src/utils/search.ts` — `generateEmbedding()`, `storeEmbedding()`, `vectorSearch()`
- [ ] Add `afterChange` hook to `src/collections/Posts.ts`
- [ ] Add `afterChange` hook to `src/collections/Chapters.ts`
- [ ] `scripts/backfill-embeddings.ts` — iterate all published posts + chapters, generate + store embeddings
- [ ] Run backfill after hooks are deployed

### Hybrid Search
- [ ] `src/utils/search.ts` — `hybridSearch()` with RRF
- [ ] Update `/api/search` to use hybrid path when `ENABLE_VECTOR_SEARCH=true`
- [ ] Enable `ENABLE_VECTOR_SEARCH=true` in production env after backfill completes

### Recommendations
- [ ] Add `tags` array field to `src/collections/Books.ts` + migration (optional but useful)
- [ ] `src/graphql/queries/similarBooks/` — by author (+ tags if added)
- [ ] Verify `SimilarPosts` query is wired to blog post detail page
- [ ] (Phase 3.5) `GET /api/posts/[id]/similar` semantic similarity route
- [ ] (Phase 3.6) `book_recommendations` table migration
- [ ] (Phase 3.6) `POST /api/internal/refresh-recommendations` batch endpoint
- [ ] (Phase 3.6) Cron job setup

### Dev/Test
- [ ] `pnpm tsc --noEmit` clean after all changes
- [ ] Integration test: `tests/int/search.test.ts` covering FTS route, LIKE fallback, and hybrid path
- [ ] Verify `turso dev` workflow in project README or `docs/`
