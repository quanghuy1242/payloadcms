# Book Chapter Flow Review Template

## Change

- Collection or utility affected:
- Lifecycle stage: import / ordering / persistence / access / admin UI

## Data model impact

- Book fields changed:
- Chapter fields changed:
- Status transition affected: yes / no

## Hook review

- `applyBookImportLifecycleHook` still correct: yes / no / N/A
- `enforceUniqueChapterOrderHook` still correct: yes / no / N/A
- `enforceBookHasNoChaptersBeforeDelete` still correct: yes / no / N/A

## Admin UI impact

- Component changed:
- Uses requestJSONWithRetry: yes / no
- Cancellation supported: yes / no

## Verdict

- Thin contract maintained: yes / no
- Constants imported from books.ts: yes / no
- Risk:
