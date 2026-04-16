# Access Control Review Example

## Resource: `chapters` collection — `update` operation

| Layer | Who | Helper used |
|-------|-----|-------------|
| Admin | All admins | implicit in `ownerAccess` |
| Owner | User whose ID matches `chapter.book.owner` | `ownerAccess('book')` |
| Authenticated | Cannot update | — |
| Public | Cannot update | — |

**Verdict**: PASS. `ownerAccess('book')` correctly traverses the relationship to the Book owner.

---

## Resource: `media` collection — `read` operation

**Verdict**: RISK. The current config uses a hand-rolled check instead of `publishedMediaReadAccess`.
Anyone can read unpublished media because the inline function only checks `_status === 'published'` without checking the `owner` fallback.

**Fix**: Replace with `import { publishedMediaReadAccess } from '../../utils/access'` and remove the inline function.