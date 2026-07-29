# AI Idol Match Production Handoff

## Local Verification

- `npm ci`
- `npm run verify`
- `npm run dev -- --port 3220`

## Data Source

The candidate profile source lives at `knowledge-base/年轻向全球idol资料清单_120plus.md`.
Run `node scripts/build-idol-profiles.mjs` after editing this file.

## Launch Checklist

- Full verification passes locally.
- GitHub Verify workflow passes on `main`.
- Production page loads the start screen.
- 15-question experience mode reaches a result.
- Result page shows Top 1, Top 3, reasons, tags, and share/copy action.
- If AI explanation is enabled later, fallback mode still works when the key is absent.
