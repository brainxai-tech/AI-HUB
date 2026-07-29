# Weekly Memory Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local plan history, weekly review, Markdown recap export, and AI/local next-week suggestions to AI Cooking Coach.

**Architecture:** Keep the app local-first and dependency-light. Add a focused browser-shareable state module, one server response module, one Vercel handler, and a new frontend screen that reuses existing execution state and plan rendering.

**Tech Stack:** Node.js ES modules, vanilla HTML/CSS/JavaScript, browser `localStorage`, native `fetch`, native `node:test`, Vercel serverless handlers.

---

## File Structure

- Create `public/weekly-memory.mjs`: plan-history and weekly-review pure helpers.
- Create `src/server/week-review-response.mjs`: DeepSeek/live and local fallback weekly review response.
- Create `api/review-week.js`: Vercel handler for weekly review.
- Modify `server.mjs`: add local `/api/review-week`.
- Modify `public/index.html`: add sidebar item and `historyReviewScreen`.
- Modify `public/app.js`: wire history storage, review UI, review API, Markdown export.
- Modify `public/styles.css`: responsive history/review layouts.
- Modify `tests/execution-state.test.mjs`: add weekly-memory helper coverage or create a focused test file.
- Modify `tests/server.test.mjs`: local review route coverage.
- Modify `tests/vercel-api.test.mjs`: Vercel review handler coverage.
- Modify `tests/static-assets.test.mjs`: static UI references.
- Modify `README.md` and `docs/production-handoff.md`: document Weekly Memory Loop.

## Task 1: Test State Helpers

- [ ] Add tests for `buildPlanHistoryEntry`, `mergePlanHistory`, `deletePlanHistoryEntry`, `summarizeWeeklyReview`, and `buildWeeklyReviewMarkdown`.
- [ ] Run helper tests and confirm they fail because `public/weekly-memory.mjs` does not exist.
- [ ] Implement `public/weekly-memory.mjs`.
- [ ] Run helper tests and confirm they pass.

## Task 2: Test Weekly Review API

- [ ] Add local server tests for `POST /api/review-week` fallback and DeepSeek live mode.
- [ ] Add Vercel handler tests for fallback and CORS preflight.
- [ ] Run focused tests and confirm they fail because handlers do not exist.
- [ ] Implement `src/server/week-review-response.mjs`, `api/review-week.js`, and `server.mjs` routing.
- [ ] Run focused tests and confirm they pass.

## Task 3: Test Static UI Contract

- [ ] Extend static asset tests for the `历史复盘` sidebar item, `historyReviewScreen`, history list, feedback textarea, AI review button, and export button.
- [ ] Run static tests and confirm they fail before UI changes.
- [ ] Modify `public/index.html`, `public/app.js`, and `public/styles.css`.
- [ ] Run static tests and confirm they pass.

## Task 4: Integrate Frontend Behavior

- [ ] Save or update a history entry after plan generation and every execution-state mutation.
- [ ] Render history entries with open, review, and delete actions.
- [ ] Reopen a plan into planner outputs and execution center.
- [ ] Render weekly review summary from current plan and selected history entry.
- [ ] Call `/api/review-week` with API Key, model, plan, execution state, and feedback.
- [ ] Store latest feedback/suggestion in local component state.
- [ ] Export Markdown recap with plan summary, execution metrics, feedback, and suggestion.

## Task 5: Documentation and Verification

- [ ] Update `README.md` and `docs/production-handoff.md` with Weekly Memory Loop.
- [ ] Run `npm test`.
- [ ] Start or use local server and smoke-check `http://127.0.0.1:4317/api/health`.
- [ ] Deploy production if requested after implementation.
- [ ] Smoke-check production homepage, `/api/health`, `/api/review-week` fallback, and menu RAG.
