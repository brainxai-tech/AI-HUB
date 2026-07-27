# AI Project Hub Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the public AI Project Hub, remove secret-exposure and denial-of-service risks, make configuration and deployment recoverable, and improve project gating and asset delivery without breaking the 32 published project links.

**Architecture:** Keep the existing dependency-free Node HTTP service, but split security concerns into focused modules for authentication, rate limiting, validation, configuration storage, and upstream calls. Keep runtime state outside release directories, publish only current static assets, and deploy releases atomically with health-checked rollback.

**Tech Stack:** Node.js ES modules, Node test runner, Nginx, systemd, JSON configuration, JSONL observability, Git.

---

## Task 1: Baseline and rollback safety

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docs/superpowers/plans/2026-07-10-ai-project-hub-hardening.md`

- [ ] Verify local hashes for core source files match `/home/admin/apps/ai-project-hub`.
- [ ] Save source, web root, Nginx, systemd, health, and hashes under `/home/admin/backups/ai-project-hub/pre-hardening-<timestamp>/` with mode `0600`.
- [ ] Run `npm run verify`; expected result is 13 passing tests and 0 failures.
- [ ] Initialize Git, commit the imported baseline, and create an isolated `hardening` worktree.

## Task 2: Remove publicly reachable backups and isolate administration

**Files:**
- Modify: `/etc/nginx/sites-available/idol-match-test`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Create: `public/admin/index.html`
- Create: `public/admin/app.js`

- [ ] Add a failing test that public HTML contains no administrator token or provider key inputs.
- [ ] Move model configuration UI into `/hub/admin/` while keeping `/hub/` read-only.
- [ ] Add Nginx denial rules for backup suffixes and `/hub/backups/`.
- [ ] Move current web-root backups to the protected rollback directory.
- [ ] Run `nginx -t`, reload, and verify known backup URLs return 403 or 404.
- [ ] Verify `/hub/` and `/hub/admin/` load, with admin access restricted to localhost until HTTPS/domain configuration is supplied.

## Task 3: Project-scoped authorization

**Files:**
- Create: `auth.mjs`
- Modify: `server.mjs`
- Create: `tests/auth.test.mjs`
- Create: `scripts/generate-project-token.mjs`

- [ ] Add tests for missing token (401), wrong token (401), insufficient scope (403), project mismatch (403), and valid scoped token (200).
- [ ] Load a mode-`0600` project-token registry containing only SHA-256 token hashes, project IDs, scopes, and limits.
- [ ] Require `x-hub-project-id` with `x-hub-project-token` on protected routes.
- [ ] Keep the legacy shared token only behind `HUB_ALLOW_LEGACY_PROJECT_TOKEN=true` and emit a non-secret deprecation event.
- [ ] Add a generator that prints a random token once and writes only its hash to the registry.

## Task 4: Coze server-side proxy

**Files:**
- Modify: `server.mjs`
- Create: `integrations/coze.mjs`
- Create: `tests/coze.test.mjs`

- [ ] Add a failing test proving no API response contains `apiToken`.
- [ ] Remove the endpoint that returns private Coze configuration.
- [ ] Add `POST /api/integrations/coze/run`, authorized with `coze:invoke`, that calls Coze using server-held credentials.
- [ ] Validate workflow inputs and return a sanitized provider error.
- [ ] Verify the resume project can invoke the workflow but cannot retrieve the PAT.

## Task 5: Validation, rate limiting, concurrency, and upstream timeout

**Files:**
- Create: `request-policy.mjs`
- Modify: `server.mjs`
- Create: `tests/request-policy.test.mjs`
- Create: `tests/gateway.integration.test.mjs`

- [ ] Add tests for oversized bodies, invalid messages, invalid temperature, invalid token limits, disabled models, per-project 429 responses, concurrency rejection, and upstream timeout.
- [ ] Validate chat payloads at the route boundary and cap input size and output tokens.
- [ ] Apply per-project token-bucket limits and concurrency counters.
- [ ] Use `AbortSignal.timeout()` for every upstream request and align Nginx proxy timeouts.
- [ ] Return stable JSON error codes without stack traces or provider credentials.

## Task 6: Atomic configuration and safe health reporting

**Files:**
- Create: `config-store.mjs`
- Modify: `server.mjs`
- Create: `tests/config-store.test.mjs`

- [ ] Add tests for a missing config, malformed JSON, interrupted temporary write, successful atomic replacement, and last-known-good fallback.
- [ ] Write configuration to a temporary mode-`0600` file, sync it, validate it, and rename atomically.
- [ ] Stop swallowing all read errors; expose `healthy` or `degraded` status without exposing paths or secrets.
- [ ] Keep runtime configuration under `/var/lib/ai-project-hub` instead of a release directory.

## Task 7: Bounded observability

**Files:**
- Modify: `observability.mjs`
- Modify: `server.mjs`
- Modify: `tests/observability.test.mjs`
- Create: `deploy/logrotate/ai-project-hub`

- [ ] Add tests for a maximum event size, anonymous tracking rate limits, malformed lines, tail-bounded reads, and sensitive-field stripping.
- [ ] Cap tracking bodies at 2 KiB and accept only the documented event fields.
- [ ] Read at most a bounded tail of the log instead of the entire file.
- [ ] Store logs outside the release with mode `0600` and rotate at 20 MiB with 14 retained daily files.

## Task 8: Service hardening

**Files:**
- Create: `deploy/systemd/ai-project-hub.service`

- [ ] Set `Restart=on-failure`, restart burst limits, `NoNewPrivileges`, `PrivateTmp`, filesystem protections, and explicit writable paths.
- [ ] Run `systemd-analyze verify` on the unit.
- [ ] Deploy, restart once, and verify the service remains healthy without increasing `NRestarts` during the observation window.

## Task 9: Capability-aware project gating and copy cleanup

**Files:**
- Modify: `public/projects.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `tests/smoke.test.mjs`

- [ ] Replace the global boolean gate with `requiredCapabilities` metadata.
- [ ] Add tests proving model configuration does not unlock a Coze-only project and missing capability text is displayed.
- [ ] Remove the ineffective status filter if every project remains `live`, or populate real stages.
- [ ] Change the search placeholder to match searchable fields.

## Task 10: Static asset delivery

**Files:**
- Modify: `public/projects.js`
- Modify: `public/app.js`
- Modify: `/etc/nginx/sites-available/idol-match-test`
- Create: `scripts/optimize-covers.mjs`

- [ ] Generate responsive WebP/AVIF cover variants without deleting originals until visual verification passes.
- [ ] Render `srcset`, `sizes`, width, and height attributes.
- [ ] Set immutable caching for fingerprinted assets and no-cache only for HTML/config data.
- [ ] Verify all 32 cards render, referenced cover bytes are below 5 MiB, and initial transfer is below 1.5 MiB.

## Task 11: Git-backed atomic deployment

**Files:**
- Create: `deploy/deploy.sh`
- Create: `deploy/rollback.sh`
- Modify: `README.md`

- [ ] Package a release under `/opt/ai-project-hub/releases/<commit>` without secrets or runtime data.
- [ ] Switch `/opt/ai-project-hub/current` atomically after tests pass.
- [ ] Health-check after restart and automatically restore the previous symlink on failure.
- [ ] Keep `/var/lib/ai-project-hub`, `/var/log/ai-project-hub`, and `/etc/ai-project-hub` outside releases.

## Task 12: HTTPS and credential rotation

**Files:**
- Modify: `/etc/nginx/sites-available/idol-match-test`

- [ ] Point the selected DNS name to `47.84.108.192`.
- [ ] Issue and install a valid certificate, redirect HTTP to HTTPS, and add HSTS after successful HTTPS verification.
- [ ] Rotate the admin token, legacy project token, provider keys entered over HTTP, and Coze PAT.
- [ ] Disable legacy project-token compatibility after all consumers migrate.
- [ ] Run final tests, endpoint checks, browser checks, authorization checks, backup URL checks, and rollback rehearsal.

## Checkpoints

- After Tasks 1-2: baseline tests pass; public backups are blocked; rollback is proven.
- After Tasks 3-5: scoped authorization, Coze proxy, validation, limits, and timeouts pass integration tests.
- After Tasks 6-8: config, logs, and systemd survive failure simulations.
- After Tasks 9-11: all 32 projects render and atomic deployment/rollback succeeds.
- After Task 12: HTTPS and rotated credentials complete the production security acceptance.

