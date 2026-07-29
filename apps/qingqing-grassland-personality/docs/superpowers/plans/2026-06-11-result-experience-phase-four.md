# Result Experience Phase Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成用户点名的功能 3、7、8、11、12、13、14：结果页标签化、多风格分享图、图鉴卡分享、答题微反馈、体验版可信度提示、人格宇宙地图、关系组合库。

**Architecture:** 保持 Next.js 单页客户端体验，新增纯函数层承载可测试的结果页体验数据。`components/GrasslandTest.tsx` 只接入状态与 UI，`lib/result-enhancements.ts` 扩展现有 SVG 分享能力，`app/globals.css` 延续当前草原纸面板视觉。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS 4、Node test runner。

---

### Task 1: Result Experience Helpers

**Files:**
- Create: `lib/result-experience.ts`
- Create: `tests/result-experience.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personalityTypes } from "../data/personality-test.ts";
import {
  getAnswerFeedback,
  getExperienceModeNudge,
  getPersonalityUniversePoints,
  getRelationshipComboLibrary,
  resultTabs
} from "../lib/result-experience.ts";

describe("result experience helpers", () => {
  it("defines stable result tabs in the intended order", () => {
    assert.deepEqual(resultTabs.map((tab) => tab.id), [
      "overview",
      "social",
      "atlas",
      "scores",
      "archive",
      "share"
    ]);
  });

  it("returns answer feedback for every scale value", () => {
    assert.equal(getAnswerFeedback(1).tone, "disagree");
    assert.equal(getAnswerFeedback(3).tone, "neutral");
    assert.equal(getAnswerFeedback(5).tone, "agree");
  });

  it("nudges only experience mode toward the professional version", () => {
    assert.equal(getExperienceModeNudge("professional", 30), null);
    const nudge = getExperienceModeNudge("experience", 15);
    assert.ok(nudge);
    assert.match(nudge.body, /15/);
    assert.match(nudge.ctaLabel, /专业版/);
  });

  it("maps every personality into a bounded universe point and flags current", () => {
    const points = getPersonalityUniversePoints("grassland-sun");
    assert.equal(points.length, 20);
    assert.equal(points.filter((point) => point.isCurrent).length, 1);
    for (const point of points) {
      assert.ok(point.x >= 6 && point.x <= 94);
      assert.ok(point.y >= 6 && point.y <= 94);
      assert.ok(point.quadrant.length > 0);
    }
  });

  it("builds a unique relationship combo library for a result", () => {
    const self = personalityTypes.find((type) => type.id === "grassland-sun")!;
    const combos = getRelationshipComboLibrary(self);
    assert.ok(combos.length >= 3);
    assert.equal(new Set(combos.map((combo) => combo.partner.id)).size, combos.length);
    assert.ok(combos.every((combo) => combo.report.distance > 0));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/result-experience.test.ts`

Expected: FAIL because `lib/result-experience.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `resultTabs`, `getAnswerFeedback`, `getExperienceModeNudge`, `getPersonalityUniversePoints`, and `getRelationshipComboLibrary`. Use existing personality anchors and relationship report functions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test -- tests/result-experience.test.ts`

Expected: PASS.

### Task 2: Share Image Variants And Atlas Cards

**Files:**
- Modify: `lib/result-enhancements.ts`
- Modify: `tests/result-enhancements.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `shareCardStyles` exposes at least three styles.
- `buildShareCardSvg` changes SVG output when style id changes.
- `buildShareCardFilename` includes the style id when provided.
- `buildAtlasCardSvg` contains personality name, motif, keywords, and result URL.
- `buildAtlasCardFilename` returns a PNG filename.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test -- tests/result-enhancements.test.ts`

Expected: FAIL because the new exports and optional style behavior do not exist.

- [ ] **Step 3: Extend implementation**

Add style metadata and optional `styleId` to `ShareCardInput`. Keep the default output backward compatible. Add atlas-card SVG and filename builders with XML escaping reused from current helpers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd run test -- tests/result-enhancements.test.ts`

Expected: PASS.

### Task 3: Wire UI Into Result Page

**Files:**
- Modify: `components/GrasslandTest.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add state and computed data**

Add active result tab state, selected share style state, answer feedback state, universe points, relationship combos, and active atlas card download status.

- [ ] **Step 2: Render answer microfeedback**

Show a short feedback line after answer selection. Use `aria-live="polite"` and keep it non-blocking.

- [ ] **Step 3: Render result tabs**

Move existing result sections under tabs:
- `overview`: result hero, result detail tabs, closest matches, experience-mode nudge.
- `social`: daily weather, direct relationship report, relationship combo library.
- `atlas`: atlas cards, atlas card download buttons, universe map.
- `scores`: wind dial and five-dimension score rows.
- `archive`: local archive panel.
- `share`: multi-style result share image picker, save image, copy text.

- [ ] **Step 4: Add safe download helper**

Reuse the existing SVG-to-PNG flow for result share cards and atlas cards. Keep SVG fallback when PNG conversion fails.

- [ ] **Step 5: Style responsive UI**

Add CSS for tabs, microfeedback, content tabs, share style picker, atlas map, atlas actions, combo cards, and experience nudge. Preserve mobile-first layout and avoid text overflow.

### Task 4: Verification

**Files:**
- Read: full repository

- [ ] **Step 1: Run unit tests**

Run: `npm.cmd run test`

Expected: all tests pass.

- [ ] **Step 2: Run lint, typecheck, and build**

Run: `npm.cmd run verify`

Expected: test, lint, typecheck, and Next build pass.

- [ ] **Step 3: Start local dev server**

Run: `npm.cmd run dev:detached`

Expected: local app available at `http://localhost:3210`.

- [ ] **Step 4: Browser smoke check when available**

Open the app, answer through the experience path, confirm result tabs switch, share style selector changes, atlas card download buttons are visible, and no visible text overflows at mobile width.
