# Social Growth Phase Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the second-phase result-page growth layer: daily grassland weather, two-person relationship report, and a collectible personality atlas.

**Architecture:** Keep all new behavior in pure TypeScript helpers under `lib/social-growth.ts`, then render the helpers from the existing single `GrasslandTest` component. The UI remains local-first and does not add routes, persistence, or external services.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind 4 global CSS, Node test runner.

---

### Task 1: Core Logic Tests

**Files:**
- Create: `tests/social-growth.test.ts`
- Later create: `lib/social-growth.ts`

- [x] **Step 1: Write failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { personalityTypes } from "../data/personality-test.ts";
import {
  getDailyGrasslandWeather,
  getPersonalityAtlasEntries,
  getRelationshipReport
} from "../lib/social-growth.ts";

const sun = personalityTypes.find((type) => type.id === "grassland-sun")!;
const moon = personalityTypes.find((type) => type.id === "moonlight-boundary")!;

test("relationship report marks identical types as same-frequency echo", () => {
  const report = getRelationshipReport(sun, sun);
  assert.equal(report.distance, 0);
  assert.equal(report.climate, "同频回声");
  assert.match(report.summary, /草原太阳型/);
});

test("relationship report summarizes contrast for distant anchors", () => {
  const report = getRelationshipReport(sun, moon);
  assert.ok(report.distance > 0);
  assert.ok(report.shared.length > 0);
  assert.ok(report.watchOut.length > 0);
  assert.ok(report.suggestion.length > 0);
});

test("daily weather is stable for the same date and personality", () => {
  const date = new Date("2026-06-05T08:00:00+08:00");
  const first = getDailyGrasslandWeather(sun, date);
  const second = getDailyGrasslandWeather(sun, date);
  assert.deepEqual(first, second);
  assert.equal(first.seedDate, "2026-06-05");
});

test("atlas exposes all personality types and flags the current one", () => {
  const entries = getPersonalityAtlasEntries("grassland-sun");
  assert.equal(entries.length, 20);
  assert.equal(entries.filter((entry) => entry.isCurrent).length, 1);
  assert.equal(entries.find((entry) => entry.id === "grassland-sun")?.isCurrent, true);
});
```

- [x] **Step 2: Run tests and confirm missing-module failure**

Run: `npm.cmd run test`
Expected: FAIL because `../lib/social-growth.ts` does not exist yet.

### Task 2: Core Logic Implementation

**Files:**
- Create: `lib/social-growth.ts`

- [x] **Step 1: Implement minimal helper API**

Create:
- `getRelationshipReport(self, other)`
- `getDailyGrasslandWeather(personality, date?)`
- `getPersonalityAtlasEntries(currentId)`

- [x] **Step 2: Run tests**

Run: `npm.cmd run test`
Expected: all tests pass.

### Task 3: Result Page UI

**Files:**
- Modify: `components/GrasslandTest.tsx`

- [x] **Step 1: Import social growth helpers and personality data**

Add `personalityTypes` to existing data imports and import the three helper functions from `@/lib/social-growth`.

- [x] **Step 2: Add result-page state and derived values**

Add `selectedPartnerId`, reset it on mode changes/retests, derive `selectedPartner`, `relationshipReport`, `dailyWeather`, and `atlasEntries` from `match`.

- [x] **Step 3: Render three modules**

Add:
- a daily weather card near the top of the result page,
- a relationship report card with a `<select>`,
- a collapsible atlas grid that highlights the current result.

### Task 4: Responsive Styling

**Files:**
- Modify: `app/globals.css`

- [x] **Step 1: Add scoped styles**

Add classes for `.growth-grid`, `.daily-weather-card`, `.relationship-card`, `.partner-select`, `.report-metrics`, `.atlas-panel`, `.atlas-grid`, and `.atlas-card`.

- [x] **Step 2: Add mobile rules**

Ensure the new select, report cards, and atlas cards wrap without overflow at narrow widths.

### Task 5: Verification

**Files:**
- No production files unless fixes are discovered.

- [x] **Step 1: Run automated checks**

Run:
- `npm.cmd run test`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

- [x] **Step 2: Browser smoke**

Open `http://localhost:3210`, complete a short experience-version path, verify result page contains:
- 每日草原天气
- 双人相处报告
- 草原图鉴
- 20 atlas entries
- no horizontal overflow on mobile

- [x] **Step 3: Update this checklist**

Mark completed plan items after verification.
