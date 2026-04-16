# Book Chapter Flow Review Example

## Change: Add `cancelImport` endpoint that sets `importStatus = 'canceled'`

**Lifecycle stage**: Import state machine

**Verdict**: PASS with one caveat.

- `importStatus = 'canceled'` is a valid transition from `importing` per the state machine.
- `applyBookImportLifecycleHook` will fire in `beforeChange` and validate the transition.
- The API handler correctly routes through `payload.update({ collection: 'books', ... })` — not a raw SQL update.
- **Caveat**: The admin component's cancel button does not pass an `AbortSignal` to the ongoing `requestJSONWithRetry` call. The chapter batch that is in-flight will still complete even after cancel is confirmed. Fix: create an `AbortController`, pass `signal` to the batch save, and call `abort()` when the cancel button fires.

---

## Change: Chapter `order` assigned in a React component instead of relying on `enforceUniqueChapterOrderHook`

**Lifecycle stage**: Chapter ordering

**Verdict**: FAIL.

- The component assigns sequential `order` values client-side before batch save.
- `enforceUniqueChapterOrderHook` runs server-side in `beforeChange` and will re-sequence anyway — the client-side assignment is redundant and could diverge.
- Fix: remove client-side order assignment; let the hook own sequencing. The component only needs to send chapters in the desired order.
