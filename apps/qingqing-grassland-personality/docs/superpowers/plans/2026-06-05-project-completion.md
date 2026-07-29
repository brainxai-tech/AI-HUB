# Project Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Qingqing Grassland Personality Test as a deployable MVP with mode-aware UX copy, maintainable documentation, clean repository hygiene, and a verified Vercel production release.

**Architecture:** Keep the current Next.js single-page app architecture. Product data stays in `data/personality-test.ts`, scoring stays in `lib/scoring.ts`, result display helpers stay in `lib/result-presentation.ts`, and small UI copy rules move into a focused helper so they can be tested without a browser renderer.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node built-in test runner, Vercel CLI.

---

### Task 1: Mode-Aware Home Copy

**Files:**
- Create: `lib/test-mode-copy.ts`
- Modify: `components/GrasslandTest.tsx`
- Test: `tests/test-mode-copy.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { testModes } from "../data/personality-test.ts";
import { buildModeHelperLine } from "../lib/test-mode-copy.ts";

describe("test mode copy", () => {
  it("uses the selected mode estimate in the home helper line", () => {
    const professional = testModes.find((mode) => mode.id === "professional");
    const experience = testModes.find((mode) => mode.id === "experience");

    assert.ok(professional);
    assert.ok(experience);

    assert.equal(
      buildModeHelperLine(professional),
      "预计 4-6 分钟完成，结果可重新测试并复制分享文案。"
    );
    assert.equal(
      buildModeHelperLine(experience),
      "预计 2-3 分钟完成，结果可重新测试并复制分享文案。"
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm.cmd run test`

Expected: FAIL because `../lib/test-mode-copy.ts` does not exist.

- [x] **Step 3: Write minimal implementation**

```typescript
import type { TestMode } from "../data/personality-test.ts";

export function buildModeHelperLine(mode: TestMode): string {
  return `预计 ${mode.estimatedTime} 完成，结果可重新测试并复制分享文案。`;
}
```

- [x] **Step 4: Wire the helper into the home screen**

```typescript
import { buildModeHelperLine } from "@/lib/test-mode-copy";

const modeHelperLine = useMemo(() => buildModeHelperLine(activeMode), [activeMode]);

<p className="helper-line">{modeHelperLine}</p>
```

- [x] **Step 5: Run tests to verify green**

Run: `npm.cmd run test`

Expected: PASS for scoring, result presentation, and test mode copy suites.

### Task 2: Project Documentation

**Files:**
- Create: `README.md`

- [x] **Step 1: Add product and development README**

```markdown
# 青青草原型人格测试器

轻松、治愈、有梗但计分稳定的人格测试网页小工具。用户可以选择 30 题专业版或 15 题体验版，系统根据五个维度归一化分数匹配 20 种原创草原意象人格。

## 功能

- 首页自由选择专业版或体验版
- 五档量表答题
- 五维计分与按题组归一化
- 最近锚点匹配 20 种人格
- 结果页展示人格名、关键词、描述、优势、盲点、相处建议和分享文案
- 支持重新测试

## 本地开发

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。本项目也提供 Windows 桌面环境用的独立启动脚本：

```bash
npm run dev:detached
```

## 验证

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

或一次性运行：

```bash
npm run verify
```

## 部署

当前项目已链接到 Vercel 项目 `qingqing-grassland-personality`。

```bash
npx vercel deploy --prod --yes
```

生产地址：

https://qingqing-grassland-personality.vercel.app

## 说明

本产品是娱乐型自我理解测试，不是心理诊断工具，也不提供专业心理建议。
```

- [x] **Step 2: Verify README references match scripts**

Run: `npm.cmd run test`

Expected: PASS, confirming documented scripts still exist through package test coverage and no source behavior regressed.

### Task 3: Repository Hygiene

**Files:**
- Modify: `.gitignore`

- [x] **Step 1: Replace narrow ignore file with app-oriented ignores**

```gitignore
# dependencies
node_modules/

# next
.next/
out/

# production
build/
dist/

# environment
.env
.env.local
.env.*.local

# vercel
.vercel/

# logs and local dev server state
*.log
dev-server.pid
dev-server.port
tsconfig.tsbuildinfo

# OS/editor
.DS_Store
Thumbs.db
```

- [x] **Step 2: Confirm ignored generated files are no longer part of future git adds**

Run: `git status --short`

Expected: If this directory is not a git repository, note that explicitly. If it is later initialized as git, these generated files will be ignored.

### Task 4: Verification and Production Deploy

**Files:**
- No source files expected.

- [x] **Step 1: Run full local verification**

Run:

```bash
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: all commands exit 0.

- [x] **Step 2: Start local server and smoke test**

Run:

```bash
npm.cmd run dev:detached
```

Expected: `dev-server.port` contains `3210` and `http://localhost:3210` returns 200.

Browser checks:
- Home page renders both `专业版` and `体验版`.
- Selecting `体验版` updates helper text to `预计 2-3 分钟完成`.
- Starting `体验版` shows `第 1 题 / 15`.
- Mobile width 390px has no horizontal overflow.

- [x] **Step 3: Deploy production**

Run:

```bash
npx.cmd vercel deploy --prod --yes
```

Expected: Vercel reports Production deployment and aliases `https://qingqing-grassland-personality.vercel.app`.

- [x] **Step 4: Verify production**

Run:

```bash
npx.cmd vercel inspect https://qingqing-grassland-personality.vercel.app
npx.cmd vercel logs https://qingqing-grassland-personality.vercel.app --since 1h --level error
```

Expected: deployment status is Ready, homepage returns 200, and no error logs are found.
