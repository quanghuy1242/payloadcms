---
name: browser-server-boundary-guard
description: Detect browser-only and server-safe code boundaries, especially DOM, Blob, fetch, and admin import flows. Use when code may run in both environments, with Lexical feature server/client splits, EPUB import logic, or on "window is not defined" errors.
---

# Browser Server Boundary Guard

Use this skill when code could run in the browser, on the server, or in both places.

## Module environment map for this project

| Module | Environment | Why |
|--------|-------------|-----|
| `src/utils/epubImport.ts` | Browser + Node | HTML sanitization (DOMParser in browser, no DOM in Node) |
| `src/utils/epubLexical.ts` | Browser + Node | Lexical conversion; must not use browser globals |
| `src/utils/chapterLexicalNodes.ts` | Server-safe | Node registration; no DOM APIs allowed |
| `src/features/*/feature.client.ts` | Browser only | Lexical client plugins |
| `src/features/*/feature.server.ts` | Server only | Lexical server serializers |
| `src/components/admin/**` | Browser only | React components, may use DOM freely |
| `src/utils/http.ts` | Browser + Server | Uses `fetch`, works in both — no `window`/`document` |
| `src/lib/r2Bucket.ts` | Server only | AWS S3 SDK, Node-only |
| `src/lib/turso.ts` | Server only | libSQL client, Node-only |
| `scripts/` | Node only | CLI scripts, never imported by Next.js |

## Check

- DOM APIs (`DOMParser`, `document`, `window`, `Blob`, `URL.createObjectURL`) stay in browser-only paths.
- Server-safe utilities (`src/utils/`) do not import or reference browser globals.
- Lexical features have a clear `feature.client.ts` / `feature.server.ts` split.
- Import pipelines separate pure conversion logic from presentation state (e.g., upload progress).
- Any new utility imported by a Next.js server component does not pull in browser-only deps.

## Common cases in this project

- EPUB HTML sanitization uses `DOMParser` — must guard or use a Node-compatible alternative.
- Lexical rich text serialization must work server-side for SSR.
- Admin-side upload flows use `Blob`/`File` — keep in `src/components/admin/` only.
- Scripts in `scripts/` must run in pure Node without Next.js context.

## Output rule

State which environment each module belongs to and why.
If a module crosses the boundary, name the exact import or API that must be split or guarded.

## Supporting files

- [template.md](template.md) for a boundary analysis skeleton.
- [examples/sample.md](examples/sample.md) for the expected output format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.