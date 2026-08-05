# AI Go Duel

Hub-ready 9x9 Go game for AI Project Hub.

## Features

- Legal moves, captures, suicide prevention, and ko prevention through `@sabaki/go-board`
- Local heuristic AI opponent for a quick 9x9 duel
- Move coach powered by AI Project Hub's shared model gateway
- No user-entered model API keys inside the project

## Environment

Copy `.env.example` to `.env.local` on the server and provide `HUB_PROJECT_TOKEN`.

```bash
NEXT_PUBLIC_BASE_PATH=/go
HUB_PROJECT_TOKEN=
HUB_CHAT_COMPLETIONS_URL=http://127.0.0.1:4194/api/v1/chat/completions
HUB_MODEL_CONFIG_URL=http://127.0.0.1:4194/api/model-config
```

## Commands

```bash
npm install
npm test
npm run check
npm run build
```
