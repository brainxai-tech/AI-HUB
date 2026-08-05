# Test Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a freely selectable professional mode with 30 questions and experience mode with 15 questions.

**Architecture:** Keep one shared question bank and add mode metadata that points to question IDs. Scoring functions accept the active question list so normalization uses the selected mode's maximum possible score. The client UI selects a mode before starting and runs the same quiz/result flow against the active question set.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, Node built-in test runner.

---

### Task 1: Mode Data And Scoring

**Files:**
- Modify: `data/personality-test.ts`
- Modify: `lib/scoring.ts`
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { getQuestionsForMode, testModes } from "../data/personality-test.ts";
import { getDimensionMaximums, calculateScores } from "../lib/scoring.ts";

assert.equal(testModes.find((mode) => mode.id === "professional")?.questionIds.length, 30);
assert.equal(testModes.find((mode) => mode.id === "experience")?.questionIds.length, 15);
assert.deepEqual(getDimensionMaximums(getQuestionsForMode("experience")), {
  SE: 12,
  AC: 12,
  RB: 12,
  RV: 12,
  EE: 12
});
assert.equal(calculateScores(neutralExperienceAnswers, getQuestionsForMode("experience")).answeredCount, 15);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scoring.test.ts`

Expected: FAIL because `testModes` and `getQuestionsForMode` do not exist.

- [ ] **Step 3: Write implementation**

Add `TestModeId`, `TestMode`, `testModes`, `getQuestionsForMode(modeId)` in `data/personality-test.ts`. Update `calculateScores` and `getDimensionMaximums` to accept `activeQuestions = questions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scoring.test.ts`

Expected: PASS.

### Task 2: Mode Selection UI

**Files:**
- Modify: `components/GrasslandTest.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add state and active question set**

Use `selectedModeId`, `activeMode`, and `activeQuestions`. Reset answers/current index on start.

- [ ] **Step 2: Add home mode cards**

Render professional and experience cards with title, badge, question count, estimated time, and description. Use `aria-pressed` for selected mode.

- [ ] **Step 3: Wire quiz flow**

Replace all direct `questions` length/index access with `activeQuestions`. Pass `activeQuestions` into `calculateScores`.

- [ ] **Step 4: Add mode badge on test and result screens**

Show the current mode near progress and result title so users understand which version they completed.

### Task 3: Verification

**Files:**
- No code files.

- [ ] **Step 1: Run automated checks**

Run:
```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

- [ ] **Step 2: Browser smoke**

Open `http://localhost:3210`, select professional mode and experience mode, ensure the progress total changes to 30 and 15 respectively, and complete experience mode to result.
