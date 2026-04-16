---
name: utility-extraction-adviser
description: Decide when logic should move into src/utils and what shared helper should own it. Use when logic is copy-pasted across files, inline fetch calls bypass requestJSON, validation duplicates an existing util, or asked "where should this helper live?"
---

# Utility Extraction Adviser

Use this skill when code looks reusable or duplicated.
**Always check `src/utils/` before creating anything new.**

## Current utility surface

| Module | Exports | Use for |
|--------|---------|--------|
| `src/utils/strings.ts` | `toNullableString`, `isNonEmptyString` | Any string normalization or presence check |
| `src/utils/numbers.ts` | `isFiniteNumber`, `clampNumber`, `sanitizeDimension`, `sanitizeQuality` | Numeric validation, media dimensions, quality clamping |
| `src/utils/identifiers.ts` | `sanitizeIdentifiers` | Deduplicating or normalizing arbitrary IDs |
| `src/utils/slug.ts` | `formatSlug`, `resolveSlugLocale`, `createSlugHook`, `createRandomizedSlugHook`, `validateImmutableSlug` | All slug generation; Vietnamese transliteration via `slugify` |
| `src/utils/access.ts` | `authenticatedAccess`, `ownerAccess`, `adminOrSelfAccess`, `adminOrSelfFieldAccess`, `postsReadAccess`, `publishedMediaReadAccess`, `adminOrEmailContains` | All access control |
| `src/utils/ownership.ts` | `enforceOwnershipHook` | Auto-assigning relationship owners in `beforeValidate` |
| `src/utils/http.ts` | `requestJSON`, `requestJSONWithRetry`, `HttpRequestError` | All browser/server-safe fetch wrappers; never write ad hoc fetch chains |
| `src/utils/epubImport.ts` | HTML sanitization, EPUB preflight, image MIME helpers | EPUB parsing stage only |
| `src/utils/epubLexical.ts` | HTML → Lexical JSON conversion | EPUB conversion stage only |
| `src/utils/chapterLexicalNodes.ts` | Custom Lexical node definitions | Chapter rich text node registration |
| `src/utils/chapterRichText.ts` | Rich text traversal helpers | Reading/transforming stored Lexical content |
| `src/utils/books.ts` | Book-specific utilities | Books collection helpers |
| `src/utils/lowres.ts` | Low-resolution image generation | Media backfill and thumbnail helpers |
| `src/utils/apiKey.ts` | API key helpers | API key generation/validation |

## Check

- Is the logic reusable across more than one file?
- Can it be tested without UI rendering?
- Does a matching utility already exist in the table above?
- Is it a validation, parsing, normalization, slug, request, or ownership helper?
- If new: is the module still shallow and dependency-free (no framework imports)?

## Preferred outcome

1. Reuse an existing export — extend the function signature if needed.
2. Extend the nearest module (e.g., add to `strings.ts` rather than creating `stringHelpers.ts`).
3. Create a new module only when the domain is clearly distinct from all existing modules.
4. Never create a single-use abstraction.

## Output rule

Name the best home for the logic (existing module or new module name), the function signature, and explain why it belongs there.
If you propose a new module, explicitly state which existing modules were checked and why none fit.

## Supporting files

- [template.md](template.md) for a utility extraction skeleton.
- [examples/sample.md](examples/sample.md) for the expected recommendation format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.