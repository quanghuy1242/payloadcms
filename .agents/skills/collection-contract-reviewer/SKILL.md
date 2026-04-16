---
name: collection-contract-reviewer
description: Review Payload collection files for thin contracts, correct hooks, access rules, and field ownership. Use when adding or changing collection fields, hooks, or access properties, adding a new collection, or asked "is this collection correct?"
---

# Collection Contract Reviewer

Use this skill for any Payload collection or global config change.
Collections live in `src/collections/`: `Books.ts`, `Chapters.ts`, `Posts.ts`, `Media.ts`, `Categories.ts`, `Users.ts`.

## Required hook pattern (`beforeValidate`)

Every user-owned content collection must wire these two hooks in order:

```typescript
hooks: {
  beforeValidate: [
    enforceOwnershipHook('fieldName'), // from src/utils/ownership.ts
    createRandomizedSlugHook('title'), // from src/utils/slug.ts
  ],
}
```

- `enforceOwnershipHook(fieldName)` — auto-assigns current user; `fieldName` must match the relationship field (e.g., `'author'` for Posts, `'createdBy'` for Books and Chapters).
- `createRandomizedSlugHook(sourceField)` — generates a collision-free slug from a source field; **slugs are immutable after creation** via the `validateImmutableSlug` validator.
- Use `createSlugHook()` when slugs should be deterministic from the source field (e.g., Categories, Chapters). Use `createRandomizedSlugHook()` when slugs must be collision-free for user-generated content with duplicable titles (e.g., Posts, Books).

## Required access pattern

Import from `src/utils/access.ts`; never write inline functions that duplicate an existing helper.

```typescript
access: {
  create: authenticatedAccess,
  read: postsReadAccess,   // or ownerAccess / publishedMediaReadAccess
  update: ownerAccess('author'),
  delete: ownerAccess('author'),
}
```

## Check

- The collection file contains **only** field declarations, hook wiring, and access assignments — no inline transformation logic.
- Both `enforceOwnershipHook` and `createRandomizedSlugHook` are present for user-content collections.
- The ownership field name passed to hooks matches the actual relationship field declared in `fields`.
- Access helpers are imported from `src/utils/access.ts`, not recreated inline.
- `validateImmutableSlug` is attached to the slug field as a validator.
- Fields that should be sidebar (`position: 'sidebar'`), read-only (`access: { update: adminAccess }`), or indexed (`index: true`) are correctly configured.
- Admin config uses `useAsTitle`, `defaultColumns`, `listSearchableFields` appropriately.

## Common failure modes

- Inline validation or transformation logic inside the collection file.
- Hook behavior duplicated across collection configs instead of using `enforceOwnershipHook`.
- Access rules hand-rolled instead of reusing `ownerAccess` or `postsReadAccess`.
- Slug field missing `validateImmutableSlug`, allowing slug mutations.
- Wrong field name passed to `enforceOwnershipHook`.

## Output rule

State whether the config is a thin contract or whether it contains logic that should move into `src/utils/`.
If you find a problem, name the exact field, hook, or access rule and the utility that should replace it.

## Supporting files

- [template.md](template.md) for a collection review skeleton.
- [examples/sample.md](examples/sample.md) for the expected review format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.