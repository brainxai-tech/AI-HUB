# ADR-002: Use a Compatible AI Report Generator

## Status

Superseded by Hub gateway integration

## Date

2026-06-17

## Updated

2026-07-01

## Context

ADR-001 moved the product from a local-only reader to a local spread plus DeepSeek report generator. ADR-002 originally moved that layer to a browser-provided compatible API configuration. The Hub integration supersedes that project-level key flow: model provider choice and credentials now belong to AI Project Hub.

## Decision

Treat the AI layer as a Hub-backed report generator rather than a project-level compatible API integration.

The current main flow is:

1. The browser collects the theme and question.
2. Local code draws three unique cards and assigns root, present, and trend positions.
3. The browser sends the structured reading to `/api/compatible-reading`.
4. The API route sends the prompt to AI Project Hub's model gateway.
5. Hub owns provider selection, model names, and credentials.
6. The route normalizes the returned JSON report before sending it back to the UI.
7. The browser renders and optionally saves the reading in localStorage.

`/api/deepseek-reading` remains available as a legacy alias, but both routes use the Hub model gateway.

## Consequences

- UI and docs should say "Hub model gateway" rather than "compatible API Key" for the main product behavior.
- Project-level provider, API Key, Base URL, and model inputs are removed from the active product flow.
- Old compatible API localStorage keys are cleaned up best-effort on page load; saved readings remain browser-local.
- The deterministic local interpretation engine remains for tests, old history, and possible fallback work.
