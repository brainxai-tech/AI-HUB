# Grassland Archive Phase Three Design

**Goal:** Add a local-first "grassland archive" so users can save recent test results, revisit personality history, and compare changes without accounts or backend storage.

**Approved direction:** Build this as the next lightweight retention feature after result sharing, relationship reports, and the atlas. Keep it private to the user's browser.

## Feature Set

1. **Save current result**
   - Result page shows a `保存到草原档案` action.
   - Saving stores the current personality, mode, timestamp, answered count, and five normalized dimension scores.
   - Save feedback is visible and short.

2. **Local archive panel**
   - Result page includes `我的草原档案`.
   - Shows recent saved records, newest first.
   - Each record shows personality name, mode, saved time, keywords, and five dimension scores.
   - The latest record can show "与上次相比" using the previous saved record.

3. **Clear archive**
   - User can clear the local archive.
   - This only removes browser-local data.

## Architecture

- Add `lib/result-archive.ts` with pure helper functions and a small storage adapter:
  - create archive entry
  - parse/serialize archive JSON
  - add entry with dedupe and limit
  - read/write/clear from a `Storage`-like object
  - compute dimension deltas against a previous result
- Add `tests/result-archive.test.ts` before implementation.
- Update `components/GrasslandTest.tsx`:
  - load archive from `localStorage` on mount
  - save current result from result page
  - render archive records
  - clear archive
- Update `app/globals.css` with scoped archive UI classes.

## Data Boundary

This phase intentionally does not create shareable IDs, accounts, cookies, server persistence, analytics, or cross-device sync. Saved records are private to the current browser and can disappear if the user clears browser data.

## UI Direction

The archive should feel like a field notebook tucked under the result page: compact, legible, and useful. It should not compete with the main personality result. The list should be scannable on mobile and dense enough on desktop.

## Verification

- Unit tests for archive creation, parsing, storage adapter behavior, dedupe/limit behavior, and score deltas.
- Full `npm.cmd run verify`.
- Browser smoke path:
  - finish experience mode
  - save current result
  - see one archive entry
  - retest/save or save again and confirm archive remains stable
  - clear archive
  - no horizontal overflow at desktop and 390px mobile width
