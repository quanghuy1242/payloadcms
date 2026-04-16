---
name: access-control-checker
description: Audit ownership, role-based access, public visibility, and field-level permissions. Use when changing collections, globals, or auth behavior, adding sensitive fields, wiring hooks that touch req.user, or when asked "who can see/edit this?"
---

# Access Control Checker

Use this skill whenever permissions might change.
The project's access helpers live in `src/utils/access.ts`.

## Available access helpers — always reuse, never rewrite

| Helper | Usage |
|--------|-------|
| `authenticatedAccess` | Any logged-in user (create guards) |
| `ownerAccess(fieldName)` | Owner of the relationship field, admins bypass |
| `adminOrSelfAccess` | Admin or the user themselves (Users collection) |
| `adminOrSelfFieldAccess` | Field-level variant of the above |
| `postsReadAccess` | Published posts OR own drafts |
| `publishedMediaReadAccess` | Media referenced by published posts/categories |
| `adminOrEmailContains` | Admin or email domain check |

## Check

- Admin users (`role: 'admin'`) bypass all restrictions — confirm the helper you chose respects this.
- The ownership field passed to `ownerAccess()` matches the actual relationship field name in the collection (e.g., `'author'` for Posts, `'createdBy'` for Books and Chapters).
- Public visibility uses the narrowest helper — prefer `postsReadAccess` or `publishedMediaReadAccess` over a hand-rolled check.
- Field-level rules use `adminOrSelfFieldAccess` instead of inline functions.
- No inline access function duplicates existing helper logic.
- `publishedMediaReadAccess` is async and queries posts/categories — do not use it on hot paths.

## Useful questions

- Does this operation require authentication? If yes, use `authenticatedAccess`.
- Is the owner field name correct for this collection?
- Is read access broader than update or delete access?
- Does this field need `adminOrSelfFieldAccess` or just `adminAccess`?
- Is the helper imported from `src/utils/access.ts` — not recreated locally?

## Output rule

Give a verdict by resource and operation, not by abstract policy.
If a rule is risky, say exactly who can now see or change the data and which helper would fix it.

## Supporting files

- [template.md](template.md) for an access review skeleton.
- [examples/sample.md](examples/sample.md) for the expected verdict format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.