# AI HUB Game Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all five AI HUB games installable, buildable, routable, and browser-testable from a fresh GitHub clone while preserving each game's dedicated UI and simulation boundary.

**Architecture:** Keep the existing 29 non-game tools in `manifest.projects` and introduce `manifest.games` for the five games. The three Next.js board games run as dedicated local services behind the Hub proxy, Fury Flock builds as a static Phaser/Vite game served by the Hub, and Dice Estate remains a Hub-hosted static game. Model-aware games call the Hub gateway with provisioned project credentials; Pikafish is downloaded on demand from a pinned upstream release and never committed.

**Tech Stack:** Node.js 24, Next.js, React, Phaser 3, Vite, Hub OpenAI-compatible routing, Node test runner, Vitest, Playwright, PowerShell, Nginx.

---

### Task 1: Define the game manifest contract

**Files:**
- Modify: `deploy/project-manifest.json`
- Modify: `tests/monorepo-manifest.test.mjs`
- Modify: `tests/local-project-proxy.test.mjs`

- [ ] **Step 1: Write failing manifest assertions**

Assert that `manifest.projects` still contains 29 entries, `manifest.games` contains five unique game entries, no `excludedGames` field remains, and every game has a safe route, source, stack, and API mode.

- [ ] **Step 2: Verify the new assertions fail**

Run: `node --test tests/monorepo-manifest.test.mjs tests/local-project-proxy.test.mjs`

Expected: FAIL because `manifest.games` does not exist and game routes are not proxied.

- [ ] **Step 3: Add the five game descriptors**

Use these stable routes and sources:

```json
[
  { "id": "ai-xiangqi-duel", "route": "/xiangqi/", "source": "games/ai-xiangqi-duel", "stack": "next", "api": "dedicated", "port": 4211 },
  { "id": "ai-chess-duel", "route": "/chess/", "source": "games/ai-chess-duel", "stack": "next", "api": "dedicated", "port": 4212 },
  { "id": "ai-go-duel", "route": "/go/", "source": "games/ai-go-duel", "stack": "next", "api": "dedicated", "port": 4213 },
  { "id": "fury-flock", "route": "/fury-flock/", "source": "games/fury-flock", "stack": "vite-static", "api": "none" },
  { "id": "dice-estate-duel", "route": "/hub/dice-estate/", "source": "public/dice-estate", "stack": "hub-static", "api": "hub" }
]
```

- [ ] **Step 4: Make proxy tests pass for the three dedicated games**

Run: `node --test tests/monorepo-manifest.test.mjs tests/local-project-proxy.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the manifest foundation**

Run: `git commit -m "feat: define unified game manifest"`

### Task 2: Recover the four external game source trees

**Files:**
- Create: `games/ai-xiangqi-duel/**`
- Create: `games/ai-chess-duel/**`
- Create: `games/ai-go-duel/**`
- Create: `games/fury-flock/**`
- Modify: `.gitignore`

- [ ] **Step 1: Copy only reproducible source inputs**

Copy package manifests, lockfiles, application source, tests, and shipped public assets. Exclude `node_modules`, `.next`, `dist`, TypeScript build info, Playwright results, traces, local logs, generated art-source folders, and local environment files.

- [ ] **Step 2: Preserve game runtime boundaries**

Keep Xiangqi/Chess/Go rule engines in `src/lib`, UI in React components, Fury simulation in `src/game/simulation`, Phaser rendering in `src/phaser`, DOM HUD in `src/ui`, and serializable saves in browser storage.

- [ ] **Step 3: Install and verify each recovered package**

Run in every package: `npm ci && npm test && npm run check && npm run build`.

Expected: all four packages install, test, type-check, and build without relying on prior worktree artifacts.

- [ ] **Step 4: Commit recovered sources**

Run: `git commit -m "feat: recover AI HUB game sources"`

### Task 3: Extend workspace automation to games

**Files:**
- Modify: `scripts/workspace-tasks.mjs`
- Modify: `scripts/security-scan.mjs`
- Modify: `tests/workspace-automation.test.mjs`
- Modify: `.github/workflows/fresh-clone.yml`

- [ ] **Step 1: Add failing automation assertions**

Require workspace installation and verification to enumerate package-bearing entries from both `manifest.projects` and `manifest.games`; require security scanning to cover all tracked game files without treating games as exclusions.

- [ ] **Step 2: Verify the assertions fail**

Run: `node --test tests/workspace-automation.test.mjs`.

Expected: FAIL on `manifest.projects`-only automation and `excludedGames` scanning.

- [ ] **Step 3: Implement a single package-entry iterator**

Include game entries whose source contains `package.json`; skip `hub-static` Dice Estate during npm operations while still scanning its tracked files.

- [ ] **Step 4: Verify automation**

Run: `node --test tests/workspace-automation.test.mjs && npm run workspace:install && npm run workspace:verify`.

Expected: PASS for 29 tools plus four package-bearing games.

- [ ] **Step 5: Commit automation**

Run: `git commit -m "build: include games in workspace automation"`.

### Task 4: Serve every game from the one-click local suite

**Files:**
- Modify: `local-project-proxy.mjs`
- Modify: `scripts/local-suite.mjs`
- Modify: `server.mjs`
- Modify: `start-local-suite.ps1`
- Modify: `stop-local-suite.ps1`
- Modify: `tests/workspace-automation.test.mjs`
- Modify: `tests/local-project-proxy.test.mjs`

- [ ] **Step 1: Add failing route and process tests**

Require `/xiangqi/`, `/chess/`, and `/go/` to target ports 4211-4213; require `/fury-flock/` to resolve from `games/fury-flock/dist`; require `/hub/dice-estate/` to remain Hub static.

- [ ] **Step 2: Build dedicated Next.js games with base paths**

Set `NEXT_PUBLIC_BASE_PATH` to each manifest route without the trailing slash, start the three games on their manifest ports, and pass their scoped Hub token plus Hub model endpoints.

- [ ] **Step 3: Add safe Fury static serving**

Map only `/fury-flock/` to the built Fury directory, normalize paths, reject traversal, return correct MIME types, and fall back to its `index.html` for client navigation.

- [ ] **Step 4: Verify one-click lifecycle**

Run: `npm run start:suite`, request all five game routes, then stop through the existing sentinel/PowerShell flow.

Expected: all routes return HTML, all child processes stop, and no credentials appear in output.

- [ ] **Step 5: Commit local runtime support**

Run: `git commit -m "feat: run five games in local suite"`.

### Task 5: Unify model-aware game credentials

**Files:**
- Modify: `games/ai-xiangqi-duel/src/lib/deepseek.ts`
- Modify: `games/ai-chess-duel/src/lib/hub-ai.ts`
- Modify: `games/ai-go-duel/src/lib/hub-ai.ts`
- Modify: `public/dice-estate/app.js`
- Modify: `server.mjs`
- Modify: `tests/provision-local-runtime.test.mjs`
- Modify: `tests/smoke.test.mjs`

- [ ] **Step 1: Add failing credential and Dice decision tests**

Assert that local provisioning creates credentials for the four model-aware games, game servers receive only their own scoped token, and Dice Estate calls a Hub-owned authenticated decision handler with a bounded JSON payload.

- [ ] **Step 2: Reuse the Hub GPT model catalog**

Keep game-specific DOM controls but populate only models returned by the Hub project-scoped model configuration; remove legacy vendor API-key storage and browser password fields.

- [ ] **Step 3: Implement Dice Estate's Hub decision endpoint**

Validate the request, translate it into a bounded chat completion, parse only a legal decision shape, and fall back to the deterministic local agent when routing is unavailable.

- [ ] **Step 4: Verify model boundaries**

Run the three game Vitest suites and Hub tests for authorization, provisioning, model UI, and Dice smoke coverage.

Expected: model traffic reaches Hub; no provider key or shared token reaches a game browser.

- [ ] **Step 5: Commit credential integration**

Run: `git commit -m "feat: route game AI through Hub credentials"`.

### Task 6: Provision Pikafish safely

**Files:**
- Create: `scripts/pikafish-release.json`
- Create: `scripts/provision-pikafish.mjs`
- Create: `tests/pikafish-provision.test.mjs`
- Modify: `scripts/local-suite.mjs`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Add failing downloader tests with a local fixture server**

Cover platform selection, pinned URL use, SHA-256 rejection, archive extraction, executable discovery, cache reuse, atomic replacement, and clear unsupported-platform errors without contacting GitHub during tests.

- [ ] **Step 2: Pin an official upstream release**

Record the upstream project, release tag, asset filename, expected SHA-256, executable relative path, and GPL-3.0 license URL in `scripts/pikafish-release.json`.

- [ ] **Step 3: Implement on-demand provisioning**

Download into a temporary directory under `.runtime/engines`, verify SHA-256 before extraction, atomically activate the versioned engine directory, and return `PIKAFISH_PATH` to the suite supervisor. Never commit the archive or executable.

- [ ] **Step 4: Verify cache and tamper behavior**

Run: `node --test tests/pikafish-provision.test.mjs`.

Expected: valid fixture provisions once and reuses cache; modified bytes fail closed.

- [ ] **Step 5: Commit provisioning**

Run: `git commit -m "feat: provision pinned Pikafish engine"`.

### Task 7: Add game browser E2E and deployment routes

**Files:**
- Modify: `scripts/local-suite-e2e.mjs`
- Modify: `deploy/nginx/idol-match-test.conf`
- Modify: `tests/deployment.test.mjs`
- Modify: `tests/smoke.test.mjs`
- Modify: `README.md`
- Modify: `docs/MONOREPO.md`

- [ ] **Step 1: Add E2E assertions for every game**

Load the five routes, assert each unique game landmark, exercise one legal move or launch action, verify no API-key password input exists, and check game saves/progression stay in browser storage rather than renderer objects.

- [ ] **Step 2: Exercise Hub model routing in one board game and Dice Estate**

Use the existing mock upstream, trigger a coach/decision request, and assert the selected GPT model and scoped project identity arrive at the Hub gateway.

- [ ] **Step 3: Update production Nginx routing**

Keep `/xiangqi/`, `/chess/`, and `/go/` dedicated upstream routes, serve Fury's versioned static release, preserve `/hub/dice-estate/`, and apply no-cache HTML plus immutable fingerprinted assets where applicable.

- [ ] **Step 4: Document the fresh-clone path**

Document `npm run workspace:install`, `npm run workspace:build`, `npm run start:suite`, automatic Pikafish download, supported platforms, local URLs, and how to stop the suite.

- [ ] **Step 5: Commit E2E and deployment changes**

Run: `git commit -m "test: cover unified game experience"`.

### Task 8: Clean-clone release verification

**Files:**
- Verify only; modify release notes only if verification reveals a documented limitation.

- [ ] **Step 1: Run repository verification**

Run: `npm test && npm run workspace:verify && npm run security:scan && npm run e2e`.

Expected: Hub tests, all package tests/checks/builds, security scan, and browser E2E pass.

- [ ] **Step 2: Verify from a clean clone of the branch**

Clone the branch into a new temporary directory, run install/build/verify/E2E, and confirm `git status --short` remains empty after generated files are cleaned or ignored.

- [ ] **Step 3: Review the diff and push the branch**

Run: `git diff origin/main...HEAD --check`, inspect the complete diff, push `codex/unify-game-routing`, and open a PR against `main`.

- [ ] **Step 4: Verify CI and merged main**

Wait for both PR checks, merge only when green, then perform a final fresh clone of GitHub `main` and repeat the verification suite.
