# AI English Theater

Scenario-based English speaking practice for AI Hub. Users choose a scene, talk with an AI role, request hints, and receive a structured score report.

## Features

- Four practice scenes: interview, travel, business negotiation, and campus social.
- Model provider and model selection from AI Hub unified model configuration.
- Server-side Hub chat proxy calls only; the browser never receives provider credentials.
- No project-local API Key input, mock mode, or offline generation fallback.
- Structured evaluation report with subscores, corrections, better replies, and next practice tasks.

## Commands

```powershell
npm start
npm test
npm run verify
```

Open the app at `http://localhost:3177` after starting the server.

## Hub Model Configuration

Set `HUB_MODEL_CONFIG_URL`, `HUB_CHAT_COMPLETIONS_URL`, and `HUB_PROJECT_TOKEN` on the server. In production these are provided by AI Hub's shared project environment file. Configure provider API Keys only in Hub at `/hub/#models`.
