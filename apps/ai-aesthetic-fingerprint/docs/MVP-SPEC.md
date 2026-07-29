# Spec: AI Aesthetic Fingerprint MVP

> Historical note: this document records the original multi-provider MVP. The current implementation uses the unified AI Hub GPT route. Follow the project `README.md`; do not configure project-level API keys or vendor endpoints from this archived spec.

## Objective

Build a local web MVP that lets a user upload visual references and turn them into a reusable aesthetic report and UI prompt. The user is a designer, founder, creator, or product builder who has taste references but needs a clearer design direction.

Success means a user can upload images, pick a provider, run analysis, read the report, and copy a UI prompt from one working page.

## Tech Stack

- Vite + React + TypeScript for the UI.
- Express + TypeScript for the local API server.
- Zod for request/response validation.
- Vitest for unit tests.
- Direct `fetch` calls for OpenAI, Anthropic, Gemini, and optional DeepSeek polishing APIs.

## Commands

```bash
npm run dev
npm run test
npm run typecheck
npm run build
npm run verify
npm start
```

## Project Structure

```text
src/App.tsx              UI workspace
src/styles.css           Visual system and responsive layout
src/lib/api.ts           Frontend API client
src/lib/files.ts         Upload validation and file conversion
src/shared/schema.ts     Shared API and report contract
server/index.ts          Express server and routes
server/prompts.ts        Model instruction prompt
server/providers/        Provider adapters
tests/                   Unit tests for contracts and logic
```

## API Contract

- `GET /api/health` returns app status and provider configuration state.
- `POST /api/analyze` accepts 1-10 images and returns an `AnalyzeResponse`.
- Every error response uses `{ error: { code, message, details? } }`.
- Input and model output are validated at the boundary.

## Boundaries

Always:

- Validate uploaded image type, count, and size.
- Keep API keys on the server.
- Re-validate third-party model output before rendering.
- Show clear errors when a provider is not configured.

Ask first:

- Persisting original images.
- Adding accounts, billing, or remote storage.
- Adding new provider APIs.

Never:

- Commit real API keys.
- Pretend demo output is real image analysis.
- Render model output as raw HTML.

## Success Criteria

- The app runs locally with `npm run dev`.
- The page supports multi-image upload, preview, removal, provider selection, loading, empty, and error states.
- The API supports OpenAI, Claude, Gemini, demo mode, and optional DeepSeek text polishing.
- The report includes color, typography, layout, mood, taboos, next directions, UI prompt, image notes, and caveats.
- `npm run verify` passes.

## Open Questions

- Which provider should be the default for production usage?
- Should reports be saved locally, exported to Markdown, or synced to Obsidian?
- Should the product add a second pass for DeepSeek text polishing?
