# AI Cooking Coach Production Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the AI Cooking Coach production handoff by updating documentation and verifying the current deployed MVP.

**Architecture:** No product behavior changes are planned. The work updates project documentation around the existing Node/vanilla JS app, Vercel API handlers, local Windows startup scripts, and static RAG build scripts.

**Tech Stack:** Node.js ES modules, vanilla HTML/CSS/JavaScript, native `node:test`, PowerShell startup scripts, Python RAG build scripts, Vercel CLI.

---

## File Structure

- `README.md`: primary quick-start and product overview.
- `docs/production-handoff.md`: operational handoff for local run, deployment, RAG rebuild, routes, verification, and limitations.
- `docs/superpowers/specs/2026-06-05-ai-cooking-coach-production-handoff-design.md`: approved design for this handoff.
- `docs/superpowers/plans/2026-06-05-ai-cooking-coach-production-handoff.md`: this implementation plan.

## Task 1: Refresh README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the outdated first-version README with a current product overview**

Use content with these sections:

```markdown
# AI Cooking Coach

AI Cooking Coach is a Chinese local-first meal-prep assistant. It uses the user's DeepSeek API Key to generate a 7-day healthy cooking plan, grounds shopping ingredients with local nutrition RAG data, exposes a 500-recipe menu RAG, and turns the generated plan into a Kitchen Command Center for weekly execution.
```

- [ ] **Step 2: Add local run and production URL instructions**

Include a `Quick Start` section that shows `start-ai-cooking-coach.cmd`, `npm start`, `http://127.0.0.1:4317`, and `https://ai-cooking-coach-ten.vercel.app`.

- [ ] **Step 3: Add feature, RAG, API key, verification, and limitation sections**

Include the current features, the DOCX menu RAG source, `npm test`, and non-goals: no accounts, no cloud sync, no medical advice.

## Task 2: Add Production Handoff

**Files:**
- Create: `docs/production-handoff.md`

- [ ] **Step 1: Document operating modes**

Cover local `.cmd`, `npm start`, and Vercel production.

- [ ] **Step 2: Document RAG assets**

Mention:

```text
public/data/ingredient-nutrition-rag.json
public/data/menu-library-rag.json
scripts/build_menu_library_rag_from_docx.py
```

- [ ] **Step 3: Document rebuild command for menu RAG**

Use:

```powershell
$source = "C:\path\to\500道饭店常做菜品_配料热量制作方式_markdown.docx"
python scripts\build_menu_library_rag_from_docx.py $source public\data\menu-library-rag.json
```

- [ ] **Step 4: Document verification checklist**

Include `npm test`, local `/api/health`, production `/api/health`, and production menu RAG item-count checks.

## Task 3: Verify

**Files:**
- No code files.

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Smoke-check production**

Run:

```powershell
$base = "https://ai-cooking-coach-ten.vercel.app"
Invoke-WebRequest -UseBasicParsing -Uri $base
Invoke-RestMethod -Uri "$base/api/health"
Invoke-RestMethod -Uri "$base/data/menu-library-rag.json"
```

Expected: homepage status 200, health `ok: true`, menu RAG item count 500.

- [ ] **Step 3: Report status**

Report changed files, verification evidence, production URL, and remaining limitations.
