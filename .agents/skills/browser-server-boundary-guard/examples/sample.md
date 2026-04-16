# Browser Server Boundary Guard Example

## Module: `src/utils/epubImport.ts`

**Environment**: Browser + Node (dual-use)

**Issue found**: `parseToc()` calls `new DOMParser()` directly. `DOMParser` does not exist in Node.js.

**Fix**: Guard with a Node-compatible HTML parser (`@xmldom/xmldom` or `linkedom`) when `typeof DOMParser === 'undefined'`, or split into `parseTocBrowser.ts` (browser) and `parseTocNode.ts` (Node), and re-export from `epubImport.ts` based on environment detection.

---

## Module: `src/features/youtube/feature.client.ts`

**Environment**: Browser only — PASS

**Verdict**: Correctly isolated as a Lexical client plugin. The companion `feature.server.ts` handles server-side serialization without any DOM dependencies.