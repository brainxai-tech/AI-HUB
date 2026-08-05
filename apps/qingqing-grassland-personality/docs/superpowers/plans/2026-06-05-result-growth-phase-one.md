# Result Growth Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first growth-oriented result enhancements: downloadable share image, Top 3 closest personality matches, and expandable dimension explanations.

**Architecture:** Keep scoring deterministic and dependency-free. Add pure result-enhancement helpers in `lib/result-enhancements.ts` for Top 3 matches, dimension explanations, and share-card SVG generation; keep browser-only PNG download wiring inside `components/GrasslandTest.tsx`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node built-in test runner, native browser Canvas/SVG APIs.

---

### Task 1: Result Enhancement Helpers

**Files:**
- Create: `lib/result-enhancements.ts`
- Create: `tests/result-enhancements.test.ts`
- Modify: `lib/scoring.ts`

- [x] **Step 1: Write failing tests**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dimensions, personalityTypes } from "../data/personality-test.ts";
import {
  buildShareCardSvg,
  getClosestPersonalityMatches,
  getDimensionInsight
} from "../lib/result-enhancements.ts";
import { getPersonalityVisualProfile } from "../lib/result-presentation.ts";

describe("result growth helpers", () => {
  it("returns the closest personality matches in distance order", () => {
    const matches = getClosestPersonalityMatches(
      { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      3
    );

    assert.equal(matches.length, 3);
    assert.equal(matches[0]?.id, "grassland-sun");
    assert.ok(matches[0]!.distance <= matches[1]!.distance);
    assert.ok(matches[1]!.distance <= matches[2]!.distance);
  });

  it("explains a dimension score with the correct directional label", () => {
    const positive = getDimensionInsight("SE", 67);
    const neutral = getDimensionInsight("AC", 0);
    const negative = getDimensionInsight("EE", -52);

    assert.equal(positive.label, "群体发光");
    assert.equal(neutral.label, "弹性平衡");
    assert.equal(negative.label, "自我消化");
    assert.match(positive.description, /社交能量/);
    assert.match(negative.suggestion, /表达/);
  });

  it("builds a share card svg with escaped text and key result data", () => {
    const type = personalityTypes.find((item) => item.id === "grassland-sun");
    assert.ok(type);

    const svg = buildShareCardSvg({
      personality: { ...type, name: "草原太阳型 <测试>" },
      visualProfile: getPersonalityVisualProfile(type.id),
      scores: { SE: 80, AC: 40, RB: -40, RV: 40, EE: 80 },
      modeLabel: "专业版 · 完整 30 题",
      dimensions
    });

    assert.match(svg, /<svg/);
    assert.match(svg, /草原太阳型 &lt;测试&gt;/);
    assert.match(svg, /专业版 · 完整 30 题/);
    assert.match(svg, /社交能量/);
    assert.match(svg, /娱乐自测/);
  });
});
```

- [x] **Step 2: Run red test**

Run: `npm.cmd run test`

Expected: FAIL because `lib/result-enhancements.ts` does not exist.

- [x] **Step 3: Implement helpers**

Implement:
- `getClosestPersonalityMatches(scores, limit = 3)`
- `getDimensionInsight(dimensionId, value)`
- `buildShareCardSvg(input)`
- `buildShareCardFilename(personalityName)`

- [x] **Step 4: Run tests green**

Run: `npm.cmd run test`

Expected: PASS.

### Task 2: Result Page UI

**Files:**
- Modify: `components/GrasslandTest.tsx`
- Modify: `app/globals.css`

- [x] **Step 1: Wire helpers into result state**

Use `useMemo` for:
- `closestMatches`
- `dimensionInsights`
- `shareCardSvg`
- `shareCardFilename`

- [x] **Step 2: Add share image action**

Add a second share-panel action button:
- Primary action: `保存结果图`
- Secondary action remains `复制文案`
- Use browser-native Image + Canvas + `toBlob` to download a PNG.
- If PNG conversion fails, download the SVG as fallback.

- [x] **Step 3: Add Top 3 cards**

Add a section titled `相近草原意象`, showing three compact cards with:
- rank
- personality name
- motif label
- distance
- keywords

- [x] **Step 4: Add expandable dimension explanations**

Inside each score row, add a native `<details>` block with:
- summary `怎么看这个分数`
- direction description
- suggestion

- [x] **Step 5: Add responsive CSS**

Add styles for:
- `.similar-panel`
- `.similar-grid`
- `.similar-card`
- `.dimension-insight`
- `.download-status`

### Task 3: Verification

**Files:**
- No source files expected.

- [x] **Step 1: Run automated checks**

Run:

```bash
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: all exit 0.

- [x] **Step 2: Browser smoke**

Run local server:

```bash
npm.cmd run dev:detached
```

Check:
- Result page shows `保存结果图`
- Result page shows `相近草原意象`
- Result page has `怎么看这个分数`
- Mobile 390px has no horizontal overflow
- Clicking `保存结果图` triggers a download event
