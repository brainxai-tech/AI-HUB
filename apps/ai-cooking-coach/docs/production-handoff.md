# AI Cooking Coach Production Handoff

This document captures the current production-ready state of AI Cooking Coach as of 2026-06-05.

## Production

Main URL:

```text
https://ai-cooking-coach-ten.vercel.app
```

Latest known production deployment verified during handoff:

```text
dpl_EyhqM9t2Hn1q383uFvRHB93aP31x
```

Deploy command from the project root:

```powershell
npx vercel@50.28.0 deploy --prod --yes
```

Inspect a deployment:

```powershell
npx vercel@50.28.0 inspect https://ai-cooking-coach-ten.vercel.app
```

Check recent production errors:

```powershell
npx vercel@50.28.0 logs https://ai-cooking-coach-ten.vercel.app --no-follow --level error --since 30m --limit 20
```

## Local Run

Recommended Windows launcher:

```text
start-ai-cooking-coach.cmd
```

The launcher starts the local Node server, opens the browser, and prints the manual URL if Windows cannot open the browser automatically.

Manual command:

```powershell
npm start
```

Local URL:

```text
http://127.0.0.1:4317
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:4317/api/health"
```

Expected:

```json
{"ok":true,"name":"ai-cooking-coach"}
```

## Runtime Architecture

- `server.mjs`: local HTTP server, static files, and API routes.
- `api/health.js`: Vercel health function.
- `api/agent.js`: Vercel agent metadata function.
- `api/plan.js`: Vercel plan generation function.
- `api/adjust-meal.js`: Vercel meal replacement function.
- `api/review-week.js`: Vercel weekly review function.
- `src/domain/prompt-builder.mjs`: profile validation and prompt construction.
- `src/domain/plan-schema.mjs`: DeepSeek JSON extraction and plan normalization.
- `src/domain/ingredient-governance.mjs`: shopping-list nutrition RAG grounding.
- `src/server/deepseek-client.mjs`: DeepSeek request/response handling.
- `src/server/plan-response.mjs`: plan route orchestration.
- `src/server/meal-adjustment-response.mjs`: live and fallback replacement orchestration.
- `src/server/week-review-response.mjs`: live and fallback weekly review orchestration.
- `public/execution-state.mjs`: local execution-state model.
- `public/weekly-memory.mjs`: local plan-history and weekly-review helper model.
- `public/app.js`: frontend interactions and rendering.

## RAG Assets

Ingredient nutrition RAG:

```text
public/data/ingredient-nutrition-rag.json
```

Menu recipe RAG:

```text
public/data/menu-library-rag.json
```

Current menu RAG source:

```text
C:\path\to\500道饭店常做菜品_配料热量制作方式_markdown.docx
```

Current menu RAG facts:

```text
source: 500道饭店常做菜品_配料热量制作方式_markdown.docx
itemCount: 500
first recipe: 麻婆豆腐
```

Rebuild menu RAG from DOCX:

```powershell
$source = "C:\path\to\500道饭店常做菜品_配料热量制作方式_markdown.docx"
python scripts\build_menu_library_rag_from_docx.py $source public\data\menu-library-rag.json
```

If the shell cannot resolve `python`, use the bundled Codex Python path or any Python 3.11+ installation. The script uses only the Python standard library.

## API Summary

`GET /api/health`

Returns app health.

`GET /api/agent`

Returns the current cooking-agent metadata and system prompt.

`POST /api/plan`

Accepts a DeepSeek API Key, model, and profile. Returns a normalized weekly plan with nutrition-governed shopping data.

`POST /api/adjust-meal`

Accepts an API Key, model, plan, meal key, reason, and constraints. Calls DeepSeek for a structured replacement when a key is present. Returns a local rule-based fallback without a key.

`POST /api/review-week`

Accepts an API Key, model, plan, execution state, and user feedback. Calls DeepSeek for next-week improvement suggestions when a key is present. Returns a local rule-based weekly review without a key.

## Verification Checklist

Run all tests:

```powershell
npm test
```

Smoke-check production:

```powershell
$base = "https://ai-cooking-coach-ten.vercel.app"
$homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $base
$health = Invoke-RestMethod -Uri "$base/api/health"
$rag = Invoke-RestMethod -Uri "$base/data/menu-library-rag.json"
$review = Invoke-RestMethod -Method POST -ContentType "application/json" -Uri "$base/api/review-week" -Body '{"plan":{"title":"Smoke plan","days":[{"day":"Day 1","meals":[{"name":"Smoke meal"}]}],"shoppingList":[],"batchPrep":[]},"executionState":{"planId":"smoke","shopping":[[true]],"prep":[true],"meals":{"day0-meal0":"cooked"},"replacements":[]},"feedback":"smoke"}'
[pscustomobject]@{
  HomeStatus = $homeResponse.StatusCode
  HasCommandCenter = $homeResponse.Content.Contains("commandCenterScreen")
  HealthOk = $health.ok
  RagSource = $rag.source
  RagItemCount = $rag.itemCount
  FirstRecipe = $rag.items[0].name
  ReviewMode = $review.mode
} | ConvertTo-Json -Compress
```

Expected:

```json
{"HomeStatus":200,"HasCommandCenter":true,"HealthOk":true,"RagSource":"500道饭店常做菜品_配料热量制作方式_markdown.docx","RagItemCount":500,"FirstRecipe":"麻婆豆腐","ReviewMode":"fallback"}
```

Check production errors:

```powershell
npx vercel@50.28.0 logs https://ai-cooking-coach-ten.vercel.app --no-follow --level error --since 30m --limit 20
```

Expected:

```text
No logs found
```

## Known Limitations

- No user accounts or cloud sync.
- Execution state is saved only in browser `localStorage`.
- Plan history, weekly feedback, and review context are saved only in browser `localStorage`.
- No voice assistant, camera recognition, multiplayer collaboration, or calendar push.
- Nutrition and calories are estimates, not medical advice.
- The menu RAG does not include USDA FDC match rows.
- Replacements affect the execution view and log only; they do not mutate the original generated plan.

## Safe Next Steps

- Add plan history/export if users need multi-week records.
- Add optional cloud sync only after deciding account/auth requirements.
- Add a dedicated RAG metadata panel if source transparency becomes important.
- Add browser-driven visual regression checks if the UI starts changing frequently.
