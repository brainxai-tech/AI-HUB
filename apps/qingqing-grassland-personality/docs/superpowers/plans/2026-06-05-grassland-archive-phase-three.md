# Grassland Archive Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-local grassland archive that saves recent results, displays history, compares against the previous result, and supports clearing local records.

**Architecture:** Put archive behavior in `lib/result-archive.ts` as pure functions plus a `Storage`-like adapter, then connect it from the existing client component. The result page owns UI state; localStorage remains the only persistence layer.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4 global CSS, Node built-in test runner.

---

### Task 1: Archive Helper Tests

**Files:**
- Create: `tests/result-archive.test.ts`
- Later create: `lib/result-archive.ts`

- [x] **Step 1: Write failing tests**

Create tests that import:
- `RESULT_ARCHIVE_LIMIT`
- `RESULT_ARCHIVE_STORAGE_KEY`
- `addArchivedResult`
- `clearArchiveStorage`
- `createArchivedResult`
- `getArchiveDelta`
- `parseArchive`
- `readArchive`
- `writeArchive`

Test behaviors:
- archive entry captures personality, mode, timestamp, answered count, and scores
- add prepends, dedupes by id, and limits to max count
- invalid JSON parses to an empty archive
- storage adapter can read, write, and clear
- delta compares current scores against the previous result

- [x] **Step 2: Run tests and confirm missing-module failure**

Run: `npm.cmd run test`

Expected: FAIL because `../lib/result-archive.ts` does not exist.

### Task 2: Archive Helper Implementation

**Files:**
- Create: `lib/result-archive.ts`

- [x] **Step 1: Implement typed archive model**

Add:
- `ArchivedResult`
- `ArchiveInput`
- `ArchiveDelta`
- `ArchiveStorage`

- [x] **Step 2: Implement helper functions**

Implement:
- `createArchivedResult(input, now)`
- `addArchivedResult(entries, entry, limit)`
- `parseArchive(raw)`
- `serializeArchive(entries)`
- `readArchive(storage)`
- `writeArchive(storage, entries)`
- `clearArchiveStorage(storage)`
- `getArchiveDelta(current, previous)`

- [x] **Step 3: Run tests**

Run: `npm.cmd run test`

Expected: all tests pass.

### Task 3: Result Page Integration

**Files:**
- Modify: `components/GrasslandTest.tsx`

- [x] **Step 1: Import archive helpers**

Update React import and add archive helper imports.

- [x] **Step 2: Add archive state**

Add:
- `archiveEntries`
- `archiveStatus`

Load from `window.localStorage` with a guarded lazy initializer.

- [x] **Step 3: Save and clear handlers**

Add:
- `saveCurrentResultToArchive`
- `clearGrasslandArchive`

Both should handle unavailable storage gracefully.

- [x] **Step 4: Render archive UI**

Add an archive panel after the social growth modules and before share/actions:
- save button
- clear button
- empty state
- saved record list
- score deltas versus previous record

### Task 4: Archive Styling

**Files:**
- Modify: `app/globals.css`

- [x] **Step 1: Add scoped archive styles**

Add:
- `.archive-panel`
- `.archive-panel-head`
- `.archive-actions`
- `.archive-status`
- `.archive-empty`
- `.archive-list`
- `.archive-card`
- `.archive-score-grid`
- `.archive-delta`

- [x] **Step 2: Add responsive rules**

Ensure archive controls wrap and score chips do not overflow on mobile.

### Task 5: Verification

**Files:**
- No source files unless fixes are found.

- [x] **Step 1: Run full automated verification**

Run: `npm.cmd run verify`

- [ ] **Step 2: Browser smoke**

Open `http://localhost:3210`, finish experience mode, save a result, verify archive appears, clear archive, and check desktop/mobile overflow.

Blocked on 2026-06-05: local server returned 200 after elevated restart, but the in-app Browser did not trigger React click handlers through Playwright click, CUA click, or DOM-CUA click. No app console errors were reported. Automated verification passed.

- [x] **Step 3: Update this plan checklist**

Mark completed items after verification.
