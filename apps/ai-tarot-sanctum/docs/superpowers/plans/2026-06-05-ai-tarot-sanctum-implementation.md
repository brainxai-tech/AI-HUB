# AI Tarot Sanctum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first three-card tarot MVP for relationship and career/wealth readings, with local spread generation, compatible AI report generation, local history, tests, and a local launcher.

**Architecture:** The app is a standalone Next.js + TypeScript project. The domain layer owns tarot deck data, reading generation, the deterministic local interpretation engine, and defensive local history helpers. The UI layer owns the sanctum reading flow, calls the reading engine on the client, and sends the structured reading to the local compatible API route for the user-facing report.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, `node:test`, `localStorage`.

---

## Coordination Model

This project is being executed as a product-studio style multi-agent collaboration:

- `product_strategist`: acceptance criteria and MVP boundary.
- `ux_architect`: screen states, accessibility, responsive behavior, reduced motion.
- `backend_builder`: domain data, engines, history helpers, engine tests.
- `frontend_builder`: Next app UI, components, CSS, local history interactions.
- `qa_reviewer`: automated/manual verification matrix.
- `release_integrator`: final scripts, local launcher, verification, run handoff.

The exact `product-studio-orchestrator` tool is unavailable in this environment, so orchestration uses `multi_agent_v1` with these named role prompts.

## File Structure

Create or modify:

```text
01-Projects/ai-tarot-sanctum/
  .gitignore
  README.md
  eslint.config.mjs
  next-env.d.ts
  next.config.ts
  package.json
  postcss.config.mjs
  start-ai-tarot-sanctum.cmd
  tsconfig.json
  app/
    api/
      compatible-reading/
        route.ts
      deepseek-reading/
        route.ts  # legacy alias
    globals.css
    layout.tsx
    page.tsx
  components/
    TarotSanctum.tsx
  data/
    tarot-deck.ts
  lib/
    history.ts
    interpretation-engine.ts
    reading-engine.ts
    types.ts
  scripts/
    start-dev-server.mjs
  tests/
    history.test.ts
    interpretation-engine.test.ts
    reading-engine.test.ts
```

## Task 1: Scaffold Local Next.js Project

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Create package scripts**

Use the same local-project command shape as the existing workspace apps:

```json
{
  "name": "ai-tarot-sanctum",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "dev:detached": "node scripts/start-dev-server.mjs 3230",
    "build": "next build",
    "start": "next start",
    "test": "node --test tests/*.test.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "verify": "npm run test && npm run lint && npm run typecheck && npm run build"
  },
  "dependencies": {
    "next": "^16.2.7",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@types/node": "^20.19.41",
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
    "eslint": "^9.39.4",
    "eslint-config-next": "^16.2.7",
    "tailwindcss": "^4.3.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Add minimal Next app shell**

`app/page.tsx` should render the client component:

```tsx
import { TarotSanctum } from "@/components/TarotSanctum";

export default function Home() {
  return <TarotSanctum />;
}
```

- [ ] **Step 3: Verify scaffold**

Run: `npm install` if `node_modules` is missing, then `npm run typecheck`.

Expected: TypeScript can resolve the app files after component/domain files are added.

Checkpoint: If this directory is not a git repository, skip commit and report "git unavailable".

## Task 2: Build Domain Layer With Tests

**Files:**
- Create: `lib/types.ts`
- Create: `data/tarot-deck.ts`
- Create: `lib/reading-engine.ts`
- Create: `lib/interpretation-engine.ts`
- Create: `lib/history.ts`
- Create: `tests/reading-engine.test.ts`
- Create: `tests/interpretation-engine.test.ts`
- Create: `tests/history.test.ts`

- [ ] **Step 1: Define domain types**

Required public types:

```ts
export type TarotTheme = "relationship" | "career";
export type Orientation = "upright" | "reversed";
export type Arcana = "major" | "minor";
export type Suit = "wands" | "cups" | "swords" | "pentacles";
export type SpreadPositionId = "root" | "present" | "trend";

export type TarotCard = {
  id: string;
  arcana: Arcana;
  suit?: Suit;
  name: string;
  keywords: string[];
  upright: string;
  reversed: string;
  relationshipMeaning: string;
  careerMeaning: string;
  risk: string;
  advice: string;
};

export type DrawnCard = {
  card: TarotCard;
  orientation: Orientation;
  position: SpreadPositionId;
};

export type ReadingInterpretation = {
  summary: string;
  cardReadings: Array<{ position: SpreadPositionId; title: string; text: string }>;
  combination: string;
  risk: string;
  actions: { nextAction: string; avoid: string; observation: string };
  disclaimer: string;
};

export type SavedReading = {
  id: string;
  createdAt: string;
  theme: TarotTheme;
  question: string;
  cards: DrawnCard[];
  interpretation: ReadingInterpretation;
};
```

- [ ] **Step 2: Write reading-engine tests first**

Tests must verify:

```ts
assert.equal(reading.cards.length, 3);
assert.equal(new Set(reading.cards.map((item) => item.card.id)).size, 3);
assert.deepEqual(reading.cards.map((item) => item.position), ["root", "present", "trend"]);
assert.ok(reading.cards.every((item) => item.orientation === "upright" || item.orientation === "reversed"));
```

- [ ] **Step 3: Implement reading engine**

Public functions:

```ts
export function drawThreeCardReading(options?: { rng?: () => number; deck?: TarotCard[] }): DrawnCard[];
export function createSavedReading(input: {
  theme: TarotTheme;
  question: string;
  cards: DrawnCard[];
  interpretation: ReadingInterpretation;
  now?: () => Date;
  idFactory?: () => string;
}): SavedReading;
```

- [ ] **Step 4: Implement full deck data**

`tarotDeck` must contain 78 cards. Every card must include all fields from `TarotCard`.

- [ ] **Step 5: Write interpretation tests first**

Tests must verify required sections for both themes, reversed count influence, and major arcana influence.

- [ ] **Step 6: Implement interpretation engine**

Public function:

```ts
export function generateInterpretation(input: {
  theme: TarotTheme;
  question: string;
  cards: DrawnCard[];
}): ReadingInterpretation;
```

The output must include per-card readings, combination reading, risk, next action, avoid, observation, and disclaimer.

- [ ] **Step 7: Write history tests first**

Tests must verify valid records survive, malformed records are ignored, and non-array JSON returns an empty list.

- [ ] **Step 8: Implement history helpers**

Public functions:

```ts
export const TAROT_HISTORY_KEY = "ai-tarot-sanctum-history";
export function parseReadingHistory(raw: string | null): SavedReading[];
export function serializeReadingHistory(readings: SavedReading[]): string;
export function loadReadingHistory(storage?: Storage): SavedReading[];
export function saveReadingToHistory(reading: SavedReading, storage?: Storage): { ok: boolean; readings: SavedReading[] };
export function clearReadingHistory(storage?: Storage): boolean;
```

- [ ] **Step 9: Run domain tests**

Run: `npm run test`.

Expected: all domain tests pass.

## Task 3: Build Frontend Experience

**Files:**
- Create/modify: `components/TarotSanctum.tsx`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement UI state machine**

Required states:

```ts
type FlowState =
  | "idle"
  | "validation-error"
  | "shuffling"
  | "ready-to-draw"
  | "revealing"
  | "result"
  | "saved";
```

- [ ] **Step 2: Implement first-screen tool**

The first viewport must include brand signal, theme selector, question altar, suggested prompts, deck ritual area, and three reserved card slots.

- [ ] **Step 3: Implement ritual and reveal behavior**

Default motion: short shuffle, then reveal three card positions. Reduced motion: skip long animation and reveal with minimal fade/status update.

- [ ] **Step 4: Implement result panel**

Render summary, per-card readings, combination, risk, action notes, and disclaimer in a readable parchment panel.

- [ ] **Step 5: Implement local history UI**

Use `loadReadingHistory`, `saveReadingToHistory`, and `clearReadingHistory`. Current reading must still work if storage fails.

- [ ] **Step 6: Implement responsive and accessibility CSS**

CSS must include stable card dimensions, visible focus states, mobile 375px layout, desktop two-zone layout, and `prefers-reduced-motion` handling.

- [ ] **Step 7: Run frontend checks**

Run: `npm run lint` and `npm run typecheck`.

Expected: no lint/type errors.

## Task 4: Release Integration

**Files:**
- Create: `scripts/start-dev-server.mjs`
- Create: `start-ai-tarot-sanctum.cmd`
- Create/modify: `README.md`
- Optionally create: `dev-server.pid`, `dev-server.port`, `dev-server.out.log`, `dev-server.err.log` at runtime only.

- [ ] **Step 1: Add detached dev server script**

Implement the existing workspace pattern: find an open port starting at 3230, spawn Next dev hidden/detached, write pid and port files.

- [ ] **Step 2: Add Windows launcher**

`start-ai-tarot-sanctum.cmd` should run `npm install` if needed, start the detached dev server, read `dev-server.port`, and open the local URL.

- [ ] **Step 3: Add README**

README must explain local-first behavior, compatible API Key requirement, localStorage behavior, run commands, and verify command.

- [ ] **Step 4: Full verification**

Run: `npm run verify`.

Expected: tests, lint, typecheck, and build all pass.

- [ ] **Step 5: Browser verification**

Start dev server and verify:

- Relationship reading from empty state to result.
- Career reading from empty state to result.
- Empty question validation.
- Suggested prompt selection.
- Save, reload, and clear history.
- Mobile 375px screenshot has no overlap.
- Desktop screenshot has readable layout.

## Acceptance Rubric

The release is complete only when:

- `npm run verify` passes.
- The local app starts and provides a URL.
- A real reading can be completed in browser.
- History works locally and handles malformed data.
- A user-provided compatible API Key is required for the current report-generation flow.
- No user account, remote database, cloud sync, or non-tarot chat backend is required.
- UI respects the approved dark/gold/parchment direction.
- Reduced motion remains understandable.
