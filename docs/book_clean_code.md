# Book Feature: Clean Code & Architecture Plan

> **Document purpose**: A living reference for anyone working on the Books / Chapters /
> EPUB-import sub-system. It explains *why* things are structured the way they are,
> what rules to follow when extending the system, and maintains an actionable backlog
> of technical-debt items and improvements ordered by priority.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
   - 2.1 [What Exists and Why](#21-what-exists-and-why)
   - 2.2 [Observed Code Smells and Design Debt](#22-observed-code-smells-and-design-debt)
   - 2.3 [Dependency Map](#23-dependency-map)
3. [Architectural Principles](#3-architectural-principles)
   - 3.1 [The Centralized Utils Philosophy](#31-the-centralized-utils-philosophy)
   - 3.2 [Separation of Concerns in PayloadCMS](#32-separation-of-concerns-in-payloadcms)
   - 3.3 [Browser-vs-Server Boundary Discipline](#33-browser-vs-server-boundary-discipline)
   - 3.4 [Collections as Data Contracts](#34-collections-as-data-contracts)
   - 3.5 [Feature Modules as Isolated Units](#35-feature-modules-as-isolated-units)
4. [Folder Structure and Ownership](#4-folder-structure-and-ownership)
   - 4.1 [Current Structure Annotated](#41-current-structure-annotated)
   - 4.2 [The Target Structure](#42-the-target-structure)
   - 4.3 [Decision Log: Why Each Module Lives Where It Does](#43-decision-log-why-each-module-lives-where-it-does)
5. [Shared Utilities](#5-shared-utilities)
   - 5.1 [Existing Utilities Relevant to Books](#51-existing-utilities-relevant-to-books)
   - 5.2 [Books-Specific Utilities](#52-books-specific-utilities)
   - 5.3 [Missing Utilities That Should Exist](#53-missing-utilities-that-should-exist)
   - 5.4 [Import Rules: What Can Import What](#54-import-rules-what-can-import-what)
6. [Data Layer Contracts](#6-data-layer-contracts)
   - 6.1 [Books Collection Field Semantics](#61-books-collection-field-semantics)
   - 6.2 [Chapters Collection Field Semantics](#62-chapters-collection-field-semantics)
   - 6.3 [Type Safety Conventions](#63-type-safety-conventions)
   - 6.4 [Constants as Single Source of Truth](#64-constants-as-single-source-of-truth)
7. [Hook Design Patterns](#7-hook-design-patterns)
   - 7.1 [The Hook Execution Order](#71-the-hook-execution-order)
   - 7.2 [Import Lifecycle State Machine](#72-import-lifecycle-state-machine)
   - 7.3 [Ownership Hook Composition](#73-ownership-hook-composition)
   - 7.4 [Unique Order Enforcement](#74-unique-order-enforcement)
8. [Access Control Design](#8-access-control-design)
   - 8.1 [Books Access Hierarchy](#81-books-access-hierarchy)
   - 8.2 [Why bookDeleteAccess is More Complex](#82-why-bookdeleteaccess-is-more-complex)
   - 8.3 [Chapter Access Alignment with Books](#83-chapter-access-alignment-with-books)
9. [Admin Component Architecture](#9-admin-component-architecture)
   - 9.1 [Component Responsibility Matrix](#91-component-responsibility-matrix)
   - 9.2 [State Management in the Import Flow](#92-state-management-in-the-import-flow)
   - 9.3 [Avoiding Prop Drilling](#93-avoiding-prop-drilling)
   - 9.4 [Signal and Cancellation Patterns](#94-signal-and-cancellation-patterns)
10. [EPUB Processing Pipeline](#10-epub-processing-pipeline)
    - 10.1 [Why Browser-Only Processing](#101-why-browser-only-processing)
    - 10.2 [The Two-Phase Pipeline Design](#102-the-two-phase-pipeline-design)
    - 10.3 [epubImport vs epubLexical Split](#103-epubimport-vs-epublexical-split)
    - 10.4 [HTML to Lexical Conversion Design](#104-html-to-lexical-conversion-design)
    - 10.5 [Image Pipeline Flow](#105-image-pipeline-flow)
    - 10.6 [Error Taxonomy and Handling Strategy](#106-error-taxonomy-and-handling-strategy)
11. [Feature Modules: Custom Lexical Nodes](#11-feature-modules-custom-lexical-nodes)
    - 11.1 [What a Feature Module Contains](#111-what-a-feature-module-contains)
    - 11.2 [epub-internal-link: Design Rationale](#112-epub-internal-link-design-rationale)
    - 11.3 [epub-footnote-ref: Design Rationale](#113-epub-footnote-ref-design-rationale)
    - 11.4 [Adding New Feature Modules Correctly](#114-adding-new-feature-modules-correctly)
12. [Testing Strategy](#12-testing-strategy)
    - 12.1 [Unit Tests for Utils](#121-unit-tests-for-utils)
    - 12.2 [Integration Tests for Collections](#122-integration-tests-for-collections)
    - 12.3 [epub-probe Script as Validation Tool](#123-epub-probe-script-as-validation-tool)
    - 12.4 [Test Naming and Coverage Targets](#124-test-naming-and-coverage-targets)
13. [Migration Discipline](#13-migration-discipline)
    - 13.1 [When Migrations Are Required](#131-when-migrations-are-required)
    - 13.2 [Naming and Commit Convention](#132-naming-and-commit-convention)
    - 13.3 [What Not to Put in Migrations](#133-what-not-to-put-in-migrations)
14. [Backlog: Architecture and Clean Code Tasks](#14-backlog-architecture-and-clean-code-tasks)
    - 14.1 [Tier 1 - Structural Fixes (No Migration)](#141-tier-1---structural-fixes-no-migration)
    - 14.2 [Tier 2 - Data Model Improvements (Migration Required)](#142-tier-2---data-model-improvements-migration-required)
    - 14.3 [Tier 3 - Architecture Improvements](#143-tier-3---architecture-improvements)
    - 14.4 [Tier 4 - Testing Coverage](#144-tier-4---testing-coverage)
    - 14.5 [Tier 5 - Developer Experience](#145-tier-5---developer-experience)

---

## 1. Executive Summary

The Books / Chapters / EPUB-import sub-system is one of the most complex features in this
PayloadCMS application. It spans two database collections, a browser-only file-processing
pipeline, multiple custom Lexical rich-text nodes, a suite of admin React components, and
several purpose-built utilities that sit alongside the project-wide `src/utils/` library.
Because the system was grown iteratively across a series of planning documents and
implementation sprints, there are accumulated inconsistencies that, left unchecked, will
compound as the feature set expands.

This document serves three audiences. **New contributors** use it to understand *why*
modules are structured the way they are before making changes. **Active implementers** use
the rules in Sections 3-13 to know where to put new code and how to extend existing
patterns without creating drift. **Planners** use the Backlog in Section 14 as the canonical
source of work items, ordered by structural impact and migration risk.

"Clean code" here means three specific things: (1) each piece of logic lives in exactly
one place, and callers import it rather than re-implementing it; (2) the boundary between
layers (data contract, business rule, presentation) is respected so that changing one layer
does not require touching another; and (3) the test surface accurately covers the contracts
that each module promises to uphold.

The backlog in Section 14 is tiered by the type of change required: Tier 1 items require
only code edits and carry no migration risk; Tier 2 items add or alter fields and require a
schema migration; Tier 3 items introduce new architectural patterns or major new features;
Tier 4 fills testing gaps; Tier 5 improves developer experience. Items within each tier are
ordered by impact on correctness and maintainability.

This document is now the canonical home for the Books subsystem. The historical material
that used to live in `book.md`, `book_importer_polishment_plan.md`, and
`book_chapter-management-ui.md` has been moved into `docs/archive/` and folded into the
appropriate sections here. Keep `book-integration.md` separate because it is a consumer-
facing usage guide, not a subsystem architecture plan.

---

## 2. Current State Assessment

### 2.1 What Exists and Why

The books sub-system was introduced after the base Payload config (Users, Media, Posts,
Categories) was already stable. It was designed from the start to co-exist with the existing
patterns rather than replace them.

**Collections**

| File | Layer | Why it exists |
|------|-------|---------------|
| `src/collections/Books.ts` | Data contract | Describes the `books` table schema, access policies, and hook pipeline. No inline business logic - all logic is delegated to `src/utils/books.ts`. |
| `src/collections/Chapters.ts` | Data contract | Describes the `chapters` table. Chapter content uses the custom Lexical editor configured in `src/utils/chapterRichText.ts`. |

**Utilities (`src/utils/`)**

| File | Layer | Why it exists |
|------|-------|---------------|
| `utils/books.ts` | Business rules | All hook functions, access helpers, and server-side queries that are specific to the Books/Chapters domain. Split from `collections/Books.ts` so the same logic can be tested independently and reused from scripts. |
| `utils/epubImport.ts` | Business rules (browser-capable) | DOM-level HTML sanitization, EPUB asset path resolution, blob format normalization, word-count estimation, chapter batching. Kept separate from `epubLexical.ts` so the converter can be tested with no EPUB dependency. |
| `utils/epubLexical.ts` | Business rules (pure function) | The `htmlToPayloadLexical()` converter. Pure: no I/O, no DOM manipulation, only HTML string in → Lexical JSON out. This purity is the reason it is separately testable. |
| `utils/chapterRichText.ts` | Config factory | Constructs the Payload `lexicalEditor({...})` config for chapters. Centralizes all feature registration so that the admin editor, the headless chapter builder, and any future frontend renderer share the same node set. |
| `utils/chapterLexicalNodes.ts` | Config constant | The array of Lexical node classes required for headless editor instantiation (used by `epub-probe.ts` and future server-side validation). |
| `utils/access.ts` | Cross-cutting | Role-based access primitives shared with Posts, Media, Categories. Books uses `authenticatedAccess`, `ownerAccess`, `normalizeEntityId`. |
| `utils/slug.ts` | Cross-cutting | Slug generation with Vietnamese transliteration. Books uses `createRandomizedSlugHook` (collision-free), Chapters uses `createSlugHook` (deterministic from title). |
| `utils/ownership.ts` | Cross-cutting | `enforceOwnershipHook` auto-assigns `createdBy` on create. Used identically in Books, Chapters, Posts. |
| `utils/http.ts` | Transport | `requestJSON`, `requestJSONWithRetry`, `HttpRequestError`. Used by `fetchBookChapterCount` (browser-side chapter count query) and `EpubImporter` (chapter creation calls). |
| `utils/numbers.ts` | Cross-cutting | `toPositiveInteger` is used by `enforceUniqueChapterOrderHook` to normalize the `order` field before the uniqueness query. |
| `utils/strings.ts` | Cross-cutting | `isNonEmptyString`, `toNullableString` used in EPUB metadata extraction. |

**Admin Components (`src/components/admin/books/`, `src/components/admin/chapters/`)**

| File | Layer | Why it exists |
|------|-------|---------------|
| `BooksListView.tsx` | Presentation | Custom list view registered in the Books collection admin config. Provides book-centric layout (progress bars, import status chips). |
| `EpubImporter.tsx` | Presentation + orchestration | The browser-only EPUB import orchestrator. Owns the entire import pipeline state machine in React. Too large to live inside another component. |
| `BookImportAdminView.tsx` | Presentation | Registered as a custom admin route (`/admin/books/import`). Wraps `BookImportPage`. |
| `BookImportPage.tsx` | Presentation | The import wizard page that hosts `EpubImporter` and handles post-import navigation. |
| `ChapterListButton.tsx` | Presentation | Injected into the Books edit view via `beforeDocumentControls`. Opens a drawer listing existing chapters for the current book with links to edit each. |
| `DeleteBookButton.tsx` | Presentation | Also in `beforeDocumentControls`. Renders as disabled when the book has chapters, mirroring the server-side `bookDeleteAccess` guard. |
| `ChaptersListView.tsx` | Presentation | Custom list view for chapters (hidden from main nav; accessible only via ChapterListButton drawer). |

**Feature Modules (`src/features/`)**

| Feature | Why it exists |
|---------|---------------|
| `epub-internal-link` | EPUB files use relative href links (`#heading-id`, `../chapter2.htm#section`) that cannot be resolved to Payload chapter IDs at import time. This feature stores them as sentinel nodes in the Lexical JSON so a later resolution pass can patch them without re-parsing the entire chapter. |
| `epub-footnote-ref` | Manning-style and standard EPUB footnotes use `<a epub:type="noteref">` and `<aside epub:type="footnote">`. These require two custom node types (inline reference marker and block footnote body) that the default Lexical editor does not provide. |

**Scripts (`scripts/`)**

| File | Why it exists |
|------|---------------|
| `scripts/epub-probe.ts` | A CLI tool for running the EPUB import pipeline offline against the test corpus in `data/`. Lets developers iterate on `epubLexical.ts` and `epubImport.ts` without going through the full admin UI. Outputs Lexical JSON or a structural summary. |

**Migrations (`src/migrations/`)**

| File | Why it exists |
|------|---------------|
| `20260412_000001_books_chapters.ts` | Initial Books and Chapters tables. |
| `20260415_175817_epub_import_gap_1_3.ts` | Added metadata fields: language, description, publisher, publicationDate, isbn, subjects, chapterCount, totalWordCount, epubVersion, plus chapter hierarchy fields. |
| `20260416_000001_epub_import_gap_6.ts` | Added importFailureLog (per-chapter failure records) and the `canceled` import status. |

### 2.2 Observed Code Smells and Design Debt

The following issues were identified through codebase analysis. Each is catalogued here as
a design concern; the corresponding fix is tracked in the Section 14 backlog.

**1. `normalizeEntityId` imported from the wrong module**
`src/utils/books.ts` imports `normalizeEntityId` from `./access` (i.e., `utils/access.ts`).
Entity ID normalization is not an access control concern. It belongs in `utils/identifiers.ts`
alongside `sanitizeIdentifiers`. The function is currently a private implementation detail of
`access.ts` that was reused as a convenience. This creates a hidden coupling: changes to
`access.ts` can silently affect `books.ts`.

**2. `ownerAccess` also imported from `utils/access` inside `utils/books.ts`**
`bookDeleteAccess` calls `ownerAccess('createdBy')(args)` at the top of the access check.
This means `utils/books.ts` depends on `utils/access.ts` for both a utility function and an
access primitive. The dependency is legitimate, but it should be explicit and documented at
the top of the file rather than buried inside a function body.

**3. `requestJSONWithRetry` used without type constraint in `fetchBookChapterCount`**
The response type `ChapterCountResponse` is a local type defined inside `books.ts`. It has no
connection to the generated Payload types in `payload-types.ts`. If the Payload REST
response shape changes, the type will silently diverge. The type should reference the
generated type or use a shared shape from `utils/http.ts`.

**4. `EpubImporter.tsx` does too much**
The component manages: file selection, preflight (spine loading, word count estimation,
batch planning), per-chapter image upload orchestration, Lexical conversion, chapter API
creation, cancellation, and progress display. This is five distinct responsibilities in one
component. It is difficult to test, difficult to reason about, and impossible to reuse parts
of it in isolation. The pipeline logic should be extracted into a pure orchestration function
in `utils/epubImport.ts` or a new `utils/epubPipeline.ts`, leaving the component responsible
only for state display and user interaction.

**5. HTML sanitization depends on browser `DOMParser` but is documented as a utility**
`sanitizeChapterHTML()` in `epubImport.ts` uses `DOMParser`, which is browser-only. The
function is in `utils/` which implies it is environment-agnostic. Any attempt to import
`epubImport.ts` in a server-side context (e.g., a future server action or a Node.js script)
will fail. The function should be either clearly annotated as `// browser-only` with a
guard, or split so that the pure string-level sanitization is extracted to a server-safe
helper.

**6. The two `countBookChapters` variants have inconsistent null-safety**
`countBookChapters` (server, uses `req.payload.find`) returns `0` when the book ID cannot
be normalized. `fetchBookChapterCount` (browser, uses `requestJSONWithRetry`) also returns
`0`. However, the calling code in `bookDeleteAccess` treats a returned `null` from a
`.catch()` as an access-deny signal (return false). The two paths have different error
semantics that are easy to confuse. This should be unified with a documented contract.

**7. `chapterRichText.ts` and `chapterLexicalNodes.ts` are tightly coupled with no
   documented boundary**
`chapterRichText.ts` exports `createChapterLexicalEditor()` (used in `Chapters.ts` and the
admin UI). `chapterLexicalNodes.ts` exports the raw node array (used in `epub-probe.ts` for
headless editor creation). There is no explanation of why two files exist or what the rule
is for adding to each. A new developer adding a custom node will not know which file to
update first.

**8. Feature module registration is split across three locations**
Adding a new custom Lexical node requires changes in: (a) `features/<name>/nodes/<Node>.ts`,
(b) `features/<name>/feature.server.ts` and `feature.client.ts`, (c)
`utils/chapterRichText.ts` (add to `chapterRichTextFeatureProviders`), and (d)
`utils/chapterLexicalNodes.ts` (add to `chapterLexicalNodes` array). Missing step (d) breaks
headless serialization silently. There is no checklist or guard for this.

**9. The `epub-probe.ts` script uses `require`-style dynamic imports**
This is inconsistent with the rest of the codebase which uses ESM `import` throughout. The
probe script should be migrated to `tsx` + ESM imports for consistency and to enable shared
use of the `utils/` modules without workarounds.

### 2.3 Dependency Map

The following graph shows the allowed and actual import relationships across the books
sub-system. Arrows point from importer to dependency (`A -> B` means A imports B).
Items marked `[SMELL]` indicate an import that violates the intended layer boundaries.

```
                         ┌─────────────────────────────────────────┐
                         │           PRESENTATION LAYER            │
                         │  components/admin/books/EpubImporter    │
                         │  components/admin/books/BookImportPage  │
                         │  components/admin/books/ChapterListBtn  │
                         │  components/admin/books/DeleteBookBtn   │
                         └────────────────┬────────────────────────┘
                                          │ imports
                                          ▼
                         ┌─────────────────────────────────────────┐
                         │         BUSINESS RULES LAYER            │
                         │  utils/epubImport.ts (browser-capable)  │
                         │  utils/epubLexical.ts (pure)            │
                         │  utils/books.ts (server + browser)      │
                         │  utils/chapterRichText.ts (config)      │
                         └────────────────┬────────────────────────┘
                                          │ imports
                                          ▼
                         ┌─────────────────────────────────────────┐
                         │         CROSS-CUTTING UTILS LAYER       │
                         │  utils/access.ts                        │
                         │  utils/slug.ts                          │
                         │  utils/ownership.ts                     │
                         │  utils/numbers.ts                       │
                         │  utils/strings.ts                       │
                         │  utils/identifiers.ts                   │
                         │  utils/http.ts                          │
                         └────────────────┬────────────────────────┘
                                          │ imports
                                          ▼
                         ┌─────────────────────────────────────────┐
                         │         DATA CONTRACT LAYER             │
                         │  collections/Books.ts                   │
                         │  collections/Chapters.ts                │
                         └─────────────────────────────────────────┘

Unexpected / problematic edges:
  utils/books.ts -> utils/access.ts [normalizeEntityId]  [SMELL: wrong home for function]
  utils/epubImport.ts -> DOMParser (global)              [SMELL: implicit browser coupling]
  EpubImporter.tsx -> epubjs (library)                   [OK: browser-only by design]
  features/ -> utils/chapterRichText.ts                  [OK: config registration]
  collections/Books.ts -> utils/books.ts                 [OK: thin descriptor pattern]
  collections/Chapters.ts -> utils/chapterRichText.ts   [OK: editor config delegation]
```

The critical rule this graph encodes: **lower layers must never import from higher layers**.
`utils/` must not import from `components/`. `collections/` must not contain inline logic
that belongs in `utils/`. `features/` must not import from `collections/` directly.

---

## 3. Architectural Principles

### 3.1 The Centralized Utils Philosophy

The `src/utils/` directory is the canonical toolbox for this project. This principle
originates from the `copilot-instructions.md` blueprint and is worth restating here in the
context of the books system because the books feature adds several domain-specific modules
(`books.ts`, `epubImport.ts`, `epubLexical.ts`) alongside the project-wide ones.

**Why this discipline matters in an agentic codebase**: When multiple contributors or AI
agents work on different parts of the system, scattered logic creates a combinatorial
maintenance problem. If `sanitizeChapterHTML` lives in `EpubImporter.tsx`, any new component
that needs to sanitize HTML either duplicates it or imports from a presentation-layer file,
violating the dependency graph. Within weeks there are three versions with slightly different
behavior, no tests for any of them, and no obvious canonical one.

**The rule**: before writing any validation, parsing, transformation, or access check inline,
ask "does this belong in `utils/`?" The answer is yes if:
- More than one file could conceivably need this logic.
- The logic is testable without rendering a React component or running a Payload server.
- The logic involves a domain concept (EPUB, chapter ordering, book lifecycle) rather than
  UI state.

**The consequence of violating this rule**: The smell catalogue in Section 2.2 documents what
happens. `normalizeEntityId` in `access.ts`, HTML sanitization coupled to DOM globals,
failure-log types defined only inside a component. Each of these makes the codebase harder
for the next contributor to reason about because "where is the authoritative implementation
of X?" has no clear answer.

### 3.2 Separation of Concerns in PayloadCMS

PayloadCMS collection configurations are framework-level data contracts. They answer the
question "what shape does this data take and who can touch it?" They should not answer
"how is this data transformed?" or "what happens to related records when this changes?"

**Three layers with distinct responsibilities:**

| Layer | What it owns | What it must NOT own |
|-------|-------------|----------------------|
| **Data Contract** (`collections/`) | Field definitions, admin config, hook registration, access policy registration | Business logic, API calls, inline validation functions |
| **Business Rules** (`utils/`) | Hook implementations, access check logic, state machine transforms, domain-specific queries | React, Payload admin specifics, DOM APIs |
| **Presentation** (`components/`) | UI state, user interaction, progress display, rendering | Business rules, direct database queries, EPUB parsing |

**Why this separation prevents bugs**: Suppose the import lifecycle rules change (e.g., a
new `paused` status is added). If the lifecycle logic is in `utils/books.ts`, the change
is in one place. If it were inline in `EpubImporter.tsx`, the change would also need to
propagate to any API handler, any script, and any future component that reads the status.
The current architecture correctly places `applyBookImportLifecycleHook` in `utils/books.ts`
and registers it in `collections/Books.ts` as a one-line hook reference.

**The thin descriptor pattern**: `collections/Books.ts` registers hooks by reference:
```typescript
hooks: {
  beforeValidate: [enforceOwnershipHook('createdBy'), createRandomizedSlugHook('title', ...)],
  beforeChange: [applyBookImportLifecycleHook],
  beforeDelete: [enforceBookHasNoChaptersBeforeDelete],
},
```
The collection file contains zero implementation. Every hook function lives in `utils/` and
can be imported, tested, and reasoned about independently.

### 3.3 Browser-vs-Server Boundary Discipline

The EPUB import system is browser-only by architectural necessity, not by preference. The
constraint is the Vercel Free Tier deployment target:
- **Request body limit**: 4.5 MB. A typical technical EPUB (e.g., Manning's *Fast Python*)
  is 8-15 MB uncompressed. It cannot be sent to a server endpoint.
- **Execution timeout**: 10 seconds. Parsing a 200-chapter EPUB, extracting images, and
  creating 200 API records would far exceed this even if the body fit.

**What this means for module design:**

Modules in `src/utils/` that are used by the browser-side import pipeline may use browser
APIs (`DOMParser`, `Blob`, `URL.createObjectURL`, `canvas`), but they must be clearly marked
and must not be imported from server-side code paths. Concretely:

- `utils/epubImport.ts` - uses `DOMParser`, `canvas`: **browser-only**
- `utils/epubLexical.ts` - pure function, no DOM: **universal** (can run in Node.js)
- `utils/chapterRichText.ts` - creates a Payload `lexicalEditor` config: **server-safe**
- `utils/books.ts` - `countBookChapters` uses `req.payload` (server), `fetchBookChapterCount` uses `fetch` (browser): **both paths, clearly separated**

**The future migration path**: if Vercel's constraints relax or the project moves to a
server runtime without those limits, the browser-only pipeline can be moved server-side by
replacing `DOMParser` with `node-html-parser` or `jsdom`, and replacing the `epubjs` library
with a Node.js-compatible EPUB parser. The `epubLexical.ts` converter requires zero changes
because it is already runtime-agnostic. This is the payoff of the `epubImport / epubLexical`
split described in Section 10.3.

### 3.4 Collections as Data Contracts

A PayloadCMS collection configuration file describes a data contract: it says what fields
exist, what their types and constraints are, who can perform what operations, and which
hooks run at which lifecycle points. It does not say *how* those hooks work.

**The thin descriptor rule**: collection files (`Books.ts`, `Chapters.ts`) should contain:
- Field definitions (name, type, required, index, admin display)
- Access policy references (imported from `utils/access.ts`)
- Hook arrays (imported functions from `utils/`)
- Admin component paths (string references)
- Version/draft configuration

They should **never** contain:
- Inline hook function bodies (even one-liners encourage growth)
- Inline access check functions
- Business logic inside field `validate` callbacks (extract to `utils/`)
- Direct API calls

**Why the constraint matters**: Collection files are read by the Payload config loader at
startup and by the TypeScript compiler constantly. If they contain complex logic, that logic
is harder to test (requires a full Payload bootstrap), harder to find (you have to know to
look inside the collection file), and impossible to reuse from scripts or migrations.

When the `Books.ts` collection needs to compute the chapter count for the delete guard, it
does not do that computation inline. It registers `enforceBookHasNoChaptersBeforeDelete` as
a hook and `bookDeleteAccess` as the delete access function - both of which live in
`utils/books.ts` where they can be tested with a mocked `req.payload` object.

### 3.5 Feature Modules as Isolated Units

The `src/features/` directory holds custom Lexical node families. Each family corresponds to
a structural element of EPUB content that the default Payload Lexical editor cannot represent
natively: internal links with unresolved targets, footnote references, and (future) sidebar
callout boxes.

**Why features are isolated**: A feature module encapsulates everything about one node type
so that it can be added or removed without touching other features. The Payload Lexical
plugin architecture is designed for this: a feature can register node classes, serializers,
deserializers, and React renderers as a single unit.

**The three-file pattern** enforced by the Payload lexical feature API:
```
src/features/<name>/
  feature.server.ts    # Feature definition for the server-side Payload config
  feature.client.ts    # React renderer for the admin editor preview
  nodes/<Node>.ts      # SerializedNode TypeScript type + Lexical node class
```

**Why this split exists**: Payload evaluates `feature.server.ts` during server-side config
loading. `feature.client.ts` is dynamically imported by the admin React editor. They run in
different environments. Putting them in one file would either force server code into the
browser bundle or break server-side serialization.

**Composability**: All feature modules are registered together in `utils/chapterRichText.ts`
via `chapterRichTextFeatureProviders()`. Adding a new feature means: (1) create the
feature directory, (2) add to `chapterRichTextFeatureProviders`, (3) add the node class to
`chapterLexicalNodes` for headless use. The collection file (`Chapters.ts`) never changes
because it delegates editor creation entirely to `createChapterLexicalEditor()`.

---

## 4. Folder Structure and Ownership

### 4.1 Current Structure Annotated

```
src/
├── collections/
│   ├── Books.ts               [DATA CONTRACT]  Books collection schema + hook registration
│   └── Chapters.ts            [DATA CONTRACT]  Chapters collection schema + hook registration
│
├── utils/
│   ├── access.ts              [CROSS-CUTTING]  Role-based access primitives (shared with Posts)
│   ├── books.ts               [BUSINESS RULES] Book/chapter hooks, lifecycle, access checks, queries
│   ├── chapterLexicalNodes.ts [CONFIG CONST]   Node class array for headless Lexical editor
│   ├── chapterRichText.ts     [CONFIG FACTORY] createChapterLexicalEditor() - feature composition
│   ├── epubImport.ts          [BUSINESS RULES] EPUB HTML sanitization, asset resolution, batching
│   │                                           BROWSER-ONLY (uses DOMParser, canvas)
│   ├── epubLexical.ts         [BUSINESS RULES] htmlToPayloadLexical() converter - UNIVERSAL
│   ├── http.ts                [TRANSPORT]      requestJSON, requestJSONWithRetry
│   ├── identifiers.ts         [CROSS-CUTTING]  sanitizeIdentifiers (needs normalizeEntityId added)
│   ├── numbers.ts             [CROSS-CUTTING]  isFiniteNumber, clampNumber, toPositiveInteger
│   ├── ownership.ts           [CROSS-CUTTING]  enforceOwnershipHook
│   ├── slug.ts                [CROSS-CUTTING]  createSlugHook, createRandomizedSlugHook
│   └── strings.ts             [CROSS-CUTTING]  toNullableString, isNonEmptyString
│
├── features/
│   ├── epub-internal-link/    [FEATURE MODULE] Sentinel node for unresolved EPUB href links
│   │   ├── feature.server.ts
│   │   ├── feature.client.ts
│   │   └── nodes/EpubInternalLinkNode.ts
│   └── epub-footnote-ref/     [FEATURE MODULE] Inline footnote reference + block footnote body
│       ├── feature.server.ts
│       ├── feature.client.ts
│       └── nodes/EpubFootnoteRefNode.ts
│
├── components/
│   └── admin/
│       ├── books/
│       │   ├── BooksListView.tsx         [PRESENTATION] Custom collection list view
│       │   ├── EpubImporter.tsx          [PRESENTATION + ORCHESTRATION] Import pipeline
│       │   ├── BookImportAdminView.tsx   [PRESENTATION] Custom admin route wrapper
│       │   ├── BookImportPage.tsx        [PRESENTATION] Import wizard page
│       │   ├── ChapterListButton.tsx     [PRESENTATION] Chapter drawer for book edit view
│       │   └── DeleteBookButton.tsx      [PRESENTATION] Protected delete control
│       └── chapters/
│           └── ChaptersListView.tsx      [PRESENTATION] Custom chapters list (hidden)
│
scripts/
└── epub-probe.ts              [DEV TOOL] Offline EPUB validation and Lexical conversion testing

tests/
└── int/
    ├── books-admin-config.int.spec.ts    Tests collection admin configuration
    ├── books-admin-components.int.spec.ts Tests component rendering
    ├── books-hooks.int.spec.ts           Tests hook behavior
    ├── books-list-view.int.spec.ts       Tests list view rendering
    ├── epub-import-utils.int.spec.ts     Tests epubImport utility functions
    ├── epub-importer.int.spec.ts         Tests EpubImporter React component
    └── epub-lexical.int.spec.ts          Tests htmlToPayloadLexical converter
```

### 4.2 The Target Structure

The target structure requires only surgical additions and zero reorganization of existing
paths. The goal is to fill gaps without moving files that are already in correct locations.

**Additions to `src/utils/`:**
```
src/utils/
  epubPipeline.ts        [NEW] Pure orchestration function extracted from EpubImporter.tsx.
                               Accepts a pipeline config and returns an async iterator of
                               progress events. Browser-capable but free of React state.
  epubFailureLog.ts      [NEW] Shared type definition for per-chapter failure records.
                               Currently this type is only in EpubImporter.tsx.
```

**Additions to `src/features/`:**
```
src/features/
  epub-callout/          [FUTURE Tier 3] Sidebar/callout block for Manning-style notes
    feature.server.ts
    feature.client.ts
    nodes/EpubCalloutNode.ts
```

**Moves / renames (Tier 1 backlog):**
- `normalizeEntityId` should be re-exported from `utils/identifiers.ts` and the import in
  `utils/books.ts` updated from `./access` to `./identifiers`. The implementation in
  `utils/access.ts` can remain for now as a re-export to avoid a breaking change.

No collection files, feature files, or component files need to move. The structure is
fundamentally sound; the issues are in import paths and missing extractions.

### 4.3 Decision Log: Why Each Module Lives Where It Does

**Why `books.ts` is in `utils/` not `collections/`**
`books.ts` contains hook implementations that need to be independently importable and
testable. If they lived in `collections/Books.ts`, importing them from a test would require
loading the entire Payload collection config, including the Lexical editor and all admin
component registrations. `utils/books.ts` has no such dependency: it only imports from
other `utils/` modules and the Payload types.

**Why `chapterRichText.ts` is in `utils/` not `features/`**
`chapterRichText.ts` is a *composition* module: it assembles multiple feature modules into
one editor config. It is the right home for this because it is not a feature itself; it is
the registry. If it lived inside one feature's directory, it would imply that feature "owns"
the editor, which is incorrect.

**Why `EpubImporter.tsx` is a component not a utility**
The import pipeline has substantial React state: file selection, phase transitions, progress
percentages, per-chapter status, error display. This state is inherently presentational.
The orchestration logic inside it (the actual chapter-creation loop) should be extracted to
`utils/epubPipeline.ts` (Tier 1 backlog item), but the component shell must remain in
`components/` because it owns UI state.

**Why `epub-probe.ts` is a script not a test**
The probe script runs against real EPUB files in `data/`, produces human-readable output,
and is run manually during development. It is not deterministic (EPUB files can change) and
does not produce pass/fail assertions in the vitest sense. It serves as a developer feedback
loop. Tests for the *logic* inside `epubLexical.ts` use fixed HTML string fixtures and live
in `tests/int/epub-lexical.int.spec.ts`.

**Why `epub-internal-link` is a sentinel node rather than resolving links at import time**
At the time a chapter is being imported, the other chapters do not yet exist in the database.
Internal EPUB links point to heading IDs or fragment identifiers within other spine files.
Resolving these requires knowing the Payload chapter ID for the target file and the anchor
within it. This information is only complete after all chapters have been created. The
sentinel node stores the raw EPUB href so a two-pass resolution job can patch it later.

**Why `Chapters` uses `createSlugHook` (deterministic) while `Books` uses
`createRandomizedSlugHook` (randomized)**
Chapter slugs are scoped to a book and used for internal routing within a book's reader UI.
They are expected to be stable and human-readable (e.g., `introduction`, `chapter-1`).
Because they are not exposed as globally unique top-level URLs, collision risk is low and
determinism is valuable. Book slugs, by contrast, are globally unique top-level URLs and
must not collide across users importing books with the same title.

---

## 5. Shared Utilities

### 5.1 Existing Utilities Relevant to Books

**`utils/access.ts`** - used for: `authenticatedAccess` (Books create/read, Chapters
create/read/update/delete), `ownerAccess('createdBy')` (Books update, bookDeleteAccess),
`normalizeEntityId` (used internally in `books.ts` - should move to `identifiers.ts`).

Without this utility: access control would be duplicated across Books and Chapters, drifting
out of sync when the role model changes. The `authenticatedAccess` function ensures that
any future change to "what counts as authenticated" (e.g., adding API key auth) propagates
automatically.

**`utils/slug.ts`** - used for: `createRandomizedSlugHook('title', { localeField: 'language' })`
in Books, `createSlugHook('title')` in Chapters, `validateImmutableSlug` in Books (prevents
slug changes after creation).

The `localeField` option is critical for the books system: when a book has `language: 'vi'`
(Vietnamese), the slug hook uses Vietnamese transliteration rules from `slugify` rather than
defaulting to ASCII normalization. This is why the slug hook in Books takes `localeField:
'language'` while Posts uses the simpler form.

**`utils/ownership.ts`** - used for: `enforceOwnershipHook('createdBy')` in both Books and
Chapters. This is the one-line hook that auto-assigns the logged-in user as `createdBy` on
create operations, and blocks reassignment on update. Without it, every user's books would
be readable by other users who know the API, because `ownerAccess` would fail to find a
matching `createdBy`.

**`utils/numbers.ts`** - used for: `toPositiveInteger()` inside `enforceUniqueChapterOrderHook`
to normalize the `order` field value before the uniqueness query. This prevents `order: 1.7`
or `order: -3` from creating phantom chapters that cannot be sequenced.

**`utils/http.ts`** - used for: `requestJSONWithRetry` in `fetchBookChapterCount` (browser-side
count query), and implicitly by `EpubImporter` for chapter creation calls. Using this shared
transport helper means all fetch calls in the books system share the same retry logic, error
normalization, and `AbortSignal` support. Inline `fetch` calls in components are an
anti-pattern specifically because they cannot be reused or enhanced centrally.

**`utils/strings.ts`** - used for: EPUB metadata extraction (title, author, publisher from
EPUB OPF metadata may contain whitespace-only strings). `toNullableString` ensures that
empty metadata values become `null` rather than empty strings that would pass field
validation but render as blank text in the admin UI.

### 5.2 Books-Specific Utilities

**`utils/books.ts`**

This is the business-rules hub for the books sub-system. It exports:

- `BOOK_ORIGINS`, `BOOK_SOURCE_TYPES`, `BOOK_IMPORT_STATUSES`, `BOOK_SYNC_STATUSES` - const
  arrays that are the single source of truth for all valid enum-like values. Derived types
  (`BookOrigin`, `BookImportStatus`, etc.) are also exported here.
- `BOOK_CHAPTERS_UPDATED_EVENT` - the custom DOM event name used to signal cross-component
  updates when chapters change.
- `applyBookImportLifecycleHook` - manages timestamp fields based on status transitions. See
  Section 7.2 for the full state machine.
- `bookDeleteAccess` - two-layer access guard: owner check AND chapter-count check. See
  Section 8.2.
- `enforceBookHasNoChaptersBeforeDelete` - `beforeDelete` hook that throws if chapters exist,
  providing a user-visible error message.
- `enforceUniqueChapterOrderHook` - `beforeChange` hook that queries for conflicting `order`
  values and throws if a duplicate is found. See Section 7.4.
- `countBookChapters` - server-side chapter count via `req.payload.find`. Used by
  `bookDeleteAccess` and `enforceBookHasNoChaptersBeforeDelete`.
- `fetchBookChapterCount` - browser-side chapter count via `requestJSONWithRetry`. Used by
  `ChapterListButton` and `DeleteBookButton` for display purposes.

**`utils/epubImport.ts`** (browser-capable)

Pipeline helpers that work with DOM APIs and EPUB archive objects:
- `sanitizeChapterHTML(html, chapterHref)` - cleans raw EPUB HTML: removes scripts/styles,
  normalizes relative hrefs, extracts the `<body>` content.
- `resolveEpubAssetPath(chapterHref, relativeSrc)` - resolves a relative image path from the
  chapter's EPUB location to a canonical archive path.
- `ensureSupportedMediaBlob(blob, filename)` - normalizes non-PNG/JPG blobs (WebP, GIF, SVG)
  via canvas drawImage, returning a PNG blob.
- `buildStableHash(content)` - SHA-1 equivalent used for content-addressed chapter dedup.
- `createStableMediaFilename(originalName, chapterKey)` - deterministic filename to prevent
  duplicate media uploads across re-imports.
- `extractChapterTitle(html, fallback)` - finds the first heading in chapter HTML.
- `resolveChapterTocMetadata(spineHref, tocItems)` - matches a spine URL to its ToC entry.
- `estimateWordCountFromHTML(html)` - strips tags and counts words for batch sizing.
- `createChapterBatches(chapters, options)` - groups chapters by `MAX_CHAPTERS_PER_BATCH`
  and `MAX_WORDS_PER_BATCH`.

**`utils/epubLexical.ts`** (universal - no DOM dependency)

The HTML-to-Lexical JSON converter. Core exports:
- `htmlToPayloadLexical(html, options)` - pure function: HTML string + footnote map → Lexical
  `SerializedEditorState`. The output is Payload-compatible Lexical JSON ready to save as a
  `content` field value.
- `convertHtmlToChapterLexicalState(html, options)` - thin wrapper that also validates
  and normalizes the output to match the expected `SerializedEditorState` envelope.
- `isSubstantiveChapterContent(state)` - heuristic to skip chapters that converted to only
  empty paragraphs (e.g., EPUB metadata pages, blank separator files).

**`utils/chapterRichText.ts`** (config factory)

- `chapterRichTextFeatureProviders()` - returns the array of Lexical feature configs that
  define what nodes the chapter editor supports.
- `createChapterLexicalEditor()` - creates the full `lexicalEditor({features: [...]})` config
  for use in `Chapters.ts` field definitions.

**`utils/chapterLexicalNodes.ts`** (config constant)

- `chapterLexicalNodes` - array of Lexical node *classes* (not feature configs). Required by
  the headless editor in `epub-probe.ts` and any future server-side serialization that needs
  to instantiate a Lexical editor without the Payload admin wrapper.

### 5.3 Missing Utilities That Should Exist

**1. `normalizeEntityId` in `utils/identifiers.ts`**
Currently lives as a named export from `utils/access.ts` and is imported from there by
`utils/books.ts`. Entity ID normalization has nothing to do with access control. The
proposed signature (already exists, just needs re-homing):
```typescript
// utils/identifiers.ts
export const normalizeEntityId = (value: unknown): string | number | null => { ... }
```
`utils/access.ts` can re-export it for backwards compatibility during the transition.

**2. `EpubFailureRecord` type in `utils/epubFailureLog.ts`**
The per-chapter failure record shape is shared between the importer and the Books
collection's typed `importFailureLog` field, so any component or API consumer reading that
field knows what to expect:
```typescript
// utils/epubFailureLog.ts
export type EpubFailureRecord = {
  chapterIndex: number
  chapterTitle: string
  error: string
  timestamp: string
}
export type EpubFailureLog = EpubFailureRecord[]
```

**3. `extractEpubImportPipeline` function in `utils/epubPipeline.ts`**
The core orchestration loop of `EpubImporter.tsx` (preflight → batch → per-chapter image
upload → Lexical convert → API create) should be a pure async generator or async function
that accepts a configuration object and yields progress events. This enables:
- Testing the pipeline without a React component
- Reusing the pipeline from a hypothetical CLI tool
- Reducing `EpubImporter.tsx` to a thin state-display wrapper

Proposed signature:
```typescript
// utils/epubPipeline.ts
export type PipelineProgressEvent =
  | { type: 'preflight'; totalChapters: number; estimatedBatches: number }
  | { type: 'chapter-started'; chapterIndex: number; chapterTitle: string }
  | { type: 'chapter-done'; chapterIndex: number; chapterId: string }
  | { type: 'chapter-failed'; chapterIndex: number; error: string }
  | { type: 'done'; completedChapters: number; failedChapters: number }

export async function* runEpubImportPipeline(
  config: EpubPipelineConfig,
): AsyncGenerator<PipelineProgressEvent> { ... }
```

### 5.4 Import Rules: What Can Import What

The following table defines the allowed import directions. A "Yes" means a module in the
left column may import from the module in the top row. "No" means it must not.

| Importer \ Dependency | `collections/` | `utils/` | `features/` | `components/` | `lib/` | `app/` |
|-----------------------|:--------------:|:--------:|:-----------:|:-------------:|:------:|:------:|
| `collections/`        | No (self)      | **Yes**  | No          | No            | **Yes**| No     |
| `utils/`              | No             | **Yes**  | No          | No            | No     | No     |
| `features/`           | No             | **Yes**  | No (self)   | No            | No     | No     |
| `components/`         | types only     | **Yes**  | **Yes**     | **Yes**       | No     | No     |
| `scripts/`            | **Yes**        | **Yes**  | No          | No            | **Yes**| No     |
| `tests/`              | **Yes**        | **Yes**  | No          | **Yes**       | **Yes**| No     |

**Key constraints explained:**

- `utils/` must not import from `collections/`: this would create a circular dependency
  since collections import from utils.
- `utils/` must not import from `components/`: business rules must not depend on React.
- `features/` must not import from `collections/`: features should be reusable across
  different collection contexts.
- `components/` may import types from `collections/` (e.g., `Book` type from
  `payload-types.ts`) but must not import collection *config* (which would pull in the
  full Payload collection spec into the browser bundle).
- `lib/` contains infrastructure adapters (`turso.ts`, `r2Bucket.ts`, `env.ts`). Only
  `collections/`, `scripts/`, and config files should import from `lib/`.

---

## 6. Data Layer Contracts

### 6.1 Books Collection Field Semantics

**Identity and bibliographic fields**

| Field | Type | Nullable | Written by | Invariant |
|-------|------|----------|------------|-----------|
| `title` | text | No | User / EPUB metadata | Required, min 1 char |
| `author` | text | Yes | User / EPUB metadata | Free text, no normalization |
| `description` | textarea | Yes | User / EPUB OPF | Synopsis or blurb |
| `language` | text | Yes | User / EPUB OPF | BCP 47 tag (`en`, `vi`, `ja`). Also drives slug locale |
| `publisher` | text | Yes | User / EPUB metadata | Free text |
| `publicationDate` | date | Yes | User / EPUB metadata | ISO 8601, may be year-only |
| `isbn` | text | Yes | User / EPUB metadata | No format validation (13 or 10 digit) |
| `subjects` | array of text | Yes | User / EPUB OPF | Tag-style subjects |
| `slug` | text | No | `createRandomizedSlugHook` | Immutable after first publish. Randomized suffix prevents collisions. |
| `cover` | upload (→ media) | Yes | User / EPUB cover image | Points to a Media record |

**Import source tracking fields**

| Field | Purpose |
|-------|---------|
| `origin` | `manual` / `epub-imported` / `synced` - the original source of the book. Never changes after creation. |
| `sourceType` | `manual` / `epub-upload` / `meap-feed` / `external-sync` - the mechanism. More specific than `origin`. |
| `sourceHash` | Hash of the source file at import time. Used to detect if a re-import is needed. |
| `sourceId` | External identifier (e.g., MEAP feed book ID). |
| `sourceVersion` | External version string. Used by sync logic to detect updates. |

**Import lifecycle fields**

These fields are written exclusively by `applyBookImportLifecycleHook`. No other code should
set them directly. See Section 7.2 for the state machine.

| Field | Meaning |
|-------|---------|
| `importBatchId` | UUID assigned when an import starts. Used to deduplicate chapters across retries: a chapter with the same `importBatchId` is skipped on re-import. |
| `importStatus` | Current lifecycle state: `idle` / `importing` / `ready` / `failed` / `canceled` |
| `importTotalChapters` | Preflight count. Informational only - actual chapters created may differ. |
| `importCompletedChapters` | Incremented by the importer as chapters succeed. Drives progress bar. |
| `importStartedAt` | Set when status transitions to `importing`. |
| `importFinishedAt` | Set when status transitions to `ready`. |
| `importFailedAt` | Set when status transitions to `failed`. |
| `lastImportedAt` | Updated on each `ready` transition (supports re-import). |
| `importErrorSummary` | Short error description for `failed` status. |
| `importFailureLog` | Array of `EpubFailureRecord` objects (see 5.3). Per-chapter failures. |

**Computed / metadata fields**

| Field | Written by | Notes |
|-------|-----------|-------|
| `chapterCount` | EPUB importer at import completion | Denormalized for fast display without a join |
| `totalWordCount` | EPUB importer | Sum of per-chapter word counts |
| `epubVersion` | EPUB importer | OPF version attribute value |
| `createdBy` | `enforceOwnershipHook` | Relationship to Users. Never null after create. |

### 6.2 Chapters Collection Field Semantics

| Field | Type | Nullable | Invariant |
|-------|------|----------|-----------|
| `title` | text | No | Required. Extracted from EPUB `<h1>` or ToC entry. |
| `slug` | text | No | Required, indexed. Derived from title by `createSlugHook`. Deterministic (not randomized). |
| `book` | relationship → books | No | Required, indexed. Cannot be changed after creation (enforced by access control). |
| `order` | number | No | Required, indexed, min 1. **Unique per book** - enforced by `enforceUniqueChapterOrderHook`. Defines reader sequencing. |
| `content` | richText (Lexical) | Yes | Chapter content in Payload Lexical JSON format. Uses `createChapterLexicalEditor()`. |
| `chapterSourceKey` | text | Yes | Indexed. The EPUB spine item href (e.g., `OEBPS/Text/chapter1.xhtml`). Used to identify the source file during re-import. |
| `chapterSourceHash` | text | Yes | Indexed. Hash of the EPUB chapter HTML at import time. Used to skip unchanged chapters on re-import. |
| `importBatchId` | text | Yes | Indexed. Matches the parent book's `importBatchId` for this import run. |
| `manualEditedAt` | date | Yes | Set when a user edits chapter content after import. Signals divergence from source. |
| `createdBy` | relationship → users | Yes | Auto-assigned by `enforceOwnershipHook`. |

**The `order` uniqueness invariant**: No two chapters belonging to the same book may have
the same `order` value. This is enforced at two levels: the `beforeChange` hook
(`enforceUniqueChapterOrderHook`) raises an error before the database write, and a
database-level index ensures consistency even if the hook is bypassed (e.g., during
migrations).

**The `chapterSourceKey` + `chapterSourceHash` combination**: Together these fields enable
idempotent re-import. The importer queries `chapterSourceKey` to find if a chapter for the
same spine file already exists. It then checks `chapterSourceHash` to decide whether the
content has changed. If the hash matches and `manualEditedAt` is set, the importer skips
the chapter to preserve manual edits. If the hash differs and `manualEditedAt` is not set,
it updates the chapter.

### 6.3 Type Safety Conventions

**Deriving types from const arrays**

The books sub-system uses a consistent pattern for enum-like values:
```typescript
export const BOOK_IMPORT_STATUSES = ['idle', 'importing', 'ready', 'failed', 'canceled'] as const
export type BookImportStatus = (typeof BOOK_IMPORT_STATUSES)[number]
```

This pattern is preferable to TypeScript `enum` or separate string literal types because:
1. `BOOK_IMPORT_STATUSES` is also a runtime value - it can be iterated to build the
   `options` array for the Payload select field without duplication.
2. Adding a new status (`paused`) requires one change in one place: the const array. The
   type, the field options, and any runtime guards using `BOOK_IMPORT_STATUSES.includes()`
   all update automatically.
3. The type is a proper union of string literals, so TypeScript narrows it correctly in
   switch statements.

**Local guard types in hook functions**

Hook functions in `books.ts` use local types (`BookRecord`, `ChapterRecord`) to narrow the
untyped `data` parameter that Payload passes to hooks:
```typescript
type BookRecord = {
  importStatus?: BookImportStatus | null
  importStartedAt?: string | null
  // ...
  [key: string]: unknown
}
```
The `[key: string]: unknown` index signature allows the hook to spread `data` safely while
the explicit fields provide type-checked access to the fields the hook cares about. This is
intentional: hooks must handle partial `data` objects (Payload does not guarantee all fields
are present in every hook invocation).

**The `as never` pattern for Payload where clauses**

Payload's TypeScript types for `where` query clauses are not fully expressive; complex
compound queries using `and`/`or` with nested field paths cause type errors. The convention
in this codebase is to cast the where clause `as never` at the call site:
```typescript
req.payload.find({ collection: 'chapters', where: { ... } as never })
```
This is documented as a known limitation, not a type suppression to be removed.

### 6.4 Constants as Single Source of Truth

The four const arrays exported from `utils/books.ts` feed multiple consumers:

```
BOOK_ORIGINS = ['manual', 'epub-imported', 'synced']
  → Books.ts field options:    ORIGIN_OPTIONS = BOOK_ORIGINS.map(o => ({label: o, value: o}))
  → TypeScript type:           BookOrigin = (typeof BOOK_ORIGINS)[number]
  → Runtime guard in hooks:    if (!BOOK_ORIGINS.includes(value)) ...

BOOK_IMPORT_STATUSES = ['idle', 'importing', 'ready', 'failed', 'canceled']
  → Books.ts field options:    IMPORT_STATUS_OPTIONS = BOOK_IMPORT_STATUSES.map(...)
  → TypeScript type:           BookImportStatus = ...
  → applyBookImportLifecycleHook: normalizeImportStatus validates against this array
  → EpubImporter.tsx: drives phase transitions in React state
```

**Why duplication is a trap**: If `BOOK_IMPORT_STATUSES` were duplicated in the collection
file as a hardcoded `options` array and independently in the hook as an inline validation
string array, and independently in the React component as UI state values, adding `paused`
would require finding and updating four separate locations. With the centralized const, it
is one change.

**The downstream convention**: any code that accepts a `BookImportStatus` must use the
exported type. Any code that validates a raw string as a `BookImportStatus` must use
`BOOK_IMPORT_STATUSES.includes(value as BookImportStatus)` rather than an ad-hoc set of
string comparisons. This makes new status values automatically handled throughout.

---

## 7. Hook Design Patterns

### 7.1 The Hook Execution Order

Payload executes hooks in this order for a collection write operation:

```
beforeValidate  → field-level validation  → beforeChange  → database write  →
afterChange  →  afterOperation
```

**Why ownership goes in `beforeValidate`**: `enforceOwnershipHook` sets `createdBy` on the
`data` object *before* field validation runs. If it ran in `beforeChange`, the field
validator for `createdBy` (required relationship) would fail before the hook could set it.

**Why the lifecycle hook goes in `beforeChange`**: `applyBookImportLifecycleHook` reads
`originalDoc` (the previous database record) to compute status transitions. `originalDoc`
is only available from `beforeChange` onwards; it is not available in `beforeValidate`.

**Why the slug hook goes in `beforeValidate`**: `createRandomizedSlugHook` generates the slug
from the `title` field and must run before validation so the (required, unique) `slug` field
is populated before Payload checks for it.

**Why the delete guard goes in `beforeDelete`**: `enforceBookHasNoChaptersBeforeDelete` must
run only when a delete is actually happening, not on every update. The `beforeDelete` hook
is the correct place. The `bookDeleteAccess` function, which runs earlier in the access
check phase, prevents the delete from even reaching this hook if the user lacks ownership -
so the hook only needs to handle the chapter-count check.

**The composition in Books.ts:**
```typescript
hooks: {
  beforeValidate: [
    enforceOwnershipHook('createdBy'),       // Set createdBy before validation
    createRandomizedSlugHook('title', {...}), // Generate slug before validation
  ],
  beforeChange: [
    applyBookImportLifecycleHook,            // State machine after validation
  ],
  beforeDelete: [
    enforceBookHasNoChaptersBeforeDelete,    // Chapter count guard
  ],
}
```

### 7.2 Import Lifecycle State Machine

The `importStatus` field follows a strict state machine enforced by
`applyBookImportLifecycleHook`. The hook is idempotent: running it twice with the same
inputs produces the same output.

```
                   ┌─────────────────────────────────┐
                   │              idle               │  (default on create)
                   └────────────────┬────────────────┘
                                    │ importStatus = 'importing'
                                    ▼
                   ┌─────────────────────────────────┐
                   │           importing             │  importStartedAt = now
                   └──────────┬──────────────────────┘
                              │                    │
       importStatus = 'ready' │                    │ importStatus = 'failed'
                              ▼                    ▼
            ┌──────────────────────┐  ┌────────────────────────┐
            │        ready        │  │         failed         │
            │ importFinishedAt=now│  │  importFailedAt = now  │
            │ lastImportedAt=now  │  │  importErrorSummary set │
            │ importFailedAt=null │  └────────────────────────┘
            └──────────────────────┘
                              │
       importStatus='importing'│  (re-import)
                              ▼
            ┌─────────────────────────────────────┐
            │   importing (second run)            │  All timestamps reset
            └─────────────────────────────────────┘

   From any state:
   importStatus = 'canceled'
   → importFinishedAt = null
   → (no failure timestamp set - this was user-initiated, not an error)
```

**Why `canceled` has no `importFailedAt`**: A cancellation is a deliberate user action, not
an error condition. Marking it with `importFailedAt` would conflate it with actual failures
in queries like "show all failed imports". The two statuses are intentionally distinct.

**Why timestamps are set by the hook, not by the importer**: If `EpubImporter.tsx` set
`importStartedAt` directly, a re-import triggered from the API (e.g., a script or a future
sync job) would need to replicate that logic. By centralizing timestamp management in the
`beforeChange` hook, every code path that transitions the import status gets the correct
timestamps automatically.

### 7.3 Ownership Hook Composition

`enforceOwnershipHook('createdBy')` is a factory function that returns a `beforeValidate`
hook. When called with field name `'createdBy'`, the returned hook does two things:
1. On **create**: sets `data.createdBy` to `req.user.id` if not already set.
2. On **update**: does nothing - prevents the owner from being changed.

**Why the factory pattern**: The same hook is used in Books (`'createdBy'`), Chapters
(`'createdBy'`), and Posts (`'author'`). Without the factory, three nearly identical
functions would exist. The factory ensures any future change to ownership semantics (e.g.,
supporting team ownership) is applied everywhere at once.

**The interaction with `ownerAccess`**: `enforceOwnershipHook` guarantees that every record
has a `createdBy` value. `ownerAccess('createdBy')` then uses that value to check if the
current user is allowed to update or delete the record. These two functions must name the
same field. If Books used `enforceOwnershipHook('owner')` but `ownerAccess('createdBy')`,
the access check would always fail because `createdBy` would be null.

### 7.4 Unique Order Enforcement

`enforceUniqueChapterOrderHook` solves a problem that a SQL unique index alone cannot solve
cleanly in a multi-field uniqueness scenario with Payload's ORM abstraction.

**The constraint**: `(book, order)` must be unique. Two chapters in the same book cannot
have the same order number. A SQL `UNIQUE INDEX (book_id, order)` would enforce this, but
it produces an opaque database error rather than a user-friendly message.

**The hook flow**:
1. Normalize `order` via `toPositiveInteger()` - rejects floats, negatives, zero.
2. Early return if this is an update where neither `book` nor `order` changed (avoids
   unnecessary database query on every autosave).
3. Query for an existing chapter with the same `(book, order)` combination.
4. If found (and it is not the current document being updated), throw a descriptive error.

**Why `toPositiveInteger` is called here and not in field validation**: The Payload field
definition has `min: 1` which provides UI-level validation. But the hook needs the
normalized integer value for its query. Calling `toPositiveInteger` in the hook ensures
the query never runs with a `null` or `NaN` order value that would produce a false
"no duplicate found" result.

---

## 8. Access Control Design

### 8.1 Books Access Hierarchy

```
Operation  │ Policy                │ Rationale
───────────┼───────────────────────┼──────────────────────────────────────────────────
create     │ authenticatedAccess   │ Any logged-in user can create books. Anonymous creation
           │                       │ would allow unauthenticated seeding.
read       │ authenticatedAccess   │ Books are not publicly readable (unlike Posts). Reading
           │                       │ books requires login. This may change if a public book
           │                       │ catalog is added (use a publishedBooksReadAccess similar
           │                       │ to postsReadAccess).
update     │ ownerAccess('createdBy')│ Only the creator (or admin) can modify a book. Prevents
           │                       │ other users from changing import status or metadata.
delete     │ bookDeleteAccess      │ Same ownership check PLUS chapter-count check. See 8.2.
```

**When Books should become publicly readable**: The current `authenticatedAccess` on read is
a deliberate placeholder. If a public book catalog feature is added, a `publishedBooksReadAccess`
function should be created in `utils/access.ts` (following the `postsReadAccess` pattern):
published books are visible to anyone; drafts and importing books are visible only to their
creator.

### 8.2 Why bookDeleteAccess is More Complex

A simple `ownerAccess('createdBy')` on the Books delete operation would allow a book owner
to delete a book that has imported chapters. This would leave orphan chapter records in the
database (chapters whose `book` relationship points to a non-existent book ID).

`bookDeleteAccess` adds a second guard:
```typescript
const chapterCount = await countBookChapters(args.req, bookId).catch(() => null)
if (chapterCount == null) return false  // Count lookup failed: deny as safe default
if (chapterCount > 0) return false      // Has chapters: deny
return ownerDeleteAccess                 // No chapters: defer to owner check
```

**The null-as-false pattern**: if the chapter count lookup fails (network error, database
timeout), the function returns `false` (deny). This is the safe default: it is better to
temporarily prevent a deletion than to allow deletion of a book whose chapter count is
unknown. The user can retry.

**The companion `beforeDelete` hook**: `enforceBookHasNoChaptersBeforeDelete` duplicates the
chapter-count check in the hook phase. Why both? The `access` function runs during the
Payload access check phase and returns `true/false`. If access is granted but the delete
still needs to be aborted with a user-visible message, the `beforeDelete` hook provides the
mechanism. The hook throws an `Error` with a descriptive message that Payload surfaces in
the API response.

### 8.3 Chapter Access Alignment with Books

Chapters intentionally mirror the Books access pattern with one simplification:

```
create  authenticatedAccess  (same as Books)
read    authenticatedAccess  (same as Books)
update  ownerAccess('createdBy')  (same as Books - no chapter-count equivalent needed)
delete  ownerAccess('createdBy')  (no extra guard - deleting a chapter never orphans anything)
```

**Why chapters are hidden from the main navigation**: `admin: { hidden: true }` prevents
chapters from appearing as a top-level item in the Payload admin sidebar. Chapters are
managed from the book's edit page via the `ChapterListButton` component. This enforces the
UX intent: chapters are subordinate to books and should not be navigated to independently.
The chapters endpoint still exists and is accessible to the API.

**Why chapters do not need a cross-book ownership check**: If User A creates Book X and
User B tries to create a chapter with `book: X`, `ownerAccess('createdBy')` on the chapter
update/delete operations would only allow User B to update chapters User B created. However,
User B should not be creating chapters for User A's book at all. This cross-book ownership
gap is currently not enforced at the API level - it is a Tier 3 backlog item (see 14.3).

---

## 9. Admin Component Architecture

### 9.1 Component Responsibility Matrix

| Component | Single Responsibility | State it owns | API calls it makes |
|-----------|----------------------|---------------|--------------------|
| `BooksListView` | Render custom book list with status chips and progress indicators | None (reads from Payload list context) | None (data from Payload) |
| `EpubImporter` | Orchestrate the full EPUB import pipeline and display progress | File selection state, import phase state, per-chapter progress, abort controller | `/api/media` (image upload), `/api/books` (create/update), `/api/chapters` (create) |
| `BookImportAdminView` | Register as a custom admin route and bootstrap the import page | None | None |
| `BookImportPage` | Provide the import wizard page frame and handle post-import navigation | Navigation state | None |
| `ChapterListButton` | Fetch and display the chapter list for the current book in a drawer | Drawer open state, chapter list, loading state | `/api/chapters?where[book][equals]=...` |
| `DeleteBookButton` | Show the delete button as enabled/disabled based on chapter count | Chapter count, loading state | `/api/chapters?limit=0&where[book][equals]=...` |
| `ChaptersListView` | Render chapters list filtered to the current book context | None | None |

**The single-responsibility rule**: each component above does one thing. `EpubImporter` is
the exception - it currently does too much (see Section 2.2, smell #4). The target is to
extract the orchestration loop to `utils/epubPipeline.ts`, leaving `EpubImporter` responsible
only for state management and display.

### 9.2 State Management in the Import Flow

The import flow has five high-level phases reflected in `EpubImporter` state:

```
idle  →  preflight  →  importing  →  done
                   →  error
                   →  canceled
```

- **idle**: File input shown. No book record created yet.
- **preflight**: EPUB loaded in epubjs. Spine enumerated. Word counts estimated. Batch plan
  built. Book record created with `importStatus: 'importing'`.
- **importing**: Per-chapter loop running. Progress updated after each chapter completes.
- **done**: All chapters created. Book updated with `importStatus: 'ready'` and chapter counts.
- **error**: A fatal error occurred. Book updated with `importStatus: 'failed'`.
- **canceled**: User clicked cancel. Book updated with `importStatus: 'canceled'`.

**Why progress state is not persisted to the server during import**: The import can
complete in one browser session in under two minutes for most books. Persisting intermediate
progress to the server would require a real-time channel (WebSocket or polling) or a
per-chapter API call just to update a progress counter. The existing `importCompletedChapters`
field is updated at the end of each batch (not each chapter) as a coarse checkpoint.

**The `BOOK_CHAPTERS_UPDATED_EVENT` pattern**: when `ChapterListButton` or `DeleteBookButton`
need to know that the chapter list has changed (because the import just completed), they
listen for a custom DOM event dispatched by `EpubImporter`. This avoids prop drilling or
global state management for a rare cross-component notification.

### 9.3 Avoiding Prop Drilling

The Payload admin components have access to framework-level context that eliminates the
need to pass common data through props:

- `useDocumentInfo()` - provides the current document's `id`, `collectionSlug`, and draft
  state. `ChapterListButton` and `DeleteBookButton` use this to know which book they are
  attached to without receiving a `bookId` prop.
- `usePayload()` - provides the Payload config and auth state. Used to check the current
  user's role without a separate prop.
- `useConfig()` - provides routes and admin URL patterns.

**When to use context vs props**: use Payload context hooks for data that is available from
the framework (current document ID, auth user). Use props for data that is specific to a
component's role within its parent (e.g., chapter list data fetched by `ChapterListButton`
is passed down to its drawer children via props, not context). Do not create custom React
contexts for book-specific data unless the same data is needed by three or more deeply
nested components.

### 9.4 Signal and Cancellation Patterns

**AbortController / AbortSignal usage**: the import pipeline creates an `AbortController`
when an import starts. Its signal is passed to:
- `fetchBookChapterCount` (via the optional `signal` parameter) - stops in-flight requests
  if the user navigates away.
- The chapter creation loop - each `requestJSONWithRetry` call receives the signal so
  in-flight chapter creation is aborted when the user clicks Cancel.
- The image upload loop - similarly threaded through.

**React cleanup**: `EpubImporter` aborts the controller in the React `useEffect` cleanup
function and when the user explicitly cancels. This prevents state updates on unmounted
components (a common React warning source).

**The cancellation data flow**:
1. User clicks Cancel.
2. `abortController.abort()` called.
3. In-flight `fetch` calls reject with `AbortError`.
4. The pipeline loop catches `AbortError` and transitions phase to `canceled`.
5. The Book record is PATCH'd with `importStatus: 'canceled'`.
6. `applyBookImportLifecycleHook` sets `importFinishedAt: null` (no failure timestamp).

**What cancellation does NOT guarantee**: chapters that were already created before
cancellation remain in the database. The import is not rolled back. Re-importing with the
same `importBatchId` (or a new one) will create duplicate chapters unless the importer
checks `chapterSourceKey` to skip already-imported spine items.

---

## 10. EPUB Processing Pipeline

### 10.1 Why Browser-Only Processing

Quantified constraints driving browser-side processing:

| Constraint | Value | Impact |
|------------|-------|--------|
| Vercel Free Tier body limit | 4.5 MB | A Manning EPUB (e.g., *Fast Python*) is 8-15 MB uncompressed |
| Vercel Free Tier execution timeout | 10 seconds | 200-chapter import with image uploads = 2-5 minutes |
| Vercel Pro body limit | 50 MB | Would allow smaller EPUBs but not larger ones |
| EPUB file structure | ZIP archive with HTML + images | Requires unzipping, which is memory-intensive server-side |

**Why Web Workers were not chosen**: Web Workers would improve browser responsiveness during
long imports by moving parsing off the main thread. However, they add complexity to the
code structure (message passing, worker bundling, postMessage serialization of large
objects). The current architecture already handles long-running work by processing chapters
in batches with `setTimeout` yields between batches. Workers are a Tier 3 enhancement if
needed.

**The future migration path to server-side processing**: If constraints change (e.g., the
project migrates to Vercel Pro or a self-hosted server), the migration path is:
1. Replace `epubjs` (browser-focused) with a Node.js EPUB parser (e.g., `epub` npm package).
2. Replace `DOMParser` usage in `epubImport.ts` with `node-html-parser` or `jsdom`.
3. Create a server action or API route that accepts a multipart EPUB upload.
4. `epubLexical.ts` requires zero changes - it is already runtime-agnostic.
5. Admin components become thin upload forms rather than full orchestrators.

### 10.2 The Two-Phase Pipeline Design

The pipeline separates work into two phases to provide a better user experience and to
establish a checkpoint before destructive writes begin.

**Phase 1: Preflight (read-only)**
```
Load EPUB in epubjs
→ book.loaded.navigation → flat ToC item list
→ book.loaded.spine → ordered spine items array
→ For each spine item:
    section.load() → raw HTML string
    resolveChapterTocMetadata() → best-match ToC label and depth
    estimateWordCountFromHTML() → word count estimate
→ createChapterBatches() → groups of chapters
→ Display preflight summary: N chapters, ~X words, Y batches
→ Create Book record (importStatus: 'importing')
```

The preflight phase is non-destructive. No chapters are created. The user sees an estimate
before committing. If the EPUB looks wrong (wrong file, corrupted spine), the user can
cancel without any database side effects.

**Phase 2: Import (writes)**
```
For each batch (up to MAX_PARALLEL_BATCHES in parallel):
  For each chapter in batch:
    sanitizeChapterHTML() → clean HTML
    For each <img> in cleaned HTML:
      resolveEpubAssetPath() → canonical archive path
      book.archive.getBlob() → Blob
      ensureSupportedMediaBlob() → normalized PNG/JPG Blob
      POST /api/media → { id, url } media record
      Replace src in HTML DOM with media URL
    htmlToPayloadLexical() → SerializedEditorState
    POST /api/chapters → chapter record
    PATCH /api/books/:id → update importCompletedChapters
→ PATCH /api/books/:id → importStatus: 'ready', chapterCount, totalWordCount
```

**Why batching**: creating 200 chapters sequentially would take too long and risk a timeout
on the final PATCH. Creating all 200 in parallel would overwhelm the API. Batching provides
a balance: `MAX_CHAPTERS_PER_BATCH` and `MAX_WORDS_PER_BATCH` limit both the number of
concurrent requests and the total content processed at once.

### 10.3 epubImport vs epubLexical Split

The deliberate boundary between these two modules:

**`epubImport.ts` owns everything that is EPUB-aware or DOM-dependent:**
- EPUB archive path resolution (knows about EPUB file structure)
- HTML sanitization (uses `DOMParser`, manipulates DOM nodes)
- Image blob handling (uses `Blob`, `canvas`, `URL.createObjectURL`)
- Word count estimation (strips HTML tags from raw chapter HTML)
- Chapter batching (knows about batch size constraints)
- EPUB-to-filesystem hash functions

**`epubLexical.ts` owns only the pure HTML-to-JSON conversion:**
- Input: an HTML string (already sanitized, already with resolved image URLs)
- Output: a Payload-compatible `SerializedEditorState`
- Zero dependency on EPUB, DOM APIs, or network

**Why this split improves testability**: `epubLexical.ts` can be tested with simple HTML
string fixtures without any EPUB file, browser environment, or network. Tests like:
```typescript
const state = htmlToPayloadLexical('<p><strong>Hello</strong> world</p>')
expect(state.root.children[0].type).toBe('paragraph')
expect(state.root.children[0].children[0].format).toBe(1) // bold
```
If `htmlToPayloadLexical` depended on `DOMParser` (a browser global), these tests could
not run in Node.js (vitest). The dependency on `DOMParser` is in `sanitizeChapterHTML`
in `epubImport.ts`, which is tested differently (mocked DOM or browser test environment).

**Why this split improves replaceability**: if the EPUB parsing library (`epubjs`) is
replaced in the future, only `epubImport.ts` changes. The Lexical converter is insulated.

### 10.4 HTML to Lexical Conversion Design

`htmlToPayloadLexical()` uses a direct JSON builder approach: it walks the HTML DOM tree and
emits Payload Lexical node objects directly, without going through the `@lexical/html`
library. This was a deliberate choice.

**Why not `@lexical/html`**: `@lexical/html` requires a live Lexical editor instance to
deserialize HTML. Creating a headless editor in a browser context requires the full Lexical
node registry to be instantiated. This is possible but adds startup overhead per chapter and
requires careful synchronization of node registration between the headless editor and the
admin editor. The direct JSON builder produces identical output without the overhead.

**The `WalkContext` pattern**: the HTML walker accumulates state across nodes using a
`WalkContext` object:
```typescript
type WalkContext = {
  format: number          // Current text format bitmask (bold=1, italic=2, etc.)
  insidePre: boolean      // True inside <pre> - disables whitespace normalization
  insideListItem: boolean // True inside <li> - affects block-vs-inline behavior
  listDepth: number       // Current nesting level of lists
  nodeCounter: { value: number }          // Monotonic ID generator
  footnotesById: FootnoteDefinitionMap    // Collected footnote definitions
  referencedFootnotes: Map<...>           // Footnotes actually referenced in text
}
```

**Format bitmask accumulation**: text format (bold, italic, underline) accumulates as HTML
tags nest:
```
<strong>           format = 0 | 1 = 1 (bold)
  <em>             format = 1 | 2 = 3 (bold + italic)
    text node      emitted with format=3
  </em>            format = 3 & ~2 = 1 (back to bold only)
</strong>          format = 1 & ~1 = 0 (back to normal)
```

**Full node type mapping:**

| HTML element | Lexical node type | Notes |
|-------------|-------------------|-------|
| `<p>` | `paragraph` | |
| `<blockquote>` | `quote` | |
| `<h1>` - `<h4>` | `heading` with `tag` | |
| `<h5>`, `<h6>` | `heading tag="h4"` | Downgraded |
| `<pre>` | `block` blockType=`Code` | Language from class/data-language |
| `<ul>` / `<ol>` | `list` + `listitem` | Nested supported |
| `<table>` | `table` | With `tablerow` and `tablecell` |
| `<a href="https://...">` | `link` version=3 | Payload v3 format |
| `<a href="#...">` or relative | `epub-internal-link` | Sentinel node |
| `<strong>` | format bitmask += 1 | |
| `<em>` | format bitmask += 2 | |
| `<s>`, `<del>` | format bitmask += 4 | |
| `<u>` | format bitmask += 8 | |
| `<code>` (inline) | format bitmask += 16 | |
| `<sub>` | format bitmask += 32 | |
| `<sup>` | format bitmask += 64 | |
| `<img src="https://...">` | `upload` node | With media upload ID |
| `<hr>` | paragraph with `* * *` text | (to be improved: Tier 1) |
| `<svg>` | paragraph with `[Image: SVG diagram]` | Fallback |
| `<dl>/<dt>/<dd>` | paragraph-per-item | (to be improved: Tier 1) |

### 10.5 Image Pipeline Flow

Images in EPUB chapters require a multi-step transformation before they can be embedded in
Lexical content:

```
Step 1: Extract raw src BEFORE epubjs URL rewriting
  Problem: epubjs rewrites relative image hrefs to blob:// URLs for display in its viewer.
  By the time htmlToPayloadLexical runs on sanitized HTML, those blob:// URLs are gone.
  Solution: extract the original relative src from the archive before sanitization.

Step 2: resolveEpubAssetPath(chapterHref, relativeSrc)
  Converts the relative src (e.g., "../images/fig1.png" from "OEBPS/Text/chapter1.xhtml")
  to a canonical EPUB archive path ("OEBPS/images/fig1.png").
  Handles ../ traversal and URL encoding.

Step 3: book.archive.getBlob(resolvedPath)
  Fetches the image as a Blob from the in-memory EPUB archive.
  Returns null if the path does not exist (corrupted EPUB, missing asset).

Step 4: ensureSupportedMediaBlob(blob, filename)
  Payload's Media collection accepts PNG and JPG.
  WebP and GIF are converted via canvas.drawImage() to PNG.
  SVG cannot be rasterized this way - falls back to a text placeholder in Lexical.
  Returns a normalized {blob, filename, mimeType} object.

Step 5: POST /api/media (multipart/form-data)
  Uploads the normalized blob with a stable filename (createStableMediaFilename).
  The stable filename prevents duplicate uploads if the same image appears in
  multiple chapters or if the same EPUB is re-imported.

Step 6: Replace src in HTML DOM
  The sanitized chapter HTML DOM is mutated: the <img> src is replaced with the
  Payload CDN URL returned by the media upload response.

Step 7: htmlToPayloadLexical converts the updated HTML
  The <img> tag with the CDN URL is now converted to an `upload` Lexical node
  with `data-lexical-upload-id` set to the media record ID.
```

**Failure recovery at each step**: Steps 3 and 4 can fail (blob not found, unsupported
format). These failures are logged to the chapter's failure record but do not abort the
chapter import. The chapter is created with the image either replaced by a text placeholder
or simply omitted, depending on the failure type.

### 10.6 Error Taxonomy and Handling Strategy

The import pipeline distinguishes four error classes with different recovery strategies:

| Error class | Examples | Behavior | Stored where |
|------------|---------|----------|-------------|
| **Image-level skip** | Blob not found, unsupported format | Skip the image, continue chapter | `importFailureLog[i].error` |
| **Chapter-level skip** | Lexical conversion produces only empty paragraphs, API 400 on chapter create | Skip the chapter, continue pipeline | `importFailureLog[i].error`, `importCompletedChapters` not incremented |
| **Book-level abort** | Unrecoverable API error (500), AbortError | Stop pipeline, set `importStatus: 'failed'` | `importErrorSummary` |
| **User cancellation** | User clicks Cancel | Stop pipeline, set `importStatus: 'canceled'` | No error stored |

**The resilient partial import principle**: it is better to import 195 out of 200 chapters
successfully than to fail the entire book because 5 chapters have malformed images. The
pipeline is designed to be resilient at the chapter level (skip bad chapters) and only abort
at the book level for truly fatal errors (API authentication failure, network outage).

**The `importFailureLog` structure** (see also Section 5.3 for the type):
Each entry records the chapter index, title, error message, and timestamp. This log is
displayed in the import completion report so the user knows which chapters need manual
attention. It is stored in the Books collection as a JSON array field.

---

## 11. Feature Modules: Custom Lexical Nodes

### 11.1 What a Feature Module Contains

Each feature module in `src/features/` follows the three-file pattern required by the
Payload Lexical plugin architecture:

**`feature.server.ts`** - evaluated server-side during Payload config loading:
```typescript
import { createServerFeature } from '@payloadcms/richtext-lexical'
import { EpubInternalLinkNode } from './nodes/EpubInternalLinkNode'

export const EpubInternalLinkFeature = createServerFeature({
  feature: {
    ClientFeature: '/features/epub-internal-link/feature.client',
    nodes: [{ node: EpubInternalLinkNode }],
  },
  key: 'epub-internal-link',
})
```

**`feature.client.ts`** - evaluated browser-side in the Payload admin editor:
```typescript
'use client'
import { createClientFeature } from '@payloadcms/richtext-lexical/client'
// React renderer for how the node appears in the admin editor
export const EpubInternalLinkFeatureClient = createClientFeature({...})
```

**`nodes/<Node>.ts`** - the node class and its serialized type:
```typescript
export type SerializedEpubInternalLinkNode = Spread<
  { href: string; type: 'epub-internal-link'; version: 1 },
  SerializedLexicalNode
>
export class EpubInternalLinkNode extends DecoratorNode<JSX.Element> {
  static getType() { return 'epub-internal-link' }
  // ...
}
```

**Why the node class lives in a separate file**: the node class is needed by both
`feature.server.ts` (registration) and `utils/chapterLexicalNodes.ts` (headless use). If
the class were defined inside `feature.server.ts`, importing it from `chapterLexicalNodes.ts`
would pull in the server feature registration code into the browser epub-probe context.

### 11.2 epub-internal-link: Design Rationale

**The problem**: EPUB files contain links like `<a href="../Text/chapter02.xhtml#section3">`.
These are relative paths within the EPUB ZIP archive. After import, the target content lives
in a Payload chapter record with an ID like `686a1b2c`. The import pipeline cannot resolve
the mapping from EPUB spine href to Payload chapter ID at chapter-creation time because:
1. Chapters are created sequentially within a batch; future chapters in later batches do not
   exist yet.
2. Even within the same batch, the chapter with `chapterSourceKey=chapter02.xhtml` may not
   be created before the chapter that links to it.

**The sentinel node strategy**: `epub-internal-link` is a "sentinel" (placeholder) node
that stores the raw EPUB href and waits for a second pass to resolve it:
```json
{
  "type": "epub-internal-link",
  "version": 1,
  "href": "../Text/chapter02.xhtml#section3"
}
```

**The two-pass resolution (Tier 3 backlog)**: After all chapters are created, a resolution
job would:
1. Query all chapters for the book to build a `Map<chapterSourceKey, chapterId>`.
2. For each chapter's Lexical JSON, find all `epub-internal-link` nodes.
3. Resolve the href to a chapter ID + fragment identifier.
4. Replace the sentinel node with a real Payload `link` node pointing to the chapter URL.
5. PATCH the chapter record with the updated content.

Until this resolution pass runs, the node renders in the admin editor as a visually distinct
"unresolved link" (in a different color or with a warning icon) rather than a broken link.

### 11.3 epub-footnote-ref: Design Rationale

**EPUB footnote patterns**: EPUBs use several conventions for footnotes:
- Manning: `<a id="fn_1" href="#fnref_1" epub:type="noteref">1</a>` inline, with
  `<aside epub:type="footnote" id="fnref_1">` at the end of the chapter.
- Standard: `<a href="#fn1" epub:type="noteref">` inline, with the footnote in a
  separate EPUB spine file or in the same file at the bottom.

**The two-node approach**: the system uses two custom node types:
1. `footnote-ref` (inline): a superscript marker `[1]` that references a note by ID.
2. `Footnote` (block): the footnote body, collected at the end of the chapter.

**The two-pass collection in `htmlToPayloadLexical`**: footnote definitions are collected
during the first pass into `footnotesById: FootnoteDefinitionMap`. After the main walk
completes, any footnotes that were referenced by `footnote-ref` nodes are appended as
`Footnote` block nodes at the end of the chapter's Lexical content. This two-pass approach
handles cases where the footnote definition appears before or after its inline reference in
the HTML.

**Why inline footnotes are preferred over endnotes**: storing footnote content adjacent to
the chapter (in the same Lexical document) makes the chapter portable. If footnotes were
stored in a separate collection or as separate chapters, a chapter could not be rendered
standalone. The trade-off is that chapters with many footnotes have larger Lexical JSON.

### 11.4 Adding New Feature Modules Correctly

When adding a new custom Lexical node (e.g., a sidebar callout block for Manning-style
"Note", "Warning", "Tip" boxes), follow this checklist:

**Step 1: Create the feature directory**
```
src/features/<feature-name>/
  feature.server.ts
  feature.client.ts
  nodes/<NodeName>.ts
```

**Step 2: Implement the node class in `nodes/<NodeName>.ts`**
- Export `Serialized<NodeName>Node` type
- Export the node class extending `DecoratorNode` or `ElementNode`
- Implement `static getType()`, `static clone()`, `createDOM()`, `updateDOM()`

**Step 3: Implement `feature.server.ts`**
- Use `createServerFeature` from `@payloadcms/richtext-lexical`
- Register the node class and point to the client feature path

**Step 4: Implement `feature.client.ts`**
- Use `createClientFeature` from `@payloadcms/richtext-lexical/client`
- Provide the React renderer for the admin editor

**Step 5: Register in `utils/chapterRichText.ts`**
```typescript
// In chapterRichTextFeatureProviders():
import { MyNewFeature } from '../features/my-new-feature/feature.server'
// Add to the features array:
MyNewFeature()
```

**Step 6: Register the node class in `utils/chapterLexicalNodes.ts`**
```typescript
import { MyNewNode } from '../features/my-new-feature/nodes/MyNewNode'
export const chapterLexicalNodes = [
  // ... existing nodes
  MyNewNode,
]
```

**Verification**: run `pnpm tsx scripts/epub-probe.ts --epub data/<file>.epub` and confirm
the probe does not throw "Unknown node type" errors. Run `pnpm test:int` to confirm the
chapter editor integration tests still pass.

**What breaks if you skip Step 6**: headless Lexical serialization (used by `epub-probe.ts`
and any future server-side chapter rendering) will fail with a cryptic "Node type not
registered" error when encountering the new node type in existing chapter content.

---

## 12. Testing Strategy

### 12.1 Unit Tests for Utils

Unit tests for book-related utils should cover the contracts each function promises. They
live in `tests/int/` (despite the name, these tests use the vitest runner with Payload
integration - not browser tests).

**`tests/int/epub-lexical.int.spec.ts`** - the most critical test file:
- Each HTML element type should have at least one test asserting the correct Lexical node
  type is emitted.
- Format bitmask tests: `<strong><em>text</em></strong>` should produce `format: 3`.
- Nesting edge cases: list inside a blockquote, table inside a list item.
- Footnote collection: a chapter with footnotes should produce `footnote-ref` nodes and
  `Footnote` block nodes.
- `isSubstantiveChapterContent` tests: chapters with only empty paragraphs return false.

**`tests/int/books-hooks.int.spec.ts`** - lifecycle and unique-order hooks:
- `applyBookImportLifecycleHook` for each status transition: idle→importing (sets startedAt),
  importing→ready (sets finishedAt + lastImportedAt, clears failedAt),
  importing→failed (sets failedAt), any→canceled (no failure timestamp).
- `enforceUniqueChapterOrderHook`: creating a chapter with an order that already exists
  for the same book throws. Creating with the same order for a *different* book succeeds.
  Updating a chapter without changing its order does not trigger a duplicate check.
- `enforceBookHasNoChaptersBeforeDelete`: trying to delete a book with chapters throws.

**Running only book tests:**
```bash
pnpm vitest run --testPathPattern="books|epub"
```

### 12.2 Integration Tests for Collections

Integration tests bootstrap a real Payload instance and hit the API or collection methods
directly. They are slower than unit tests and should be scoped to testing the behaviour of
the full collection pipeline.

**`tests/int/books-hooks.int.spec.ts`** patterns:
```typescript
// Use overrideAccess: true for test setup to bypass ownership checks
const book = await payload.create({
  collection: 'books',
  data: { title: 'Test Book' },
  overrideAccess: true,
})
// Then test access-checked operations:
await expect(
  payload.delete({ collection: 'books', id: book.id, req: mockReqWithUser(someUser) })
).rejects.toThrow('Cannot delete book')
```

**`tests/int/books-admin-config.int.spec.ts`** - smoke tests:
- `Books` and `Chapters` collections appear in `payload.collections`.
- Required fields are present: `title`, `slug`, `importStatus`.
- Admin components are registered at the correct paths.
- Both collections have `versions.drafts` enabled.

**The `overrideAccess: true` pattern for test setup**: test fixture creation should always
use `overrideAccess: true` so tests do not fail because a test user lacks ownership of a
seeded record. The access checks are tested explicitly in separate test cases with
`overrideAccess: false` and a real `req` object.

### 12.3 epub-probe Script as Validation Tool

`scripts/epub-probe.ts` is a CLI tool, not a test. Run it manually during development to
validate the EPUB processing pipeline against real files.

**Usage:**
```bash
# Full JSON output for chapter 5 of a specific EPUB
pnpm tsx scripts/epub-probe.ts --epub data/Manning.Fast.Python.*.epub --chapter 5 --output json

# Summary of all chapters (word counts, node types, warnings)
pnpm tsx scripts/epub-probe.ts --epub data/Coraline*.epub --output summary
```

**What it validates:**
- EPUB can be opened and spine can be enumerated.
- Each spine chapter can be sanitized via `sanitizeChapterHTML`.
- The sanitized HTML converts to valid Lexical JSON via `htmlToPayloadLexical`.
- No "Unknown node type" errors from unregistered custom nodes.
- `isSubstantiveChapterContent` correctly identifies empty vs content chapters.

**When to run it:**
- Before committing any change to `epubLexical.ts` or `epubImport.ts`.
- When adding a new feature module (to verify node registration works headlessly).
- When debugging import failures for a specific EPUB file.

**Extending it**: to add a new probe check (e.g., verify that all `upload` nodes have a
valid `data-lexical-upload-id`), add a function to the probe script's check pipeline and
log a warning or error to stdout. The script should exit with a non-zero code if any
chapter produces an error-level finding.

### 12.4 Test Naming and Coverage Targets

**Naming convention:**
- `books-*.int.spec.ts` - tests for Books/Chapters collection behaviour
- `epub-*.int.spec.ts` - tests for EPUB processing utilities
- Unit tests that require no Payload bootstrap: `*.spec.ts` (no `.int.`)

**Coverage targets by category:**

| Category | Target | Rationale |
|----------|--------|-----------|
| Access control (`bookDeleteAccess`, `ownerAccess`) | 100% branch coverage | Access bugs have security implications |
| Hook logic (lifecycle, order uniqueness, ownership) | 100% branch coverage | Correctness bugs corrupt data |
| Lexical converter (all node types) | One test per node type + edge cases | Conversion bugs are silent (wrong output, not errors) |
| Admin component rendering | Smoke tests only (render without crash) | Full interaction tests use Playwright |
| Import pipeline orchestration | Manual (epub-probe) + future Playwright | Too complex for pure unit tests |

**How to run the full books test suite:**
```bash
pnpm test:int --testPathPattern="books|epub"
```

**How to run a single test file:**
```bash
pnpm vitest run tests/int/epub-lexical.int.spec.ts
```

---

## 13. Migration Discipline

### 13.1 When Migrations Are Required

A migration must be created whenever the database schema changes. For the books sub-system:

**Requires a migration:**
- Adding, removing, or renaming a field in `Books.ts` or `Chapters.ts`
- Changing a field's type (e.g., text → select)
- Adding or removing an index on a field
- Adding a new collection
- Changing a relationship target collection

**Does NOT require a migration:**
- Changing hook logic in `utils/books.ts` (no schema change)
- Changing access control policies
- Changing admin component configuration
- Changing field display settings (`admin.description`, `admin.position`)
- Changing field validation in the Payload config (only affects API validation, not schema)

**The development shortcut (`push: true`):** In development with `NODE_ENV !== 'production'`,
the Payload config uses `push: true` in the SQLite adapter, which auto-syncs schema changes
without migrations. This is convenient during rapid iteration but means the development
database may be ahead of the migration files. Before creating a migration, ensure your
`src/collections/*.ts` files match the intended final state.

### 13.2 Naming and Commit Convention

**Migration file naming:**
```
YYYYMMDD_HHMMSS_descriptive_name.ts   (TypeScript migration)
YYYYMMDD_HHMMSS_descriptive_name.json  (Payload migration snapshot)
```

Example: `20260416_000001_epub_import_gap_6.ts` and `20260416_000001_epub_import_gap_6.json`

**Creating a migration:**
```bash
PAYLOAD_SECRET=x \
TURSO_DATABASE_URL=libsql://... \
TURSO_AUTH_TOKEN=... \
pnpm payload migrate:create --name <descriptive_name>
```

Always use the Turso connection (not local SQLite) when creating migrations, so the
generated SQL accurately reflects the production schema state.

**What to commit**: both the `.ts` and `.json` files. The `.json` is the Payload migration
snapshot used to verify migration state. Committing only the `.ts` will cause
`pnpm payload migrate:status` to report the migration as pending even after running.

**What to review in the `.json` diff**: verify that only the expected tables/columns appear
in the diff. A migration that touches `posts` or `users` tables when you only changed
`books` indicates a schema drift that should be investigated before committing.

### 13.3 What Not to Put in Migrations

Migrations are schema-only. They must not contain:

**No data backfills**: if a new field needs to be populated from existing data (e.g., setting
`chapterCount` from the count of existing chapters), create a separate script in `scripts/`
and run it after the migration. Do not put a `UPDATE books SET chapter_count = ...` query
in the migration file.

**No business logic**: migrations must not reference `src/utils/` or `src/collections/`.
They are raw SQL operations. A migration that imports from `books.ts` will fail if the
`books.ts` API changes between when the migration was created and when it runs.

**No environment-specific conditionals**: do not write `if (process.env.NODE_ENV === 'production')`.
Migrations must be idempotent and environment-agnostic.

**How to handle a wrong migration**: if a migration was created with the wrong schema, do
not edit it after committing. Create a new corrective migration with a descriptive name
(e.g., `20260417_000001_fix_chapter_order_index`). Editing committed migrations breaks the
migration checksum verification and will cause errors on any environment that has already
run the original migration.

---

## 14. Backlog: Architecture and Clean Code Tasks

> Backlog items are ordered by tier. Within each tier, items are ordered by impact.
> Each item includes: **What**, **Why**, **Acceptance Criteria**, and **Affected Files**.

### 14.1 Tier 1 - Structural Fixes (No Migration)

These items fix import paths, extract misplaced logic, and close correctness gaps. None
require a database schema change. They should be addressed before adding new features.

---

**T1-1: Move `normalizeEntityId` to `utils/identifiers.ts`** [done 2026-04-17]

**What**: The `normalizeEntityId` function is currently a named export of `utils/access.ts`.
`utils/books.ts` imports it from `./access`. Entity ID normalization has no conceptual
relationship to access control.

**Why**: This creates a hidden coupling. Any refactor of `access.ts` risks breaking
`books.ts`. It also confuses contributors who look for ID utilities in `identifiers.ts` and
don't find them.

**Acceptance Criteria**:
- `normalizeEntityId` is exported from `utils/identifiers.ts`.
- `utils/access.ts` re-exports it from `utils/identifiers.ts` for backward compatibility.
- `utils/books.ts` import is updated from `./access` to `./identifiers`.
- All existing tests pass.

**Affected files**: `utils/identifiers.ts`, `utils/access.ts`, `utils/books.ts`

---

**T1-2: Extract `EpubFailureRecord` type to `utils/epubFailureLog.ts`** [done 2026-04-17]

**What**: The per-chapter failure record shape is only known to `EpubImporter.tsx`. Create
`utils/epubFailureLog.ts` exporting `EpubFailureRecord` and `EpubFailureLog` types.

**Why**: The `importFailureLog` field in the Books collection stores an array of these
records. Without a shared type, nothing outside `EpubImporter.tsx` can safely read or
process the failure log.

**Acceptance Criteria**:
- `EpubFailureRecord` and `EpubFailureLog` types exported from `utils/epubFailureLog.ts`.
- `EpubImporter.tsx` imports the type from `utils/epubFailureLog.ts`.
- The Books collection's `importFailureLog` field references the type in its description.

**Affected files**: `utils/epubFailureLog.ts` (new), `components/admin/books/EpubImporter.tsx`

---

**T1-3: Mark `epubImport.ts` as browser-only at the module level** [done 2026-04-17]

**What**: Add a top-of-file comment block to `utils/epubImport.ts` stating the browser-only
requirement, and add an `if (typeof window === 'undefined')` guard in `sanitizeChapterHTML`
that throws a clear error if called in a non-browser environment.

**Why**: Without this guard, importing `epubImport.ts` in a server context fails with an
opaque `DOMParser is not defined` error. A clear error message saves debugging time.

**Acceptance Criteria**:
- Module-level comment explains browser-only restriction and references Section 3.3.
- `sanitizeChapterHTML` throws `Error('sanitizeChapterHTML requires a browser environment')` if called in Node.js.
- `epub-probe.ts` is updated to use `htmlToPayloadLexical` directly (which is already universal) instead of going through `sanitizeChapterHTML`.

**Affected files**: `utils/epubImport.ts`, `scripts/epub-probe.ts`

---

**T1-4: Fix `<hr>` rendering in `htmlToPayloadLexical` [done 2026-04-16]**

**What**: `<hr>` elements are currently converted to a paragraph containing `* * *` as plain
text. The correct Lexical representation is a horizontal rule block node. If Payload's
Lexical editor supports a horizontal rule block node, use it; otherwise keep the `* * *`
fallback but make it a visually distinct text.

**Why**: Manning technical books use `<hr>` as section separators within chapters. Silently
dropping them or converting them to unparsed text loses structural information.

**Acceptance Criteria**:
- `<hr>` elements produce a visually distinguishable separator in the admin editor.
- A test in `epub-lexical.int.spec.ts` asserts the correct output for `<hr>` input.

**Affected files**: `utils/epubLexical.ts`, `tests/int/epub-lexical.int.spec.ts`

---

**T1-5: Fix code block language detection in `htmlToPayloadLexical` [done 2026-04-16]**

**What**: `<pre>` blocks should detect the programming language from the HTML class attribute
(e.g., `class="language-python"`, `class="code-python"`) or `data-language` attribute.
Currently, language defaults to `plaintext` regardless.

**Why**: Technical books use syntax-highlighted code blocks. Without language detection,
all code blocks are displayed without syntax highlighting in the admin editor and frontend.

**Acceptance Criteria**:
- `<pre class="language-python">` produces a `Code` block with `language: 'python'`.
- `<pre data-language="java">` produces a `Code` block with `language: 'java'`.
- `<pre>` with no class or data attribute defaults to `'plaintext'`.
- Tests cover all three cases.

**Affected files**: `utils/epubLexical.ts`, `tests/int/epub-lexical.int.spec.ts`

---

**T1-6: Fix `<dl>/<dt>/<dd>` handling in `htmlToPayloadLexical` [done 2026-04-17]**

**What**: Definition lists (`<dl>`) contain definition terms (`<dt>`) and definitions
(`<dd>`). Currently they are flattened into a single paragraph block losing the term/definition
relationship. The correct output is either a styled block or a series of paragraphs with
bold terms followed by indented definitions.

**Why**: Several Manning books use `<dl>` for glossary entries and term definitions. Flat
paragraph output loses the visual and semantic structure.

**Acceptance Criteria**:
- `<dt>` content is rendered as a bold paragraph.
- `<dd>` content is rendered as an indented (quote or paragraph) block.
- A test asserts the output shape for a `<dl>` with two `<dt>/<dd>` pairs.

**Affected files**: `utils/epubLexical.ts`, `tests/int/epub-lexical.int.spec.ts`

---

**T1-7: Add null guard before blob `.type` access in `ensureSupportedMediaBlob` [done 2026-04-16]**

**What**: `ensureSupportedMediaBlob` calls `blob.type` without first checking if `blob` is
null. `book.archive.getBlob()` returns null for missing assets.

**Why**: This causes the import to fail with `Cannot read properties of undefined (reading 'type')` for any chapter with a missing image asset, which is one of the most common import failures.

**Acceptance Criteria**:
- `ensureSupportedMediaBlob` returns `null` (or throws a typed error) when `blob` is null.
- The calling code in the import pipeline treats a null return as an image-level skip (not a chapter-level failure).
- A unit test covers the null-blob input case.

**Affected files**: `utils/epubImport.ts`, `components/admin/books/EpubImporter.tsx` (or future `utils/epubPipeline.ts`), `tests/int/epub-import-utils.int.spec.ts`

---

**T1-8: Extract import pipeline orchestration to `utils/epubPipeline.ts` [done 2026-04-17]**

**What**: The chapter creation loop inside `EpubImporter.tsx` (batching, per-chapter image
upload, Lexical conversion, API create, progress tracking) should be extracted to a pure
async generator function `runEpubImportPipeline()` in `utils/epubPipeline.ts`.

**Why**: `EpubImporter.tsx` currently has five distinct responsibilities (see Section 2.2,
smell #4). Extracting the pipeline makes it independently testable without a React renderer.

**Acceptance Criteria**:
- `utils/epubPipeline.ts` exports `runEpubImportPipeline(config)` as an async generator.
- `EpubImporter.tsx` is reduced to: set up config from file selection, iterate over progress
  events, update React state.
- Existing import functionality is unchanged.
- A unit test drives `runEpubImportPipeline` with a mock EPUB and asserts the sequence of
  emitted progress events.

**Affected files**: `utils/epubPipeline.ts` (new), `components/admin/books/EpubImporter.tsx`

### 14.2 Tier 2 - Data Model Improvements (Migration Required)

These items add or modify fields in the Books or Chapters collections. Each requires a
schema migration and careful coordination between the collection config change and the
migration file.

---

**T2-1: Add chapter hierarchy fields to Chapters**

**What**: Add the following fields to `Chapters.ts`:
- `tocDepth` (number, nullable) - nesting level in the EPUB ToC (1 = top-level chapter,
  2 = section, 3 = subsection)
- `tocHref` (text, nullable, indexed) - the ToC entry href that points to this chapter
  (e.g., `Text/chapter1.xhtml#section-2`)
- `spineHref` (text, nullable, indexed) - the spine item href (e.g., `Text/chapter1.xhtml`)
- `parentChapter` (relationship → chapters, nullable) - for sub-sections, the parent chapter

**Why**: EPUBs like Manning's *Fast Python* have 22 spine files but 218 ToC entries.
The current flat `order` field cannot represent the hierarchy. Without `tocDepth`, a
frontend reader cannot render a nested table of contents. Without `parentChapter`,
sub-sections cannot be navigated hierarchically.

**Migration**: add nullable columns for all new fields. No data backfill required for
existing chapters (they will have null hierarchy fields until re-imported).

**Acceptance Criteria**:
- Migration file creates the new columns.
- `Chapters.ts` field definitions updated.
- EPUB importer sets `tocDepth` and `spineHref` from `resolveChapterTocMetadata` output.
- `parentChapter` is populated when a spine item has `tocDepth > 1`.
- Types regenerated via `pnpm generate:types`.

**Affected files**: `collections/Chapters.ts`, `utils/epubImport.ts`,
`components/admin/books/EpubImporter.tsx`, new migration file

---

**T2-2: Add `chapterWordCount` field to Chapters** [done 2026-04-17]

**What**: Add a `chapterWordCount` (number, nullable) field to `Chapters.ts`. The EPUB
importer already calls `estimateWordCountFromHTML()` per chapter; this value should be
stored on the chapter record, not only aggregated into `Books.totalWordCount`.

**Why**: A per-chapter word count enables features like per-chapter reading time display,
progress tracking ("You have read 2,400 of 48,000 words"), and analytics.

**Migration**: add nullable `chapterWordCount` column.

**Acceptance Criteria**:
- Migration file adds the column.
- EPUB importer sets `chapterWordCount` on chapter create.
- `Books.totalWordCount` is still set (as the sum of chapter word counts).

**Affected files**: `collections/Chapters.ts`, `components/admin/books/EpubImporter.tsx`,
new migration file

---

**T2-3: Make `importFailureLog` a typed JSON field** [done 2026-04-17]

**What**: The `importFailureLog` field is currently an untyped JSON or text field. Change
it to a Payload `array` field with typed sub-fields matching `EpubFailureRecord`:
- `chapterIndex` (number)
- `chapterTitle` (text)
- `error` (text)
- `timestamp` (date)

**Why**: An untyped JSON blob field cannot be displayed in the admin UI, queried via the
Payload API filter syntax, or validated. A typed array field enables all three.

**Migration**: the column type may need to change depending on the current field type.
Existing failure log data may need a one-time backfill script to normalize the format.

**Acceptance Criteria**:
- `Books.ts` uses `type: 'array'` for `importFailureLog` with the typed sub-fields.
- The admin edit view for a book with failures shows the failure log as a readable array.
- `EpubFailureRecord` type from T1-2 matches the Payload array field structure.
- Migration and optional backfill script committed.

**Affected files**: `collections/Books.ts`, `utils/epubFailureLog.ts`, new migration file,
optional `scripts/backfill-failure-log.ts`

### 14.3 Tier 3 - Architecture Improvements

These items introduce new patterns or significant new features. They require design review
before implementation.

---

**T3-1: Two-pass internal link resolution system**

**What**: After all chapters are created for a book, run a resolution pass that:
1. Builds a map: `chapterSourceKey → { payloadChapterId, tocHref }`.
2. Scans every chapter's Lexical JSON for `epub-internal-link` nodes.
3. Resolves each sentinel's `href` to a Payload chapter ID and anchor fragment.
4. Replaces the sentinel with a real `link` node.
5. PATCHes the chapter record.

**Why**: Currently all internal links (including the Table of Contents page) import as
unresolved sentinel nodes. An EPUB's ToC is useless without working navigation links.

**Implementation approach (two options)**:
- **Server-side (original)**: a Payload local API operation or custom REST endpoint
  (`POST /api/books/:id/resolve-links`) triggered after import completion. Requires
  idempotency logic and extra PATCH calls per chapter.
- **Frontend read-time (preferred)**: the chapter renderer walks the Lexical tree and
  replaces `epub-internal-link` nodes on the fly using the pre-fetched chapter list
  (matched by `chapterSourceKey`). No DB writes. Falls back to plain text for unresolved
  hrefs. See the comment in `src/features/epub-internal-link/feature.server.ts` for the
  exact resolution algorithm.

**Acceptance Criteria**:
- After resolution, `epub-internal-link` nodes render as navigable links (either via DB
  replacement or frontend resolution).
- Cross-references between chapters work as Next.js `<Link>` nodes pointing to chapter URLs.
- Unresolved links (e.g. appendix not imported) fall back to plain text.

**Affected files** (server approach): new `utils/epubLinkResolver.ts`, new `app/(payload)/api/books/[id]/resolve-links/route.ts` or similar, `components/admin/books/BookImportPage.tsx`
**Affected files** (FE approach): the chapter page component (to be created)

---

**T3-2: Cross-book chapter ownership validation** [done 2026-04-17]

**What**: Add a `beforeChange` hook to Chapters that verifies the user creating a chapter
is also the owner of the referenced `book`. Currently, User B can create chapters for User
A's book via the API.

**Why**: This is an access control gap identified in Section 8.3. Without it, the `createdBy`
field on a chapter can belong to a different user than the book's `createdBy`.

**Acceptance Criteria**:
- Attempting to create a chapter for a book owned by another user returns 403.
- Admin users bypass this check (consistent with the rest of the access model).
- An integration test verifies the cross-user rejection.

**Affected files**: `utils/books.ts` (`enforceChapterBookOwnershipHook` added), `collections/Chapters.ts`

---

**T3-3: EPUB callout / sidebar block feature** [done 2026-04-17]

**What**: Create `src/features/epub-callout/` for Manning-style callout boxes (Note, Tip,
Warning, Important). These appear in Manning EPUBs as `<div class="note">` or
`<div epub:type="sidebar">` elements.

**Why**: Technical books from Manning have heavy callout usage. Currently these are imported
as plain paragraphs, losing the visual distinction that makes technical notes scannable.

**Acceptance Criteria**:
- A new `epub-callout` feature module with server/client/node files.
- `htmlToPayloadLexical` maps `<div class="note|tip|warning|important">` to the callout block.
- The callout renders with a distinct border/background in the admin editor.
- Registered in `chapterRichText.ts` and `chapterLexicalNodes.ts`.

**Affected files**: `src/features/epub-callout/` (new — `feature.server.ts`, `feature.client.ts`, `nodes/EpubCalloutNode.ts`), `utils/chapterRichText.ts`,
`utils/chapterLexicalNodes.ts`, `utils/epubLexical.ts`

---

**T3-4: Partial import resumption with `chapterSourceKey` checkpointing** [done 2026-04-17]

**What**: The EPUB import should be resumable. If an import is canceled or fails at chapter
50 of 200, re-running the import should skip chapters 1-49 (already in the database with
matching `chapterSourceKey` and `importBatchId`) and start from chapter 50.

**Why**: Currently a failed import of a long book requires starting from scratch, re-uploading
all images and re-creating all chapters. Resumption is especially important for large books
(200+ chapters) on slow connections.

**Implementation**: at the start of `processPreparedChapter`, the source key is computed
from `PreparedChapter` fields and looked up in a pre-built `existingChaptersBySourceKey`
map (built once from `findExistingChaptersByBook`). If a match is found with the same
`importBatchId` and no `manualEditedAt`, a `chapter-checkpointed` event is emitted and the
chapter is counted as completed without any DB writes or image uploads.

**Acceptance Criteria**:
- Re-importing a partially imported book (same `importBatchId`) skips existing chapters.
- A new `importBatchId` (forced re-import) creates fresh chapters even if `chapterSourceKey` matches.
- `manualEditedAt` check: manually edited chapters are never silently skipped.
- Checkpointed chapters count toward `completedChapters` (not `skippedChapters`).

**Affected files**: `utils/epubPipeline.ts`

### 14.4 Tier 4 - Testing Coverage

---

**T4-1: Full node-type coverage in `epub-lexical.int.spec.ts`**

**What**: Add test cases for every HTML element type in the node mapping table (Section
10.4) that does not yet have a test.

Missing coverage (as of writing):
- `<table>` with `<th>` header cells (`headerState` flag)
- Nested lists (`<ul><li><ol><li>`)
- `<blockquote>` with nested inline formatting
- `<pre class="language-python">` (code block with language - blocked by T1-5)
- `<dl><dt><dd>` (definition list - blocked by T1-6)
- Footnote collection (chapter with multiple footnotes, verify all appended at end)
- Format bitmask edge case: `<strong><em><u>triple</u></em></strong>` (format = 1+2+8 = 11)

**Acceptance Criteria**: each listed element type has at least one passing test in
`tests/int/epub-lexical.int.spec.ts`.

---

**T4-2: `bookDeleteAccess` with chapters present**

**What**: Add an integration test that:
1. Creates a book (overrideAccess: true).
2. Creates a chapter for that book (overrideAccess: true).
3. Attempts to delete the book via the API with the book owner's credentials.
4. Asserts the delete is rejected with an appropriate error.

**Acceptance Criteria**: test passes and documents the expected error message.

**Affected files**: `tests/int/books-hooks.int.spec.ts`

---

**T4-3: Playwright test for EPUB import flow**

**What**: An E2E test that:
1. Navigates to `/admin/books/import`.
2. Selects a small test EPUB file.
3. Observes the preflight summary.
4. Clicks "Import".
5. Waits for import completion.
6. Verifies that a book record and at least one chapter record were created.

**Acceptance Criteria**: test runs in `pnpm test:e2e` CI and passes for the smallest EPUB
in `data/` (Coraline, which has few chapters).

**Affected files**: `tests/e2e/epub-import.e2e.spec.ts` (new)

---

**T4-4: epub-probe fixtures for all 4 test EPUBs**

**What**: Run `epub-probe` against all 4 EPUBs in `data/` and commit the `--output summary`
results as fixtures in `tests/fixtures/epub-probe/`. Add a vitest test that runs the probe
and asserts the output matches the fixture (with a `--update-fixtures` flag for intentional
changes).

**Why**: This creates a regression safety net. If a change to `epubLexical.ts` accidentally
changes how a specific element type is converted, the fixture diff will catch it.

**Affected files**: `tests/fixtures/epub-probe/` (new directory), `tests/int/epub-probe-fixtures.int.spec.ts` (new)

### 14.5 Tier 5 - Developer Experience

---

**T5-1: `epub-probe --watch` mode**

**What**: Add a `--watch` flag to `scripts/epub-probe.ts` that re-runs the conversion
whenever `utils/epubLexical.ts` or `utils/epubImport.ts` changes on disk.

**Why**: Iterating on the HTML→Lexical converter currently requires manually re-running
the probe after every change. Watch mode reduces the feedback loop from ~10 seconds to
near-instant.

**Acceptance Criteria**:
- `pnpm epub-probe data/Coraline.epub --watch` stays running and re-runs on source changes.
- Output clearly shows which conversion changed.

**Affected files**: `scripts/epub-probe.ts`

---

**T5-2: Import progress persistence via `localStorage`**

**What**: Save import progress state (current chapter index, `importBatchId`,
`importProgress` array) to `localStorage` keyed by book ID. On page refresh, restore the
state and offer "Resume import" instead of starting over.

**Why**: Closing the browser tab mid-import (accidentally or due to connectivity) currently
loses all progress information. Resumption (T3-4) without state persistence is incomplete.

**Acceptance Criteria**:
- After canceling an import partway, navigating back to the same book offers "Resume import".
- Resuming correctly starts from the last unfinished chapter.

**Affected files**: `components/admin/books/EpubImporter.tsx`, `components/admin/books/useImportState.ts` (new hook)

---

**T5-3: JSDoc on all public utils functions**

**What**: Add JSDoc-style comments to every exported function in:
- `utils/books.ts`
- `utils/epubImport.ts`
- `utils/epubLexical.ts`
- `utils/chapterRichText.ts`

Include `@param`, `@returns`, and `@throws` tags where appropriate. Add a single sentence
explaining *why* the function exists (the "what" is already clear from the code).

**Why**: These utilities are the highest-leverage functions in the books subsystem. New
contributors must understand their contracts before using or extending them.

**Acceptance Criteria**: Every exported function in the above four files has at minimum a
one-sentence JSDoc comment. Parameter types documented where non-obvious.

---

**T5-4: Per-chapter error collapsible in import completion UI**

**What**: When an import completes with errors (`EpubFailureRecord[]` in state), the
completion screen shows a collapsed section "N chapters had errors". Expanding it shows:
- Chapter title/source path
- Error message
- "Retry this chapter" button

**Why**: Currently errors are listed in a flat array that can be overwhelming for large books.
Grouping and discoverability-on-demand makes the report manageable.

**Affected files**: `components/admin/books/ImportCompletionReport.tsx` (new or refactored
from the existing completion view in `EpubImporter.tsx`)

---

**T5-5: Admin dark-mode styling for the import progress bar**

**What**: The `BookImportProgress.tsx` component uses hardcoded RGB values for the progress
bar. Replace with CSS custom properties from Payload's admin theme so the component
automatically switches between light and dark modes.

**Acceptance Criteria**: Progress bar has appropriate contrast in both light (default) and
dark admin themes. No hardcoded `#RRGGBB` values remain in the component.

**Affected files**: `components/admin/books/BookImportProgress.tsx`, `app/(payload)/custom.scss`

---

## Appendix: Quick Reference

### Key Constants to Centralize (T1-1)

```typescript
export const BOOK_STATUS = { DRAFT: 'draft', IMPORTING: 'importing', PUBLISHED: 'published' } as const;
export const CHAPTER_STATUS = { DRAFT: 'draft', PUBLISHED: 'published' } as const;
export const BOOK_IMPORT_LIFECYCLE = { IDLE: 'idle', IN_PROGRESS: 'in_progress', /* ... */ } as const;
```

### Access Decision Flow (Books)

```
request
  ├── user is admin → ALLOW
  ├── operation = read
  │   ├── book.status = 'published' → ALLOW
  │   └── book.createdBy = current user → ALLOW
  └── operation = update / delete
      ├── book.createdBy = current user → ALLOW (delete: only if no chapters)
      └── else → DENY
```

### EPUB Import State Machine

```
idle → preflight-running → preflight-done
preflight-done → importing → import-done | import-failed | import-cancelled
```

### Layer Import Rules

```
collections/ → may import utils/, lib/
utils/       → may import other utils/, external packages only
features/    → may import utils/ (never collections/)
components/  → may import utils/, lib/; must NOT import collections/ internals
lib/         → may import external packages only
```

---

*Last updated: April 2026*
