---
type: visual-design-plan
project: ai-xiangqi-duel
created: 2026-07-08
updated: 2026-07-08
status: draft
tags:
  - frontend-design
  - xiangqi
  - game-ui
  - ai-product
---

# AI Xiangqi Duel Visual Design Plan

## Design Read

Page type: browser Chinese chess app / AI training desk.

Target user: a casual-to-intermediate Xiangqi learner who wants to play quickly, ask for hints, and understand engine-backed moves in Chinese.

Core task: start a match, make legal moves confidently, see AI thinking facts, request explanations when useful, and review moves after the game.

Design tone: quiet Xiangqi analysis desk. The board is the main stage; the rail is for controls, engine facts, coaching, and move history.

## Product Layout

First screen is a match lobby, not a landing page:

- Board preview.
- Board theme.
- Player side.
- AI difficulty.
- Optional model provider and API key.
- Start game.

Game screen:

- Large 9x10 board with river label.
- Top turn/status strip.
- Engine insight strip below board.
- Right analysis rail for controls, hint, coaching, history, and post-game review.
- Mobile bottom action bar for hint, explanation, and new game.

## Visual Rules

- Red and black pieces must be easy to distinguish.
- Hints, selected points, last move, and check state must not rely only on text.
- The model coach is a coach layer, not the chess engine.
- Engine facts remain visible even when provider calls fail.
- No marketing hero or decorative AI gradient.

## Verification Targets

- Board remains playable at 390px mobile width.
- Buttons and long Chinese text wrap cleanly.
- No horizontal overflow.
- `npm test`, `npm run check`, and `npm run build` pass.
- Local HTTP smoke can load `/` and `/api/ai/hint`.
