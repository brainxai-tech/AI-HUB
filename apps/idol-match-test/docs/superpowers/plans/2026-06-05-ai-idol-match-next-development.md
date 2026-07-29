# AI Idol Match Next Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the finished local MVP into a verifiable, deployable, more genuinely AI-assisted idol matching product with stronger data quality, better result explanations, shareable output, and launch readiness.

**Architecture:** Keep the current Next.js App Router structure and deterministic quiz/matching core. Improve it in layers: first restore install/build verification, then harden RAG profile generation, then enrich matching diagnostics and result UI, then add an optional server-side AI explanation route with a deterministic fallback so the product still works without API keys.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, ESLint, local Markdown RAG source, generated TypeScript data bundle, optional server API route for AI-style explanation.

---

## Current Audit

The project is in `C:\Users\Michael Song\Desktop\私人办公\01-Projects\ai-idol-match-test-deploy`.

- Git status is clean on `main`.
- Remote is `https://github.com/michaelsongyunkun/ai-idol-match-test.git`.
- Current MVP already supports 15-question experience mode and 40-question professional mode.
- `node --test tests/*.test.ts tests/*.test.mjs` passes: 16 tests, 5 suites.
- `npm run verify` currently fails at `npm run lint` because `node_modules` is missing and `eslint` is not installed locally in this deploy directory.
- `data/idol-profiles.generated.ts` currently contains 120 RAG profiles, but the generated `sourceLabel` points at `01-Projects/idol-match-test/...`; after dependency setup, regenerate the bundle from this project directory and verify it prefers `ai-idol-match-test-deploy/knowledge-base/...`.

## File Structure Map

- `components/IdolMatchTest.tsx`: client UI state, quiz flow, result screen, localStorage persistence.
- `lib/quiz.ts`: 40 authored questions, 15-question mode selection, option tag weights.
- `lib/matcher.ts`: user preference profile builder and idol ranking.
- `lib/types.ts`: shared quiz, profile, and match result types.
- `scripts/profile-builder.mjs`: parses Markdown/list/table sources into idol profiles.
- `scripts/build-idol-profiles.mjs`: searches knowledge files and writes `data/idol-profiles.generated.ts`.
- `data/idol-profiles.generated.ts`: generated build artifact imported by the client.
- `tests/*.test.*`: Node test runner coverage for copy, quiz, matcher, profile builder, startup scripts.
- `README.md`: local handoff instructions.

---

### Task 1: Restore Full Verification Baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Read: `.gitignore`
- Test: `tests/*.test.ts`
- Test: `tests/*.test.mjs`

- [ ] **Step 1: Install local dependencies**

Run:

```bash
npm ci
```

Expected:

```text
node_modules/ is created locally and remains ignored by .gitignore.
```

- [ ] **Step 2: Re-run tests only**

Run:

```bash
npm test
```

Expected:

```text
tests 16
pass 16
fail 0
```

- [ ] **Step 3: Run the full verification script**

Run:

```bash
npm run verify
```

Expected:

```text
npm run test: pass
npm run lint: pass
npm run typecheck: pass
npm run build: pass
```

- [ ] **Step 4: Commit only if dependencies are not staged**

Run:

```bash
git status --short
```

Expected:

```text
no node_modules files appear
```

---

### Task 2: Make RAG Bundle Generation Testable And Local-Source First

**Files:**
- Modify: `scripts/build-idol-profiles.mjs`
- Create: `tests/profile-bundle.test.mjs`
- Generated: `data/idol-profiles.generated.ts`

- [ ] **Step 1: Write the failing bundle priority test**

Create `tests/profile-bundle.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildBundle } from "../scripts/build-idol-profiles.mjs";

describe("idol profile bundle generation", () => {
  it("prefers the current project knowledge base before older workspace copies", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "idol-workspace-"));
    const projectRoot = join(workspaceRoot, "01-Projects", "ai-idol-match-test-deploy");
    const oldProjectRoot = join(workspaceRoot, "01-Projects", "idol-match-test");
    const knowledgeDir = join(projectRoot, "knowledge-base");
    const oldKnowledgeDir = join(oldProjectRoot, "knowledge-base");

    mkdirSync(knowledgeDir, { recursive: true });
    mkdirSync(oldKnowledgeDir, { recursive: true });

    writeFileSync(
      join(knowledgeDir, "年轻向全球idol资料清单_120plus.md"),
      "| 序号 | 姓名 | 资料 |\n| --- | --- | --- |\n| 1 | 本项目爱豆 | 舞台 live 稳定，粉丝互动自然。 |",
      "utf8"
    );
    writeFileSync(
      join(oldKnowledgeDir, "年轻向全球idol资料清单_120plus.md"),
      "| 序号 | 姓名 | 资料 |\n| --- | --- | --- |\n| 1 | 旧项目爱豆 | 旧资料，不应优先显示。 |",
      "utf8"
    );

    const bundle = buildBundle({ projectRoot, workspaceRoot });

    assert.equal(bundle.status.mode, "rag");
    assert.equal(bundle.profiles[0].name, "本项目爱豆");
    assert.match(bundle.status.sourceLabel, /ai-idol-match-test-deploy/);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test tests/profile-bundle.test.mjs
```

Expected before implementation:

```text
FAIL because scripts/build-idol-profiles.mjs does not export buildBundle with injectable roots.
```

- [ ] **Step 3: Refactor the builder for importable functions**

Modify `scripts/build-idol-profiles.mjs` so the root values are injectable and the CLI side effect remains intact:

```js
const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkspaceRoot = resolve(defaultProjectRoot, "..", "..");
const defaultOutputFile = join(defaultProjectRoot, "data", "idol-profiles.generated.ts");

export const buildBundle = ({
  projectRoot = defaultProjectRoot,
  workspaceRoot = defaultWorkspaceRoot
} = {}) => {
  const directRagFile = join(projectRoot, "knowledge-base", "年轻向全球idol资料清单_120plus.md");
  const files = [
    ...(existsSync(directRagFile) ? [directRagFile] : []),
    ...findCandidateFiles(workspaceRoot)
  ];
  const uniqueFiles = [...new Set(files)];
  const profiles = new Map();

  for (const file of uniqueFiles) {
    for (const profile of parseSourceFile(file, workspaceRoot)) {
      if (!profiles.has(profile.name)) {
        profiles.set(profile.name, profile);
      }
    }
  }

  const extractedProfiles = [...profiles.values()];
  if (extractedProfiles.length > 0) {
    return {
      status: {
        mode: "rag",
        sourceLabel: uniqueFiles.map((file) => relative(workspaceRoot, file).replace(/\\/g, "/")).join(" + "),
        message: `已从工作区知识库提取 ${extractedProfiles.length} 位候选爱豆。`,
        searchedHints
      },
      profiles: extractedProfiles
    };
  }

  return {
    status: {
      mode: "mock",
      sourceLabel: "mock demo fallback",
      message: "未在当前可读工作区找到“年轻向全球idol资料清单_120plus.md”或“明星对话”资料，已启用本地 mock 候选库用于演示。",
      searchedHints
    },
    profiles: buildMockProfiles()
  };
};
```

Also change `parseSourceFile` to accept the injected workspace root:

```js
const parseSourceFile = (filePath, workspaceRoot) => {
  const raw = readFileSync(filePath, "utf8");
  const extension = extname(filePath).toLowerCase();
  const source = relative(workspaceRoot, filePath).replace(/\\/g, "/");

  if (extension === ".json") {
    try {
      return extractProfilesFromMarkdown(JSON.stringify(JSON.parse(raw), null, 2), source);
    } catch {
      return extractProfilesFromMarkdown(raw, source);
    }
  }

  return extractProfilesFromMarkdown(raw, source);
};
```

Finish the file with a guarded CLI runner:

```js
export const writeBundle = (bundle, outputFile = defaultOutputFile) => {
  mkdirSync(dirname(outputFile), { recursive: true });
  const content = `import type { IdolDataBundle } from "../lib/types";

export const idolDataBundle: IdolDataBundle = ${JSON.stringify(bundle, null, 2)};
`;

  writeFileSync(outputFile, content, "utf8");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bundle = buildBundle();
  writeBundle(bundle);
  console.log(`${bundle.status.message} 候选库文件：${relative(defaultProjectRoot, defaultOutputFile)}`);
}
```

- [ ] **Step 4: Re-run the bundle test and regenerate data**

Run:

```bash
node --test tests/profile-bundle.test.mjs
node scripts/build-idol-profiles.mjs
```

Expected:

```text
profile-bundle.test.mjs passes
data/idol-profiles.generated.ts sourceLabel includes ai-idol-match-test-deploy/knowledge-base
```

---

### Task 3: Add Structured Profile Quality Fields

**Files:**
- Modify: `lib/types.ts`
- Modify: `scripts/profile-builder.mjs`
- Modify: `tests/profile-builder.test.mjs`
- Generated: `data/idol-profiles.generated.ts`

- [ ] **Step 1: Extend profile types**

Modify `lib/types.ts`:

```ts
export type IdolProfile = {
  id: string;
  name: string;
  source: string;
  summary: string;
  tags: string[];
  traits: Record<string, number>;
  entryReasons: string[];
  roles: string[];
  region?: string;
  age?: number;
  confidence: number;
};
```

- [ ] **Step 2: Add profile quality tests**

In `tests/profile-builder.test.mjs`, add:

```js
it("extracts structured profile fields when source copy contains age, region, and roles", () => {
  const markdown = [
    "| 序号 | 姓名 | 资料 |",
    "| --- | --- | --- |",
    "| 1 | 王一博 | 28。男 / 中国。演员/歌手/舞者。冷感、专注、酷。UNIQ 成员；《陈情令》《无名》《热烈》。 |"
  ].join("\n");

  const [profile] = extractProfilesFromMarkdown(markdown, "test.md");

  assert.equal(profile.age, 28);
  assert.equal(profile.region, "中国");
  assert.deepEqual(profile.roles, ["演员", "歌手", "舞者"]);
  assert.ok(profile.confidence >= 70);
});
```

- [ ] **Step 3: Implement structured extraction**

In `scripts/profile-builder.mjs`, add:

```js
const knownRoles = ["演员", "歌手", "舞者", "爱豆", "音乐人", "主持人", "模特", "rapper"];

const extractAge = (text) => {
  const match = text.match(/(?:^|[^\d])(\d{2})(?:岁|。)/u);
  return match ? Number(match[1]) : undefined;
};

const extractRegion = (text) => {
  const match = text.match(/[男女]\s*\/\s*([^。|｜\s]+)/u);
  return match?.[1];
};

const extractRoles = (text) =>
  knownRoles.filter((role) => text.toLowerCase().includes(role.toLowerCase()));

const scoreProfileConfidence = ({ tags, roles, age, region, summary }) => {
  let score = 40;
  if (tags.length >= 2) score += 20;
  if (roles.length > 0) score += 15;
  if (age) score += 10;
  if (region) score += 10;
  if (summary.length >= 40) score += 5;
  return Math.min(100, score);
};
```

Then update `createProfile`:

```js
const createProfile = (name, body, source) => {
  const fullText = `${name}\n${body}`;
  const tags = pickProfileTags(fullText);
  const roles = extractRoles(fullText);
  const age = extractAge(body);
  const region = extractRegion(body);
  const summary = compactSummary(body) || "知识库中提取到的候选爱豆资料。";

  return {
    id: slugify(name) || `idol-${Math.abs(name.length * 13)}`,
    name,
    source,
    summary,
    tags,
    traits: traitsFromTags(tags, body),
    entryReasons: entryReasonsFromTags(tags),
    roles,
    region,
    age,
    confidence: scoreProfileConfidence({ tags, roles, age, region, summary })
  };
};
```

- [ ] **Step 4: Run data tests and regenerate**

Run:

```bash
npm test
node scripts/build-idol-profiles.mjs
```

Expected:

```text
profile builder tests pass
generated profiles include roles and confidence
```

---

### Task 4: Upgrade Matching Results With Confidence And Dimension Diagnostics

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/matcher.ts`
- Modify: `tests/matcher.test.ts`
- Modify: `components/IdolMatchTest.tsx`

- [ ] **Step 1: Extend result types**

Modify `lib/types.ts`:

```ts
export type DimensionScore = {
  label: string;
  score: number;
  matchedTags: string[];
};

export type MatchResult = {
  idol: IdolProfile;
  score: number;
  confidence: number;
  matchedTags: string[];
  reasons: string[];
  dimensionScores: DimensionScore[];
};
```

- [ ] **Step 2: Write matching diagnostics test**

In `tests/matcher.test.ts`, add:

```ts
it("returns confidence and dimension diagnostics for result explanations", () => {
  const profile = {
    selectedOptionIds: ["manual"],
    tags: ["热血", "舞台型", "实力派", "饭圈互动型"],
    traits: {
      热血: 6,
      舞台型: 6,
      实力派: 4,
      饭圈互动型: 3
    }
  };

  const [top] = matchIdols(profile, candidateIdols);

  assert.ok(top.confidence > 0);
  assert.ok(top.dimensionScores.length >= 3);
  assert.ok(top.dimensionScores.some((item) => item.label === "舞台"));
});
```

- [ ] **Step 3: Implement dimension diagnostics**

In `lib/matcher.ts`, add:

```ts
const dimensionTagGroups = {
  舞台: ["舞台型", "实力派", "热血"],
  作品: ["演员型", "作品型", "创作型", "综艺型"],
  陪伴: ["陪伴型", "温柔", "饭圈互动型"],
  审美: ["清冷", "甜酷", "明媚", "高级感"],
  参与: ["数据型", "线下应援型", "收藏型", "消费支持型", "安利型"]
} as const;

const buildDimensionScores = (userProfile: UserPreferenceProfile, idol: IdolProfile) =>
  Object.entries(dimensionTagGroups)
    .map(([label, tags]) => {
      const matchedTags = tags.filter(
        (tag) => (userProfile.traits[tag] ?? 0) > 0 && (idol.traits[tag] ?? 0) > 0
      );
      const score = matchedTags.reduce(
        (total, tag) => total + Math.min(userProfile.traits[tag] ?? 0, idol.traits[tag] ?? 0),
        0
      );
      return { label, score, matchedTags };
    })
    .sort((left, right) => right.score - left.score);
```

Update `matchIdols` result mapping:

```ts
const dimensionScores = buildDimensionScores(userProfile, idol);
const confidence = Math.round(
  clamp(score * 0.7 + Math.min(100, matchedTags.length * 8) * 0.3, 0, 100)
);

return {
  idol,
  score,
  confidence,
  matchedTags,
  reasons: buildReasons(userProfile, idol, matchedTags),
  dimensionScores,
  tieBreaker: index
};
```

- [ ] **Step 4: Surface diagnostics in the result UI**

In `components/IdolMatchTest.tsx`, below `YOUR PROFILE`, render the strongest dimensions:

```tsx
<p className="section-kicker" style={{ marginTop: 22 }}>
  MATCH MAP
</p>
<div className="dimension-list">
  {topMatch.dimensionScores.slice(0, 3).map((item) => (
    <div className="dimension-row" key={item.label}>
      <span>{item.label}</span>
      <strong>{item.score}</strong>
    </div>
  ))}
</div>
```

Add CSS in `app/globals.css`:

```css
.dimension-list {
  display: grid;
  gap: 8px;
}

.dimension-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  color: var(--muted);
  font-size: 13px;
}

.dimension-row strong {
  color: var(--ink);
}
```

- [ ] **Step 5: Verify matcher and UI type safety**

Run:

```bash
npm test
npm run typecheck
```

Expected:

```text
matcher tests pass
TypeScript accepts the new MatchResult fields
```

---

### Task 5: Add Shareable Result Summary

**Files:**
- Create: `lib/share.ts`
- Create: `tests/share.test.ts`
- Modify: `components/IdolMatchTest.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write share helper test**

Create `tests/share.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildShareText } from "../lib/share.ts";

describe("share text", () => {
  it("builds a compact shareable idol match result", () => {
    const text = buildShareText({
      modeName: "体验版",
      idolName: "王一博",
      score: 88,
      tags: ["清冷", "舞台型", "实力派"]
    });

    assert.match(text, /爱豆匹配测试/);
    assert.match(text, /体验版/);
    assert.match(text, /王一博/);
    assert.match(text, /88/);
    assert.ok(text.length <= 120);
  });
});
```

- [ ] **Step 2: Implement share helper**

Create `lib/share.ts`:

```ts
export type ShareTextInput = {
  modeName: string;
  idolName: string;
  score: number;
  tags: string[];
};

export const buildShareText = ({ modeName, idolName, score, tags }: ShareTextInput) =>
  `我的爱豆匹配测试${modeName}结果：${idolName}，${score}分。关键词：${tags.slice(0, 3).join(" / ")}。`;
```

- [ ] **Step 3: Add copy-to-clipboard action**

In `components/IdolMatchTest.tsx`, import:

```ts
import { buildShareText } from "@/lib/share";
```

Add state:

```ts
const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
```

Add handler:

```ts
const copyResult = async () => {
  if (!topMatch) return;

  const text = buildShareText({
    modeName: activeMode.name,
    idolName: topMatch.idol.name,
    score: topMatch.score,
    tags: topMatch.matchedTags
  });

  try {
    await navigator.clipboard.writeText(text);
    setShareStatus("copied");
  } catch {
    setShareStatus("failed");
  }
};
```

Render next to `重新测试`:

```tsx
<button className="secondary-button" type="button" onClick={copyResult}>
  复制结果
</button>
{shareStatus !== "idle" && (
  <span className="share-status">
    {shareStatus === "copied" ? "已复制" : "复制失败，可手动截图分享"}
  </span>
)}
```

- [ ] **Step 4: Style the status text**

Add to `app/globals.css`:

```css
.share-status {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
}
```

- [ ] **Step 5: Verify share behavior**

Run:

```bash
npm test
npm run typecheck
```

Expected:

```text
share.test.ts passes
component compiles
```

---

### Task 6: Add Optional AI Explanation Route With Deterministic Fallback

**Files:**
- Create: `lib/explanation.ts`
- Create: `tests/explanation.test.ts`
- Create: `app/api/explain-match/route.ts`
- Modify: `components/IdolMatchTest.tsx`

- [ ] **Step 1: Write deterministic explanation tests**

Create `tests/explanation.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFallbackExplanation } from "../lib/explanation.ts";

describe("match explanation", () => {
  it("creates a safe entertainment-only explanation without an external model", () => {
    const explanation = buildFallbackExplanation({
      idolName: "王一博",
      userTags: ["清冷", "舞台型", "实力派"],
      matchedTags: ["清冷", "舞台型"],
      entryReasons: ["出圈舞台直拍", "代表作品/角色混剪"]
    });

    assert.match(explanation, /娱乐向/);
    assert.match(explanation, /王一博/);
    assert.match(explanation, /清冷/);
    assert.ok(explanation.length <= 220);
  });
});
```

- [ ] **Step 2: Implement fallback explanation**

Create `lib/explanation.ts`:

```ts
export type ExplanationInput = {
  idolName: string;
  userTags: string[];
  matchedTags: string[];
  entryReasons: string[];
};

export const buildFallbackExplanation = ({
  idolName,
  userTags,
  matchedTags,
  entryReasons
}: ExplanationInput) =>
  `娱乐向解读：你选择里的高频偏好是「${userTags.slice(0, 3).join("、")}」，${idolName} 命中了「${matchedTags.slice(0, 3).join("、")}」。建议先从${entryReasons.slice(0, 2).join("和")}开始补档，再判断这份上头感能不能持续。`;
```

- [ ] **Step 3: Add API route**

Create `app/api/explain-match/route.ts`:

```ts
import { NextResponse } from "next/server";

import { buildFallbackExplanation, type ExplanationInput } from "@/lib/explanation";

export async function POST(request: Request) {
  const input = (await request.json()) as Partial<ExplanationInput>;

  if (!input.idolName || !input.userTags || !input.matchedTags || !input.entryReasons) {
    return NextResponse.json({ error: "Invalid explanation payload" }, { status: 400 });
  }

  return NextResponse.json({
    mode: "fallback",
    explanation: buildFallbackExplanation(input as ExplanationInput)
  });
}
```

- [ ] **Step 4: Connect UI without blocking result display**

In `components/IdolMatchTest.tsx`, add state:

```ts
const [aiExplanation, setAiExplanation] = useState("");
const [aiExplanationStatus, setAiExplanationStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
```

Add handler:

```ts
const generateExplanation = async () => {
  if (!topMatch) return;
  setAiExplanationStatus("loading");

  try {
    const response = await fetch("/api/explain-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idolName: topMatch.idol.name,
        userTags: topUserTags,
        matchedTags: topMatch.matchedTags,
        entryReasons: topMatch.idol.entryReasons
      })
    });
    const payload = (await response.json()) as { explanation?: string };
    setAiExplanation(payload.explanation ?? "");
    setAiExplanationStatus(payload.explanation ? "ready" : "failed");
  } catch {
    setAiExplanationStatus("failed");
  }
};
```

Render below reasons:

```tsx
<button className="secondary-button" type="button" onClick={generateExplanation}>
  生成入坑解读
</button>
{aiExplanationStatus === "loading" && <p className="small-muted">生成中...</p>}
{aiExplanationStatus === "ready" && <p className="ai-explanation">{aiExplanation}</p>}
{aiExplanationStatus === "failed" && <p className="small-muted">暂时无法生成，可先查看上方匹配理由。</p>}
```

- [ ] **Step 5: Verify the route and fallback**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

```text
explanation tests pass
Next build includes /api/explain-match
result page still works without any API key
```

---

### Task 7: Prepare Public Launch And Deployment Handoff

**Files:**
- Create: `.github/workflows/verify.yml`
- Modify: `README.md`
- Create: `docs/production-handoff.md`

- [ ] **Step 1: Add GitHub verification workflow**

Create `.github/workflows/verify.yml`:

```yaml
name: Verify

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run verify
```

- [ ] **Step 2: Add production handoff**

Create `docs/production-handoff.md`:

```md
# AI Idol Match Production Handoff

## Local Verification

- `npm ci`
- `npm run verify`
- `npm run dev -- --port 3220`

## Data Source

The candidate profile source lives at `knowledge-base/年轻向全球idol资料清单_120plus.md`.
Run `node scripts/build-idol-profiles.mjs` after editing this file.

## Launch Checklist

- Full verification passes locally.
- GitHub Verify workflow passes on `main`.
- Production page loads the start screen.
- 15-question experience mode reaches a result.
- Result page shows Top 1, Top 3, reasons, tags, and share/copy action.
- If AI explanation is enabled later, fallback mode still works when the key is absent.
```

- [ ] **Step 3: Update README with launch commands**

Add:

~~~md
## Production Verification

```bash
npm ci
npm run verify
```

The app is ready to deploy after the command above passes and `data/idol-profiles.generated.ts` has been regenerated from the current `knowledge-base/` source.
~~~

- [ ] **Step 4: Run final checks**

Run:

```bash
npm run verify
git status --short
```

Expected:

```text
verify passes
only planned source, test, docs, and workflow files are changed
```

---

## Suggested Milestone Order

1. **Today:** Task 1 and Task 2. This restores trust in the deploy directory and removes stale generated-source ambiguity.
2. **Next build session:** Task 3 and Task 4. This makes the product feel smarter without adding external model risk.
3. **Share/retention pass:** Task 5. This helps the app spread and gives users a clean result artifact.
4. **AI label alignment:** Task 6. This adds an AI-style explanation path while preserving deterministic fallback.
5. **Launch pass:** Task 7. This gives the repo CI, handoff docs, and production verification discipline.

## Residual Risks

- If `npm ci` needs the network, run it in an approved network environment before claiming `npm run verify` is fully passing.
- The current matcher is entertainment-only and should keep copy that avoids presenting results as factual compatibility or celebrity endorsement.
- The knowledge base may contain public figures; keep generated summaries short, sourced, and non-sensitive.
- Adding a real LLM provider later should be gated by environment variables, cost limits, and a deterministic fallback.
