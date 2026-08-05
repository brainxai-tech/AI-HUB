# Spec: AI English Theater MVP

## Objective

Build a local web application where users practice English in four scenarios: interview, travel, business negotiation, and campus social. The AI plays the conversation partner, adapts to the selected scene and level, provides optional hints, and returns a structured score report.

## Tech Stack

- Runtime: Node.js 20+ with native `http` and `fetch`.
- Frontend: static HTML, CSS, and vanilla JavaScript.
- Tests: Node's built-in `node:test`.
- Storage: in-memory browser state only for MVP; no database.

## Commands

```powershell
npm start
npm test
npm run verify
```

## Project Structure

```text
server.mjs              -> HTTP server and API routes
src/scenarios.mjs       -> Scenario definitions and starter prompts
src/prompts.mjs         -> Roleplay, hint, and evaluation prompt builders
src/providers.mjs       -> AI Hub model catalog and chat proxy client
src/validation.mjs      -> Request validation and safe error helpers
public/index.html       -> Main app shell
public/styles.css       -> Design system and responsive layout
public/app.js           -> Client state and API calls
tests/*.test.mjs        -> Unit and API tests
scripts/static-check.mjs -> Fast static verification
```

## Code Style

Use small named functions, explicit objects for API contracts, and validation at the HTTP boundary.

```js
export function createApiError(code, message, status = 400) {
  return { status, body: { error: { code, message } } };
}
```

## Testing Strategy

- Unit tests cover scenario lookup, prompt contracts, Hub proxy payload mapping, validation, and unconfigured-provider blocking.
- Static checks verify required files and UI hooks exist.
- Manual/browser smoke verifies the app starts and renders.

## Boundaries

- Always: validate request bodies, return consistent `{ error }` objects, read model availability from AI Hub, and keep provider responses treated as untrusted.
- Ask first: authentication, database, billing, speech input, or changing the shared Hub model configuration contract.
- Never: commit secrets, expose provider API keys to the frontend, store credentials in localStorage, call model providers directly, expose raw provider stack traces, or allow AI generation without Hub model configuration.

## Success Criteria

- The app can start locally at `http://localhost:3177`.
- Users can select all four scenes and see scene-specific role/goal/rubric data.
- Users can choose enabled Hub providers and select among the enabled models for that provider.
- `/api/providers`, `/api/roleplay`, `/api/hint`, and `/api/evaluate` expose stable JSON contracts.
- Missing Hub model configuration blocks generation and points users back to `/hub/#models`.
- Evaluation returns a structured report with overall score, CEFR estimate, subscores, strengths, corrections, better replies, and next practice.
- `npm run verify` passes.

## Open Questions

- Whether to add per-user model configuration on top of the shared Hub configuration.
- Whether speech input/output should be Web Speech API or provider-native realtime APIs.
- Whether reports should be saved locally, exported, or synced.
