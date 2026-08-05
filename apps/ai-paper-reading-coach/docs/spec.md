# Spec: AI Paper Reading Coach

## Objective

Build a tool-first paper reading workspace that helps users import a paper, inspect sections, generate a paper map, explain selected paragraphs, answer questions with section citations, and create a review package.

## Architecture

- React, Vite, and TypeScript for the browser UI.
- Express and TypeScript for paper import, parsing, and model request validation.
- `pdf-parse` for text-layer PDF parsing.
- `zod` for shared request validation.
- AI Hub project-scoped proxy for every model request.

## Boundaries

- The project never displays, accepts, or stores an API key.
- Only the `openai` Hub route and `gpt-*` models are accepted.
- The current model comes from the page-top Hub selector; the project has no vendor or model selector.
- Imported paper text is reduced to relevant sections and paragraph citations before a model call.
- Model output is validated before rendering and always labels evidence as text-based, inferred, or uncertain.

## Success Criteria

- A user can paste text, upload a text-layer PDF, or import a supported link.
- The app identifies common paper sections when present.
- The UI provides import/navigation, reading, and coaching panes.
- AI generation is unavailable until Hub has an enabled, configured GPT model for this project.
- Every AI generation call goes through the Hub project-scoped proxy.
- `npm run verify` passes.
