# Agentic Utilities Blueprint

Our agentic coding workflow relies on a consistent, reusable utilities layer so every role—planner, architect, implementer, reviewer, integrator, operator—can share the same primitives instead of scattering ad-hoc helpers across the codebase. This document captures the single source of truth for how we build, extend, and consume utilities.

## Guiding Principles

- **Centralize once, reuse everywhere.** All cross-cutting helpers (strings, numbers, access policies, sanitizers) live in `src/utils`. Feature folders should import from this hub rather than invent local copies.
- **Future-proof by design.** Utilities must be side-effect free, type-safe, and defensive against malformed input so new surfaces can depend on them without surprises.
- **Small, composable modules.** Keep utilities focused (e.g., `strings`, `numbers`, `identifiers`). Compose them in higher-level helpers instead of bloating single files.
- **Document intent through names.** Functions should read like instructions (`sanitizeIdentifiers`, `toNullableString`, `clampNumber`) so other agents immediately understand behavior.
- **Tests before trust.** Whenever practical, add unit coverage that demonstrates the contract. Utilities are the foundation—bugs here cascade everywhere.
- **Prefer extension over duplication.** If an edge case isn’t covered, extend the existing helper or create a nearby sibling module instead of writing new inline logic.

## Current Utility Surface

| Module | Responsibilities | Primary Consumers |
| --- | --- | --- |
| `src/utils/strings.ts` | Whitespace-safe conversion helpers (`toNullableString`, `isNonEmptyString`). | SEO generators, slug helpers, GraphQL resolvers. |
| `src/utils/numbers.ts` | Numeric safety net (`isFiniteNumber`, `clampNumber`, `sanitizeDimension`, `sanitizeQuality`). | Media sanitization, storage configuration. |
| `src/utils/identifiers.ts` | Deduplicates arbitrary IDs into canonical strings. | Collection-level lookups, seeds, migrations. |
| `src/utils/slug.ts` | Immutable slug formatting plus randomized variants for collision-free posts. | Collections that need stable identifiers (Posts, Categories). |
| `src/utils/access.ts` | Role-aware access primitives (`authenticatedAccess`, `ownerAccess`, `postsReadAccess`, `publishedMediaReadAccess`, `adminOrEmailContains`) plus shared-media handling. | Collections, globals, field-level guards, ownership hooks. |
| `src/utils/ownership.ts` | Hooks that enforce relationship ownership (e.g., auto-assigning `author`, `owner`, `createdBy`). | Collections needing per-user ownership guarantees. |

These files replace the legacy `src/collections/utils` folder so future helpers are available outside collection contexts.

## Adding a New Utility

1. **Check first.** Search `src/utils` for similar logic. If it exists, extend it.
2. **Design the contract.** Write a short docstring or comment describing inputs/outputs and failure behavior.
3. **Keep dependencies shallow.** Utilities should only depend on other utilities or standard library features—never on framework-specific modules.
4. **Name intentionally.** Use verbs like `sanitize`, `resolve`, `format`, `assert` that reflect purpose.
5. **Document usage.** Update this file with the new module and its consumers so other agents discover it.
6. **Add tests if behavior is non-trivial.** Prefer Vitest unit tests under `tests/utils`.

## Consuming Utilities in New Code

- **Planner:** When breaking down a task, identify which utilities will be reused and note any needed extensions.
- **Architect:** Ensure new features integrate via existing helpers instead of redefining validation, parsing, or access rules.
- **Implementer:** Import from the relevant utility module; do not inline string/number sanitization or slug logic.
- **Reviewer:** Reject patches that duplicate functionality or bypass existing helpers without justification.
- **Integrator:** When wiring configuration or storage backends, lean on shared utilities so environment parsing and error handling stay consistent.
- **Operator:** Feed runtime learnings (unexpected inputs, edge cases) back into utilities to strengthen the shared foundation.

## Example Workflow

1. **Gather requirements.** Planner highlights the need for normalizing API payload IDs.
2. **Audit existing utilities.** Architect confirms `sanitizeIdentifiers` fits but needs array-like support.
3. **Extend utility.** Implementer updates `src/utils/identifiers.ts` with tests that cover new scenarios.
4. **Integrate feature.** Implementer imports the helper into the service instead of writing new normalization code.
5. **Review and ship.** Reviewer verifies adherence to these guidelines; Integrator ensures deployment aligns with shared logic.

By treating `src/utils` as the canonical toolbox, we keep agent-produced code predictable, maintainable, and ready for future extensions. Every new helper should make the next agent’s job easier. Never scatter utility logic—centralize, document, and reuse.

Don't fix any code with comment `// @ts-ignore`
