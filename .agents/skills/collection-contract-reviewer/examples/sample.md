# Collection Contract Review Example

## Collection: `Books` — PASS (thin contract)

- `enforceOwnershipHook('owner')` present in `beforeValidate`.
- `createRandomizedSlugHook('title')` present; slug field has `validateImmutableSlug`.
- `access.create: authenticatedAccess`, `access.update: ownerAccess('owner')` — correct, imported from `src/utils/access.ts`.
- No inline transformation logic in the collection file.

---

## Collection: `Posts` (hypothetical issue) — FAIL (logic leak)

- A new `beforeChange` hook inline-generates a slug: move to `createRandomizedSlugHook('title')` in `beforeValidate`.
- `access.read` uses an inline function checking `req.user?.role === 'admin'`.
  Fix: replace with `import { postsReadAccess } from '../../utils/access'`.
- `author` field is missing `validateImmutableSlug` on the slug field, allowing slug mutation after creation.