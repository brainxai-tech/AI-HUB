# AI Cooking Coach Production Handoff Design

## Product State

AI Cooking Coach is now a local-first Chinese cooking and meal-prep MVP that can also run on Vercel production. It supports weekly DeepSeek meal-plan generation, nutrition RAG grounding for shopping items, a 500-recipe menu RAG, and a Kitchen Command Center for executing the generated plan through shopping, batch prep, daily meals, emergency replacements, and replacement history.

## Goal

Turn the current working product into a maintainable production handoff without adding new product scope. The handoff must make it clear how to run the app locally, what is deployed in production, how the RAG sources are managed, how to verify the app, and which limitations remain.

## Scope

In scope:

- Refresh `README.md` so it reflects the current app instead of the original first-version MVP.
- Document local startup through `start-ai-cooking-coach.cmd`, `npm start`, and the default URL.
- Document production deployment and the current Vercel production URL.
- Document the two RAG assets: ingredient nutrition RAG and 500-recipe menu RAG.
- Document how to rebuild the menu RAG from the DOCX source.
- Document the main API routes: health, agent metadata, plan generation, and meal adjustment.
- Document verification commands and expected smoke checks.

Out of scope:

- No account system.
- No cloud sync.
- No new AI feature beyond the existing meal replacement endpoint.
- No schema migration or large frontend redesign.
- No change to DeepSeek planning behavior unless documentation reveals a broken command.

## Current Architecture

The project stays dependency-light:

- `server.mjs` serves local HTTP, static assets, `/api/health`, `/api/agent`, `/api/plan`, and `/api/adjust-meal`.
- `api/*.js` provides Vercel-compatible serverless API handlers.
- `src/domain/*.mjs` owns prompt building, schema normalization, nutrition governance, and agent prompt text.
- `src/server/*.mjs` owns DeepSeek interaction and API response construction.
- `public/*.html|css|js|mjs` owns the vanilla frontend and local execution state.
- `public/data/*.json` stores static RAG indexes.
- `scripts/*.py|ps1` stores RAG build and Windows startup helpers.
- `tests/*.test.mjs` covers domain logic, server routes, static assets, Vercel handlers, execution state, startup, and launch scripts.

## Documentation Design

`README.md` becomes the primary quick-start document. It should cover:

- What the product does now.
- Production URL.
- Local quick start.
- API key handling.
- Main feature map.
- Verification command.
- Important limitations.

`docs/production-handoff.md` becomes the operational handoff. It should cover:

- Local run options.
- Production deployment URL and deploy command.
- Static data/RAG assets.
- Rebuilding menu RAG from DOCX.
- API route summary.
- Verification checklist.
- Known limitations and safe next steps.

## Verification Design

Before claiming completion:

- Run `npm test` and confirm all tests pass.
- Check local health endpoint if a local server is running.
- Check production homepage, `/api/health`, and `public/data/menu-library-rag.json` through the production URL.
- Confirm the production RAG source is the 500-recipe DOCX and item count is 500.

## Success Criteria

- A new reader can run the app locally without reading code.
- A future maintainer can rebuild the menu RAG from the DOCX source.
- The README no longer describes obsolete demo/no-key behavior as the product center.
- The handoff document lists the current production URL and deployment command.
- Fresh verification evidence exists from tests and production smoke checks.
