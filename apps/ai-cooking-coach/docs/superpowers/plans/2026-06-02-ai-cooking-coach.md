# AI Cooking Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, runnable Chinese AI cooking coach that uses the user's DeepSeek API Key to generate healthy weight-loss family meal prep plans.

**Architecture:** A dependency-light Node HTTP server serves a static frontend and proxies plan generation to DeepSeek. Domain modules build prompts, validate profile input, parse model JSON, and normalize meal plans so the UI can render consistent output.

**Tech Stack:** Node.js built-in HTTP server, ES modules, native `fetch`, native `node:test`, vanilla HTML/CSS/JavaScript.

---

## File Structure

- `package.json`: scripts for `start`, `dev`, and `test`.
- `README.md`: local usage, API key handling, and limitations.
- `server.mjs`: HTTP server and static assets.
- `src/domain/prompt-builder.mjs`: profile validation and prompt generation.
- `src/domain/plan-schema.mjs`: plan normalization and validation.
- `src/server/deepseek-client.mjs`: DeepSeek request construction and parsing.
- `src/server/demo-plan.mjs`: deterministic demo plan when no API key is supplied.
- `public/index.html`: app shell and form.
- `public/styles.css`: production-grade responsive UI.
- `public/app.js`: localStorage key handling, form submission, rendering, copy/export.
- `tests/prompt-builder.test.mjs`: TDD coverage for prompt behavior.
- `tests/plan-schema.test.mjs`: TDD coverage for normalization behavior.
- `tests/deepseek-client.test.mjs`: TDD coverage for API request and response parsing.
- `tests/server.test.mjs`: TDD coverage for `/api/health` and `/api/plan`.

## Tasks

### Task 1: Project Skeleton and Failing Tests

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `tests/prompt-builder.test.mjs`
- Create: `tests/plan-schema.test.mjs`
- Create: `tests/deepseek-client.test.mjs`
- Create: `tests/server.test.mjs`

- [ ] **Step 1: Create package metadata and tests only**
- [ ] **Step 2: Run `npm test` and verify tests fail because implementation modules are missing**

### Task 2: Domain Modules

**Files:**
- Create: `src/domain/prompt-builder.mjs`
- Create: `src/domain/plan-schema.mjs`
- Create: `src/server/deepseek-client.mjs`
- Create: `src/server/demo-plan.mjs`

- [ ] **Step 1: Implement profile validation and prompt generation**
- [ ] **Step 2: Implement plan JSON extraction and normalization**
- [ ] **Step 3: Implement DeepSeek request construction with injected fetch**
- [ ] **Step 4: Run unit tests and verify pass**

### Task 3: Local Server

**Files:**
- Create: `server.mjs`
- Modify: `tests/server.test.mjs`

- [ ] **Step 1: Implement static serving and JSON API routes**
- [ ] **Step 2: Run server tests and verify pass**

### Task 4: Frontend Workspace

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `public/assets/meal-prep-board.svg`

- [ ] **Step 1: Build the first-screen workspace form**
- [ ] **Step 2: Implement API key localStorage behavior**
- [ ] **Step 3: Implement plan rendering, shopping list, timeline, and Markdown copy**
- [ ] **Step 4: Run all tests**

### Task 5: Run and Verify

**Files:**
- Create: `start-ai-cooking-coach.cmd`

- [ ] **Step 1: Start the app on a local port**
- [ ] **Step 2: Verify health endpoint**
- [ ] **Step 3: Verify demo generation without API key**
- [ ] **Step 4: Report URL, commands, and residual limitations**
