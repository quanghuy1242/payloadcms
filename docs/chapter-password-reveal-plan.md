# Chapter Password Reveal Plan

## Executive Summary

The current chapter password implementation is one-way by design. New chapter passwords are stored in `chapters.password` as PBKDF2-SHA256 hashes from `src/utils/chapterPasswords.ts`, and `src/utils/chapterPasswordHooks.ts` removes the stored password from normal reads. A PBKDF2 hash cannot be decrypted back into the original password.

That means there is no safe technical way to reveal passwords that were already saved as hashes. The only implementation that can support a "Reveal password" button is to start storing a second, separately encrypted copy of the plaintext password at the moment the user sets or changes it. The hash remains the source of truth for verification; the encrypted copy exists only for owner/admin recovery.

This plan is for chapter gate passwords, not authentication passwords for user accounts. User account passwords should never be revealable.

## Current Behavior

Relevant files:

- `src/collections/Chapters.ts`
  - Defines `password`, `hasPassword`, and `passwordVersion`.
  - Uses `syncChapterPasswordStateHook` in `beforeChange`.
  - Uses `applyChapterPasswordReadStateHook` in `afterRead`.
- `src/utils/chapterPasswordHooks.ts`
  - Hashes any non-empty submitted `password`.
  - Clears password state when `password` is submitted as an empty string.
  - Increments `passwordVersion` on every password set/clear.
  - Hides `password` and `passwordVersion` after reads.
- `src/utils/chapterPasswords.ts`
  - Stores hashes as `pbkdf2_sha256$iterations$salt$hash`.
  - Verifies password attempts with PBKDF2 and timing-safe comparison.
  - Creates signed chapter unlock proofs.
- `src/components/admin/chapters/ChapterPasswordField.tsx`
  - Shows "Set a password" or "Enter a new password".
  - Has "Clear password".
  - Does not have a reveal path.
- `tests/int/chapter-password-field.int.spec.ts`
  - Covers the current admin password field states.

Current storage model:

```text
password = pbkdf2_sha256$120000$<salt>$<derived-key>
hasPassword = true
passwordVersion = integer bumped on change
```

Existing hashed rows cannot be decrypted. At best they can continue to be verified when a user enters a candidate password.

## Product Decision

Recommended decision:

1. Keep `chapters.password` as a one-way hash.
2. Add an optional encrypted recovery copy for future passwords only.
3. Show a "Reveal" button only when an encrypted recovery copy exists.
4. For existing hashed passwords, show "Password cannot be revealed. Set a new password to enable future reveal."
5. Require owner/admin session and an explicit click to reveal.
6. Log every reveal attempt.

This gives the user-facing convenience requested without weakening the password gate verification path.

## Solution Options

### Option A: Reset Only

Do not support reveal. Keep current one-way hashing and improve copy around resetting forgotten passwords.

Pros:

- Best security posture.
- No new key management.
- No migration risk.

Cons:

- Does not meet the "reveal stored password" product goal.
- Users must replace a forgotten chapter password.

Recommended only if security is prioritized over convenience.

### Option B: Hash Plus Encrypted Recovery Copy

Continue storing the PBKDF2 hash in `password`, and add a hidden encrypted field that stores the plaintext password encrypted with a server-side key.

Pros:

- Supports reveal for future passwords.
- Keeps verification one-way and timing-safe.
- Existing unlock proof behavior can remain unchanged.
- Can be scoped to owners/admins.

Cons:

- Introduces key management.
- If the app server and encryption key are compromised, revealable chapter passwords are compromised.
- Existing PBKDF2-only passwords remain unrecoverable.

Recommended approach.

### Option C: Client-Side Owner Escrow

Encrypt the chapter password in the browser using a key derived from an owner-controlled secret, then store only ciphertext server-side.

Pros:

- Server cannot reveal passwords by itself.
- Stronger confidentiality boundary.

Cons:

- Much more complex UX.
- If the owner forgets the escrow secret, recovery still fails.
- Harder to support admin recovery.
- Does not match the current Payload admin workflow.

Not recommended for this project unless chapter passwords become highly sensitive secrets.

### Option D: Store Plaintext

Store the password directly and display it from the database.

Pros:

- Simple.

Cons:

- Bad security posture.
- Database reads, logs, backups, and accidental admin exposure leak every chapter password.
- Conflicts with the current hook design and the reason hashing was added.

Do not implement.

## Recommended Architecture

Use a dual-storage model:

```text
chapters.password
  PBKDF2 hash used for unlock verification.

chapters.passwordEncrypted
  Hidden encrypted envelope containing the original plaintext password.

chapters.passwordEncryptedKeyVersion
  Key version used for encryption and later key rotation.

chapters.hasRecoverablePassword
  Read-only boolean for admin UI state.
```

The encrypted recovery copy must never replace the hash. All reader unlocks continue to call `verifyChapterPassword(args.password, storedPassword)`.

### Encryption Envelope

Add utility functions in `src/utils/chapterPasswordRecovery.ts`:

```ts
type ChapterPasswordRecoveryEnvelope = {
  alg: 'aes-256-gcm'
  ciphertext: string
  iv: string
  keyVersion: string
  tag: string
  v: 1
}
```

Implementation details:

- Use Node `crypto`.
- Use AES-256-GCM.
- Generate a random 12-byte IV per encryption.
- Use authenticated additional data such as `chapter:<chapterId>:password:v1` when the chapter ID is available.
- Encode binary values as `base64url`.
- Serialize as JSON or compact string. JSON is easier to inspect and version.
- Never log plaintext, ciphertext, keys, or decrypted values.

### Environment Variables

All reads must go through `src/lib/env.ts`.

Add:

```text
CHAPTER_PASSWORD_RECOVERY_KEY_VERSION=v1
CHAPTER_PASSWORD_RECOVERY_KEY=<base64url-encoded 32-byte key>
CHAPTER_PASSWORD_RECOVERY_PREVIOUS_KEYS=<optional JSON map of version to base64url key>
```

Recommended helper API:

```ts
export const getChapterPasswordRecoveryKeyVersion = (): string | null
export const getChapterPasswordRecoveryKey = (): Buffer | null
export const getChapterPasswordRecoveryPreviousKeys = (): Map<string, Buffer>
```

Behavior:

- In development, missing key disables reveal but does not break normal password hashing.
- In production, decide whether missing key should fail build/start or simply disable reveal. Recommended: disable reveal with a clear admin message, because password protection itself still works.

### Collection Fields

Update `src/collections/Chapters.ts`:

```ts
{
  name: 'passwordEncrypted',
  type: 'textarea',
  admin: {
    hidden: true,
  },
  access: {
    read: () => false,
    create: authenticatedFieldAccess,
    update: authenticatedFieldAccess,
  },
}
{
  name: 'passwordEncryptedKeyVersion',
  type: 'text',
  admin: {
    hidden: true,
  },
  access: {
    read: () => false,
    create: authenticatedFieldAccess,
    update: authenticatedFieldAccess,
  },
}
{
  name: 'hasRecoverablePassword',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'True when this password can be revealed by an authorized owner or admin.',
  },
}
```

Do not expose `passwordEncrypted` in GraphQL or REST reads. Only the dedicated reveal route should decrypt it.

After schema changes:

```bash
pnpm generate:types
pnpm payload migrate:create
```

Commit both migration files if this moves past planning.

### Hook Changes

Update `src/utils/chapterPasswordHooks.ts`.

When `password` is provided and non-empty:

1. Save the plaintext to a local variable.
2. Hash plaintext into `workingRecord.password`.
3. Encrypt plaintext into `workingRecord.passwordEncrypted`.
4. Set `workingRecord.passwordEncryptedKeyVersion`.
5. Set `workingRecord.hasRecoverablePassword = true`.
6. Set `workingRecord.hasPassword = true`.
7. Increment `passwordVersion`.

When `password` is provided as empty:

1. Set `password = null`.
2. Set `passwordEncrypted = null`.
3. Set `passwordEncryptedKeyVersion = null`.
4. Set `hasRecoverablePassword = false`.
5. Set `hasPassword = false`.
6. Increment `passwordVersion`.

When `password` is omitted on update:

1. Preserve previous hash and encrypted recovery state.
2. Preserve `hasRecoverablePassword`.
3. Preserve `passwordEncryptedKeyVersion`.

When encryption is disabled because the key is missing:

1. Still hash the password.
2. Set `hasPassword = true`.
3. Set `passwordEncrypted = null`.
4. Set `passwordEncryptedKeyVersion = null`.
5. Set `hasRecoverablePassword = false`.
6. The UI should explain that reveal is unavailable for this password.

Update `applyChapterPasswordReadStateHook`:

- Continue returning `password: undefined`.
- Continue returning `passwordVersion: undefined`.
- Also return `passwordEncrypted: undefined`.
- Also return `passwordEncryptedKeyVersion: undefined`.
- Return `hasRecoverablePassword: Boolean(chapter.hasRecoverablePassword ?? chapter.passwordEncrypted)`.

### Reveal API

Add a dedicated Next route:

```text
src/app/api/chapters/[id]/password/reveal/route.ts
```

Use the existing route style from `src/app/api/books/[id]/access/route.ts`.

Route:

```http
POST /api/chapters/:id/password/reveal
```

Request body:

```json
{
  "confirm": "reveal"
}
```

Response:

```json
{
  "password": "plaintext",
  "revealedAt": "2026-05-12T00:00:00.000Z"
}
```

Authorization:

- Require authenticated Payload user via `payload.auth({ headers: request.headers })`.
- Allow admins.
- Allow the chapter owner, matching `createdBy`.
- Deny everyone else.
- Return `403` for unauthorized.
- Return `404` if chapter does not exist or the caller should not know it exists.
- Return `409` if the chapter has a password but no recoverable encrypted copy.
- Return `400` if body confirmation is missing.

Data access:

- Use `payload.db.findOne` or `payload.findByID` with `overrideAccess: true` equivalent where needed so hidden fields can be read server-side.
- Select only `id`, `createdBy`, `hasPassword`, `hasRecoverablePassword`, `passwordEncrypted`, and `passwordEncryptedKeyVersion`.
- Do not return hash, encrypted envelope, or key version.

Security response headers:

```http
Cache-Control: no-store
Pragma: no-cache
```

Rate limiting:

- Minimum acceptable: server-side throttling by user ID and chapter ID in memory for development.
- Better production approach: Upstash or a durable table if reveal abuse matters.
- Even owner/admin-only reveal should be rate-limited to avoid accidental repeated exposure.

Audit:

- Log reveal attempts without plaintext.
- Minimum fields:
  - `chapterId`
  - `actorUserId`
  - `actorRole`
  - `result`: `success | forbidden | unavailable | error`
  - `createdAt`
  - request IP if available

Audit storage options:

1. Add a `chapter-password-reveal-audit` collection.
2. Log to the existing application logger if durable audit is not required.

Recommended: add a collection if this feature will be used by multiple admins.

### Admin UI

Update `src/components/admin/chapters/ChapterPasswordField.tsx`.

UI states:

1. No password set:
   - Placeholder: `Set a password`.
   - No reveal button.
   - No clear button.
2. Password set and recoverable:
   - Placeholder: `Enter a new password`.
   - Show `Reveal`.
   - Show `Clear password`.
3. Password set but unrecoverable:
   - Placeholder: `Enter a new password`.
   - Disable or hide `Reveal`.
   - Show text: `This existing password cannot be revealed. Set a new password to enable reveal.`
   - Show `Clear password`.
4. Recovery key missing:
   - Password can still be set.
   - Reveal unavailable.
   - Show text: `Password reveal is not configured on this server.`

Interaction:

- Require one explicit click to reveal.
- Optionally require a second confirmation in a small inline confirm state.
- Fetch `POST /api/chapters/:id/password/reveal`.
- Show plaintext in a password-style field with a visibility toggle.
- Add a `Copy` button only after reveal.
- Auto-hide after 30-60 seconds or when the field unmounts.
- Clear plaintext from React state after timeout.

Payload admin context:

- Use `useDocumentInfo` to read the current chapter ID.
- Use `useFormFields` to read `hasPassword` and `hasRecoverablePassword`.
- Use `requestJSON` from `src/utils/http.ts` for fetch consistency if it is safe in this client bundle. If import boundaries are awkward, use `fetch` directly inside this client component.

Do not put plaintext into the normal Payload form field value unless the user explicitly chooses "Use as new password" or edits it. Revealing should not dirty the form by itself.

### Backfill and Migration Strategy

Existing rows fall into two possible categories:

1. PBKDF2 hash rows:
   - `password` starts with `pbkdf2_sha256$`.
   - Cannot be recovered.
   - Set `hasRecoverablePassword = false`.
   - `passwordEncrypted = null`.
   - `passwordEncryptedKeyVersion = null`.
2. Legacy plaintext rows:
   - `password` does not start with `pbkdf2_sha256$`.
   - Can be recovered once during migration.
   - Encrypt plaintext into `passwordEncrypted`.
   - Hash plaintext into `password`.
   - Set `hasRecoverablePassword = true`.

Backfill script:

```text
scripts/backfill-chapter-password-recovery.ts
```

Dry-run output:

- total protected chapters
- hash-only unrecoverable count
- legacy plaintext converted count
- already recoverable count
- missing key count

Do not print passwords.

Recommended phases:

1. Add schema fields and code paths.
2. Deploy with recovery key configured.
3. Run migration/backfill in dry-run.
4. Run migration/backfill write mode.
5. Verify new password sets produce both hash and encrypted recovery copy.

## Implementation Checklist

### Phase 1: Foundation

- Add env helpers in `src/lib/env.ts`.
- Add `src/utils/chapterPasswordRecovery.ts`.
- Add unit tests for encrypt/decrypt, wrong key, wrong version, tampered ciphertext, and missing key.
- Add schema fields to `src/collections/Chapters.ts`.
- Run `pnpm generate:types`.
- Create migration with `pnpm payload migrate:create`.

### Phase 2: Write Path

- Update `syncChapterPasswordStateHook`.
- Update `applyChapterPasswordReadStateHook`.
- Preserve encrypted recovery state when password is omitted.
- Clear encrypted recovery state when password is cleared.
- Add hook tests covering set, update without password, replace password, clear password, missing recovery key.

### Phase 3: Reveal API

- Add `src/app/api/chapters/[id]/password/reveal/route.ts`.
- Add owner/admin authorization helper, preferably in `src/utils/chapterPasswordRecovery.ts` or a focused route-local helper.
- Add audit logging.
- Add route tests for admin success, owner success, non-owner forbidden, anonymous forbidden, unrecoverable conflict, missing key, missing confirmation.

### Phase 4: Admin UI

- Update `ChapterPasswordField.tsx`.
- Add reveal, copy, loading, error, unavailable, and auto-hide states.
- Avoid making the Payload form dirty on reveal.
- Add tests in `tests/int/chapter-password-field.int.spec.tsx` or the existing `.ts` test if the current setup supports it.
- Validate the UI in Payload admin manually.

### Phase 5: Backfill

- Add `scripts/backfill-chapter-password-recovery.ts`.
- Support `--dry-run` and `--write`.
- Convert legacy plaintext only.
- Mark PBKDF2-only rows as unrecoverable.
- Add script README notes.

### Phase 6: Verification

- Run:

```bash
pnpm tsc --noEmit
pnpm test:int
pnpm build
```

- Manually verify:
  - New chapter password can be set.
  - Existing hash-only password cannot be revealed.
  - Newly set password can be revealed by owner/admin.
  - Non-owner cannot reveal.
  - Clear password removes hash and encrypted copy.
  - Replacing password invalidates old reader proofs through `passwordVersion`.

## Backlog

### Must Have

- Dual-storage design: hash plus encrypted recovery copy.
- Reveal API with owner/admin authorization.
- Admin UI reveal button with unavailable state for old hashes.
- No plaintext in logs, generated types, GraphQL schema exposure, or normal REST reads.
- Tests for encryption, hooks, route authorization, and UI states.
- Migration/backfill that handles hash-only and legacy plaintext rows differently.

### Should Have

- Durable audit collection for reveal attempts.
- Auto-hide revealed plaintext in the admin UI.
- Copy button after reveal.
- Recovery key status indicator in the field.
- Key version support from day one.
- Scripted dry-run before write-mode backfill.

### Could Have

- Require re-authentication before reveal.
- Require admin users to provide a reason before revealing someone else's chapter password.
- Rate limit persisted in a database table.
- Key rotation script that re-encrypts recovery envelopes with the newest key.
- Separate permission such as `chapter-password:reveal` instead of role/ownership only.

### Won't Have Initially

- Reveal for existing PBKDF2-only passwords.
- Plaintext password storage.
- Reveal of user account passwords.
- Reader-facing reveal. This is admin/owner CMS functionality only.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Recovery key leaks | All recoverable chapter passwords can be decrypted | Store key only in production secret manager, support key rotation, audit access |
| Plaintext appears in logs | Password disclosure | Never log request/response body for reveal route; tests should assert no plaintext in audit |
| UI accidentally saves revealed password | Unexpected password rotation or dirty form | Keep revealed value in separate local state, not Payload field state |
| Existing users expect old passwords to reveal | Product confusion | Show explicit unrecoverable copy and prompt to set a new password |
| Missing env key silently disables recovery | Feature appears broken | Add visible unavailable state and startup/admin diagnostics |
| Over-broad API access | Unauthorized disclosure | Route-level owner/admin check, tests for anonymous/non-owner, no generic field read access |

## Definition of Done

- Current chapter unlock behavior still uses PBKDF2 verification.
- A newly saved chapter password creates a hash and encrypted recovery envelope.
- Normal Payload reads never include hash, encrypted envelope, or plaintext.
- Owner/admin can reveal a recoverable password through the dedicated route.
- Non-owner and anonymous users cannot reveal it.
- Existing hash-only passwords are clearly marked unrecoverable.
- Clearing a password removes both the hash and encrypted recovery copy.
- Tests and generated artifacts are updated.
- Documentation explains that previously hashed passwords cannot be decrypted.
