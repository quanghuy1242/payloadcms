# Utility Extraction Adviser Example

## Scenario: `trimAndValidateUrl` written inline in a component

**Recommendation**: Move to `src/utils/strings.ts`.

- `strings.ts` already handles string normalization (`toNullableString`, `isNonEmptyString`).
- URL validation is a pure string operation with no UI dependency.
- Function signature: `export const toNullableUrl = (value: unknown): string | null`.
- Checked first: `numbers.ts` — no; `identifiers.ts` — no; `strings.ts` — YES, extend here.

---

## Scenario: Retry loop written inside a `useEffect` in BookImportWizard

**Recommendation**: Use `requestJSONWithRetry` from `src/utils/http.ts`.

- `http.ts` already exports `requestJSONWithRetry` with configurable `retries` and `retryDelayMs`.
- No new utility needed; replace the `useEffect` retry loop with:
  `requestJSONWithRetry(url, { retries: 2, retryDelayMs: 400, signal })`.