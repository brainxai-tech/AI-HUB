# Weekly Memory Loop Design

## Product Goal

Weekly Memory Loop turns AI Cooking Coach from a single-week generator into a repeatable weekly cooking system. Users should be able to keep local plan history, reopen previous plans, review execution results, record subjective feedback, export a Markdown recap, and ask DeepSeek for next-week improvement suggestions.

## Scope

In scope:

- Save a local plan-history entry after each generated plan.
- Show a History and Review workspace in the existing app shell.
- Reopen a saved plan and restore its execution state.
- Delete saved plans from local history.
- Summarize shopping, batch prep, meal completion, skipped meals, and replacements.
- Let users write subjective weekly feedback.
- Export a Markdown weekly recap.
- Add `/api/review-week` locally and on Vercel.
- Return a local rule-based review when no API Key is supplied.
- Add focused `node:test` coverage for state helpers, API fallback/live path, and static UI references.

Out of scope:

- Accounts, cloud sync, shared households, calendar push, notifications, and charts.
- Changing the original planning prompt.
- Mutating old generated plans when replacements happen. Replacements remain execution-layer records.

## UX Design

Add a sidebar item named `历史复盘`. The screen has two main regions:

1. **Plan History:** Compact list of saved plans with title, saved time, completion rate, meal completion, replacement count, and actions: open, review, delete.
2. **Weekly Review:** Summary cards, feedback textarea, AI suggestion button, local fallback result, and Markdown export.

The screen should work even before the user has generated a plan. Empty states explain that history is browser-local and starts after generating a plan.

## Data Model

Create `public/weekly-memory.mjs` with testable helpers:

- `buildPlanHistoryEntry(plan, executionState, savedAt)`
- `mergePlanHistory(history, entry, limit)`
- `deletePlanHistoryEntry(history, planId)`
- `summarizeWeeklyReview(plan, executionState)`
- `buildWeeklyReviewMarkdown(plan, executionState, feedback, suggestion)`
- `createPlanHistoryStorageKey()`

History entry shape:

```js
{
  planId,
  title,
  savedAt,
  dayCount,
  mealCount,
  completionRate,
  mealsDone,
  mealsTotal,
  replacementsTotal,
  plan,
  executionState
}
```

## API Design

Add `src/server/week-review-response.mjs`, local `server.mjs` route, and Vercel `api/review-week.js`.

Request:

```json
{
  "apiKey": "string",
  "model": "deepseek-v4-flash",
  "plan": {},
  "executionState": {},
  "feedback": "string"
}
```

Response:

```json
{
  "mode": "live | fallback",
  "review": {
    "summary": "string",
    "wins": ["string"],
    "frictions": ["string"],
    "nextWeekAdjustments": ["string"],
    "promptHints": ["string"]
  }
}
```

Without an API Key, return a deterministic local review based on completion stats, replacement count, skipped meals, and feedback text.

## Testing

- Extend execution/history tests for history entry and review summary.
- Add server tests for `/api/review-week` fallback and live DeepSeek proxy.
- Add Vercel tests for `api/review-week.js`.
- Extend static asset tests for the `历史复盘` screen and controls.
- Run `npm test` before completion.

## Success Criteria

- Users can generate a plan, see it in history, reopen it, review it, delete it, and export recap Markdown.
- `/api/review-week` returns useful local fallback without a key.
- Live review path sends a structured JSON request to DeepSeek and normalizes the result.
- Existing execution center, RAG loading, and production routes continue to pass tests.
