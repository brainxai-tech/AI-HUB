# Social Growth Phase Two Design

**Goal:** Add three lightweight result-page features that make the grassland personality test more replayable and shareable without adding accounts, databases, or external APIs.

**Approved direction:** Treat this as a local-first second phase: the current user's result stays the anchor, and every new feature is derived from existing 20-type data.

## Feature Set

1. **每日草原天气**
   - Shows a deterministic daily forecast for the current personality type.
   - Uses local date plus personality id, so the copy feels fresh but remains stable for the day.
   - Displays: weather title, forecast sentence, and one small action prompt.

2. **双人相处报告**
   - Lets the user select any of the 20 personalities as the other person.
   - Compares the two anchor vectors and produces a relationship climate, shared strengths, friction point, and practical suggestion.
   - No invite links or stored partner results in this phase.

3. **草原图鉴**
   - Shows all 20 personality types as a compact result atlas.
   - Highlights the user's current result.
   - Helps users browse adjacent identities and gives the product a collectible feeling.

## Architecture

- Add `lib/social-growth.ts` for pure product logic: deterministic weather, relationship report, and atlas entries.
- Add `tests/social-growth.test.ts` before implementation to lock behavior and keep scoring-adjacent logic stable.
- Update `components/GrasslandTest.tsx` only at the result page level.
- Extend `app/globals.css` with scoped classes for the three new modules.

## UI Direction

The result page should feel like opening a small field notebook rather than entering a dashboard. The new modules use calm cards, thin meadow borders, compact labels, and enough whitespace to avoid burying the core result. Mobile remains single-column; desktop can place daily weather and relationship report side by side.

## Non-Goals

- No login, account identity, or saved history.
- No generated AI relationship essay.
- No social sharing API.
- No new route structure.

## Verification

- Unit tests for deterministic feature logic.
- Existing scoring/result tests remain green.
- Lint, typecheck, and build must pass.
- Browser smoke test covers mobile and desktop result-page visibility, partner select, atlas highlight, and overflow.
