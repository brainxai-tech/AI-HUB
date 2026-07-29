# Idol Match Test MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the local idol matching MVP with RAG-backed candidate profiles, a 15-question experience mode, a 40-question professional mode, explainable Top 1/Top 3 results, clear local startup, and verified automated/browser checks.

**Architecture:** The app is a Next.js App Router client experience backed by build-time local data generation. `scripts/build-idol-profiles.mjs` reads the workspace knowledge base and generates `data/idol-profiles.generated.ts`; `lib/quiz.ts` defines quiz modes and question-to-tag weighting; `lib/matcher.ts` turns answers into a weighted preference profile and ranks generated `IdolProfile` records; `components/IdolMatchTest.tsx` owns UI state, localStorage persistence, quiz flow, and result display.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS/Tailwind entry via `app/globals.css`, Node test runner, local PowerShell/CMD startup scripts.

---

### Task 1: Verify Core MVP Scope

**Files:**
- Read: `lib/quiz.ts`
- Read: `lib/matcher.ts`
- Read: `scripts/build-idol-profiles.mjs`
- Read: `components/IdolMatchTest.tsx`
- Test: `tests/quiz.test.ts`
- Test: `tests/matcher.test.ts`
- Test: `tests/profile-builder.test.mjs`

- [x] **Step 1: Confirm quiz mode requirements**

Check that `lib/quiz.ts` exports both quiz modes:

```ts
export type QuizModeId = "experience" | "professional";
export const getQuizQuestionsForMode = (mode: QuizModeId): QuizQuestion[] => { /* ... */ };
```

Expected: experience mode returns 15 questions, professional mode returns all 40 questions, and the experience mode still covers the eight required dimensions.

- [x] **Step 2: Confirm RAG candidate generation**

Run:

```bash
node scripts/build-idol-profiles.mjs
```

Expected: output says the project extracted 120 candidate idol profiles from the workspace knowledge base and writes `data/idol-profiles.generated.ts`.

- [x] **Step 3: Confirm explainable matching**

Check that `lib/matcher.ts` returns `MatchResult` items with:

```ts
{
  idol,
  score,
  matchedTags,
  reasons
}
```

Expected: results are derived from weighted trait overlap, not random selection.

### Task 2: Align Product Copy With Two Quiz Versions

**Files:**
- Modify: `app/layout.tsx`
- Modify: `README.md`
- Test: `tests/app-copy.test.mjs`

- [x] **Step 1: Write the failing copy test**

Add:

```js
assert.match(layoutSource, /title:\s*"爱豆匹配测试"/);
assert.doesNotMatch(layoutSource, /title:\s*"40题爱豆匹配测试"/);
assert.match(readmeSource, /体验版[\s\S]*15题/);
assert.match(readmeSource, /专业版[\s\S]*40题/);
```

Run:

```bash
npm test
```

Expected before implementation: FAIL because the app title and README still mention only the 40-question version.

- [x] **Step 2: Update app metadata**

Change `app/layout.tsx` to:

```ts
export const metadata: Metadata = {
  title: "爱豆匹配测试",
  description: "娱乐向爱豆匹配测试，支持15题体验版和40题专业版，根据偏好标签和候选画像给出可解释推荐。"
};
```

- [x] **Step 3: Update README handoff**

Document:

```md
- 体验版：15题，更快完成，适合先玩一轮。
- 专业版：40题，画像更细，推荐解释更完整。
```

Also include the one-click local start file:

```md
双击 `start-idol-match-test.cmd` 可以启动并打开本地网页。
```

- [x] **Step 4: Run the copy test again**

Run:

```bash
npm test
```

Expected after implementation: PASS with the new app copy test included.

### Task 3: Verify End-to-End Completion

**Files:**
- Read: `package.json`
- Read: `scripts/start-dev-server.mjs`
- Read: `scripts/open-when-ready.ps1`

- [x] **Step 1: Run full automated verification**

Run:

```bash
npm run verify
```

Expected: test, lint, typecheck, RAG profile generation, and production build all pass.

- [x] **Step 2: Start the local dev server**

Run:

```bash
npm run dev:detached
```

Expected: local server starts on `http://localhost:3220` or the next available port and writes `dev-server.port`.

- [x] **Step 3: Browser-check the primary flow**

Open:

```text
http://localhost:3220
```

Expected:
- Homepage shows `体验版` / `15题` and `专业版` / `40题`.
- Clicking `开始体验版` enters a `1 / 15` quiz flow.
- Answering 15 questions reaches a result page with Top 1, Top 3, reasons, tags, and `重新测试`.

### Task 4: Final Handoff

**Files:**
- Read: `README.md`
- Read: `docs/superpowers/plans/2026-06-05-idol-match-test-mvp.md`

- [x] **Step 1: Report changed files**

Include the user-facing paths:

```text
app/layout.tsx
README.md
tests/app-copy.test.mjs
docs/superpowers/plans/2026-06-05-idol-match-test-mvp.md
```

- [x] **Step 2: Report verification evidence**

Include:

```text
npm test: pass
npm run verify: pass
Browser flow: experience mode 15-question path reaches result page
Local URL: http://localhost:3220
```

---

## Execution Notes

This project directory is not a Git repository, so the plan intentionally omits commit commands. If the project is later moved into Git, commit the implementation and plan together after `npm run verify` passes.
