# AI HUB Workflow Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely productionize the four existing AI HUB workflow Skills, add legal-review and TraceSheet workflows, expose them through an administrator-gated Hub workflow center, install the Skills for local Codex discovery, then push and deploy the same verified Git commit.

**Architecture:** Keep `agent-workflow-runtime` private on `127.0.0.1:4196`. The Hub gateway on 4194 authorizes workflow requests with `HUB_ADMIN_TOKEN`, proxies a strict route allowlist to 4196, and injects `WORKFLOW_API_TOKEN` server-side. The workflow center never receives that internal token. Legal review reuses `/legal/api/analyze`; TraceSheet sends only dataset metadata to `/tracesheet/api/plan`, keeps all cell execution in the browser, and persists only approval plus a bounded execution receipt.

**Tech Stack:** Node.js 24 ESM, React/Next project APIs reused through the shared runtime, JSON-file workflow persistence, Node test runner, systemd, Nginx, PowerShell/OpenSSH, GitHub Actions.

---

## Scope and safety decisions

- Ship the six P0 Skills: the four existing Skills plus `review-legal-clause` and `operate-trace-sheet`.
- Do not add English, fraud, data-analysis, or book workflows in this release; they remain P1/P2 candidates after production usage data exists.
- Do not expose port 4196 in Nginx and do not send `WORKFLOW_API_TOKEN` to a browser.
- Require Hub administrator access for every `/hub/api/workflows/*` request. Until HTTPS exists, use the workflow center through an SSH tunnel.
- Do not add a server-wide run list because the product has no end-user identity or ownership model.
- Add 30-day retention and explicit deletion because runs may contain essays, papers, course sources, and legal text.
- Do not move TraceSheet cell data to the server. Reject `rows`, `cells`, or `data` fields in its workflow input and accept only names, columns, counts, plan approval, and execution summaries.
- Do not claim the legal workflow has a law knowledge base. Its manifest must state `model-only` with `versioned-jurisdiction-guidance` as a planned source.

## Task 1: Harden workflow persistence and manifest validation

**Files:**
- Modify: `packages/agent-workflow-runtime/src/run-store.mjs`
- Modify: `packages/agent-workflow-runtime/src/workflow-runner.mjs`
- Modify: `packages/agent-workflow-runtime/src/http-api.mjs`
- Modify: `packages/agent-workflow-runtime/src/skill-registry.mjs`
- Modify: `packages/agent-workflow-runtime/server.mjs`
- Test: `packages/agent-workflow-runtime/tests/http-api.test.mjs`
- Test: `packages/agent-workflow-runtime/tests/workflow-recovery.test.mjs`

- [ ] **Step 1: Add failing retention, deletion, and manifest tests**

  Cover a 30-day default retention cutoff, a bounded `AIHUB_WORKFLOW_RETENTION_DAYS`, `DELETE /api/runs/:id`, deletion rejection for a locked run, and invalid workflow versions/step arrays.

- [ ] **Step 2: Run the focused tests and confirm the new cases fail**

  Run: `npm test` from `packages/agent-workflow-runtime`.
  Expected: the new deletion, retention, and manifest validation assertions fail before implementation.

- [ ] **Step 3: Implement the bounded interfaces**

  Add these public contracts without adding a global list:

  ```js
  class FileRunStore {
    constructor(directory, { retentionDays = 30, now = () => Date.now() } = {})
    async delete(id)
  }

  class WorkflowRunner {
    async delete(id) // reject RUN_BUSY, otherwise delete the exact run id
  }

  // HTTP
  // DELETE /api/runs/:id -> 204, no body
  ```

  During store initialization, remove only valid `<run-id>.json` files whose parsed `updatedAt` is older than the cutoff. Ignore malformed files rather than widening the deletion target.

- [ ] **Step 4: Verify runtime tests**

  Run: `npm test` from `packages/agent-workflow-runtime`.
  Expected: all runtime tests pass.

- [ ] **Step 5: Commit the runtime hardening**

  Run: `git add packages/agent-workflow-runtime && git commit -m "feat(workflows): add retention and deletion"`.

## Task 2: Add a private Hub workflow proxy

**Files:**
- Create: `workflow-proxy.mjs`
- Modify: `server.mjs`
- Create: `tests/workflow-proxy.test.mjs`
- Modify: `tests/hub-api.test.mjs` if its route fixture is the existing gateway API test owner

- [ ] **Step 1: Write proxy boundary tests**

  Prove that the proxy:

  - accepts only loopback HTTP origins;
  - maps `/api/workflows/skills` to `/api/skills` and the bounded run routes to `/api/runs/...`;
  - permits only `GET`, `POST`, and `DELETE` where the runtime supports them;
  - removes browser `authorization` and `x-hub-admin-token` headers;
  - injects exactly `Authorization: Bearer <WORKFLOW_API_TOKEN>` upstream;
  - never returns the internal token in errors or response headers;
  - returns a sanitized 502 if 4196 is unavailable.

- [ ] **Step 2: Run the new test and confirm failure**

  Run: `node --test tests/workflow-proxy.test.mjs`.
  Expected: fail because `workflow-proxy.mjs` does not exist.

- [ ] **Step 3: Implement the proxy and gateway gate**

  Export this focused interface:

  ```js
  export function createWorkflowProxy({
    origin = "http://127.0.0.1:4196",
    apiToken = process.env.WORKFLOW_API_TOKEN || "",
  } = {}) {
    return { match(pathname), handle(request, response, pathname) };
  }
  ```

  In `server.mjs`, route `/api/workflows/*` before the generic API 404, require `hasAdminAccess(request)`, rate-limit by client, and call the proxy. Keep `/api/workflows/health` mapped to `/health` for deployment health checks.

- [ ] **Step 4: Verify gateway tests**

  Run: `node --test tests/workflow-proxy.test.mjs tests/*.test.mjs`.
  Expected: proxy tests and all root tests pass.

- [ ] **Step 5: Commit the proxy**

  Run: `git add workflow-proxy.mjs server.mjs tests && git commit -m "feat(hub): proxy private workflow runtime"`.

## Task 3: Build the administrator-gated workflow center

**Files:**
- Create: `public/workflows/index.html`
- Create: `public/workflows/workflows.css`
- Create: `public/workflows/workflows.js`
- Modify: `public/index.html`
- Modify: `tests/project-hub-ui.test.mjs`

- [ ] **Step 1: Add failing static UI assertions**

  Assert that `/hub/workflows/` has an administrator unlock form, loads no inline script, never stores the admin token, supports create/get/resume/retry/action/delete, has per-Skill human-readable start forms, displays the run id/status/events, and discloses server persistence plus the SSH-tunnel requirement.

- [ ] **Step 2: Run the UI test and confirm failure**

  Run: `node --test tests/project-hub-ui.test.mjs`.
  Expected: fail because the workflow center assets do not exist.

- [ ] **Step 3: Implement the static page**

  Use a data-driven form registry for these six ids:

  ```js
  const workflowForms = {
    "coach-chinese-essay": essayStartAndCheckpointForms,
    "plan-weekly-meals": mealStartCheckpointAndActionForms,
    "read-research-paper": paperStartAndSessionForms,
    "build-course-pack": courseStartAndReviewForms,
    "review-legal-clause": legalStartReviewAndReanalysisForms,
    "operate-trace-sheet": traceMetadataReviewActionAndReceiptForms,
  };
  ```

  Keep `adminToken` only in a module variable. Store recent run ids in `sessionStorage`, never run content or credentials. Render all model/user text with `textContent`; do not inject it as HTML. Provide an explicit delete button for each opened run.

- [ ] **Step 4: Verify accessibility and static serving**

  Run: `node --test tests/project-hub-ui.test.mjs tests/accessibility.test.mjs`.
  Expected: pass with labelled forms, status live regions, keyboard-operable controls, and no inline secrets.

- [ ] **Step 5: Commit the workflow center**

  Run: `git add public tests && git commit -m "feat(hub): add workflow center"`.

## Task 4: Add the legal review Skill

**Files:**
- Create: `skills/review-legal-clause/SKILL.md`
- Create: `skills/review-legal-clause/agent-skill.json`
- Create: `skills/review-legal-clause/agents/openai.yaml`
- Create: `skills/review-legal-clause/references/contracts.md`
- Create: `skills/review-legal-clause/scripts/adapter.mjs`
- Modify: `packages/agent-workflow-runtime/src/project-client.mjs`
- Modify: `packages/agent-workflow-runtime/tests/workflow-runtime.test.mjs`
- Create: `packages/agent-workflow-runtime/tests/legal-regressions.test.mjs`

- [ ] **Step 1: Initialize the Skill and write failing workflow tests**

  Initialize with the repository `skills/` directory, then test:

  ```text
  analyze clause -> analysis-review checkpoint
  reanalyze action -> append immutable analysis version -> same checkpoint
  prepare-lawyer-review -> legal-review checkpoint
  approved-for-reading | needs-lawyer -> completed audit result
  ```

  Require every version to preserve the disclaimer, quality warnings, evidence snippets, jurisdiction string, timestamp, and reviewer notes. Never name the final decision `legal-approved`.

- [ ] **Step 2: Run focused tests and confirm failure**

  Run: `node --test packages/agent-workflow-runtime/tests/legal-regressions.test.mjs`.
  Expected: fail because the Skill is not registered.

- [ ] **Step 3: Implement the adapter by reusing the project API**

  Add `legal: ${shared}/legal/` to `defaultServices()`. The adapter must call only `client.requestJson("legal", "/api/analyze", ...)`, validate bounded input, maintain `analysisVersions`, implement action `reanalyze`, and produce a lawyer review packet from the project result without inventing law citations.

- [ ] **Step 4: Validate the Skill package and runtime**

  Run:

  ```powershell
  python "C:\Users\Michael Song\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/review-legal-clause
  npm test --prefix packages/agent-workflow-runtime
  npm test --prefix apps/ai-legal-clause-translator
  ```

  Expected: validation and all tests pass.

- [ ] **Step 5: Commit the legal Skill**

  Run: `git add skills/review-legal-clause packages/agent-workflow-runtime && git commit -m "feat(workflows): add legal review skill"`.

## Task 5: Add the TraceSheet metadata and receipt Skill

**Files:**
- Create: `skills/operate-trace-sheet/SKILL.md`
- Create: `skills/operate-trace-sheet/agent-skill.json`
- Create: `skills/operate-trace-sheet/agents/openai.yaml`
- Create: `skills/operate-trace-sheet/references/contracts.md`
- Create: `skills/operate-trace-sheet/scripts/adapter.mjs`
- Modify: `packages/agent-workflow-runtime/src/project-client.mjs`
- Modify: `packages/agent-workflow-runtime/tests/workflow-runtime.test.mjs`
- Create: `packages/agent-workflow-runtime/tests/trace-regressions.test.mjs`
- Modify: `apps/trace-sheet-workbench/src/lib/trace-workbench.ts`
- Modify: `apps/trace-sheet-workbench/tests/trace-workbench.test.ts`

- [ ] **Step 1: Write failing privacy, risk, and transition tests**

  Cover:

  ```text
  goal + PlanContext metadata -> review-plan
  revise-plan action -> new immutable plan revision
  approve -> execution-receipt
  bounded receipt -> completed audit
  rows/cells/data anywhere in input -> VALIDATION_ERROR
  DEDUP risk is deterministically HIGH even if a model labels it LOW
  ```

- [ ] **Step 2: Run focused tests and confirm failure**

  Run:

  ```powershell
  node --test packages/agent-workflow-runtime/tests/trace-regressions.test.mjs
  npm test --prefix apps/trace-sheet-workbench
  ```

  Expected: new workflow and deterministic DEDUP assertions fail before implementation.

- [ ] **Step 3: Implement the browser-local seam**

  Add `tracesheet: ${shared}/tracesheet/` to `defaultServices()`. Call only `/api/plan`. The adapter may persist:

  ```js
  {
    sources: [{ id, name, fileName, sheetName, columns, rowCount }],
    planRevisions: [{ plan, mode, notice, createdAt }],
    approval: { decision, at, notes },
    receipt: { finalVersionId, inputRows, outputRows, changedRows, warnings, auditHash },
  }
  ```

  It must never accept or persist source rows. In the deterministic plan normalizer, force every `DEDUP` operation to `risk: "HIGH"` before preview or execution.

- [ ] **Step 4: Validate the Skill and both test suites**

  Run:

  ```powershell
  python "C:\Users\Michael Song\.codex\skills\.system\skill-creator\scripts\quick_validate.py" skills/operate-trace-sheet
  npm test --prefix packages/agent-workflow-runtime
  npm test --prefix apps/trace-sheet-workbench
  ```

  Expected: validation and all tests pass.

- [ ] **Step 5: Commit the TraceSheet Skill**

  Run: `git add skills/operate-trace-sheet packages/agent-workflow-runtime apps/trace-sheet-workbench && git commit -m "feat(workflows): add TraceSheet approval skill"`.

## Task 6: Make workflow production deployment atomic

**Files:**
- Modify: `deploy/deploy.sh`
- Modify: `deploy/systemd/ai-project-hub.service`
- Modify: `deploy/systemd/ai-hub-agent-workflow.service`
- Modify: `tests/agent-workflow-staging.test.mjs`
- Modify: `tests/deployment.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Replace the staging-only assertions with failing production lifecycle assertions**

  Require the deploy script to create `/etc/ai-project-hub/agent-workflow.env` with a strong random token and mode 0640, create `/var/lib/ai-project-hub/workflow-runs` mode 0700, install/backup/restore both units, restart 4194 then 4196, check token-authenticated 4196 health, and leave Nginx without any direct 4196 upstream.

- [ ] **Step 2: Run deployment tests and confirm failure**

  Run: `node --test tests/agent-workflow-staging.test.mjs tests/deployment.test.mjs`.
  Expected: fail because production activation is not implemented.

- [ ] **Step 3: Implement two-unit activation and rollback**

  Use explicit paths:

  ```bash
  HUB_UNIT_FILE=/etc/systemd/system/ai-project-hub.service
  WORKFLOW_UNIT_FILE=/etc/systemd/system/ai-hub-agent-workflow.service
  WORKFLOW_ENV_FILE=/etc/ai-project-hub/agent-workflow.env
  WORKFLOW_HEALTH_URL=http://127.0.0.1:4196/health
  ```

  Both Hub and workflow units must read the same workflow env file. Make the workflow unit require it rather than using optional `EnvironmentFile=-...`. Backup and restore prior unit files and enabled/running state. A failed activation must restore the old release and both services. Keep Nginx routing only to 4194.

- [ ] **Step 4: Verify shell and deployment tests**

  Run:

  ```powershell
  bash -n deploy/deploy.sh
  node --test tests/agent-workflow-staging.test.mjs tests/deployment.test.mjs
  npm test
  ```

  Expected: syntax check and all tests pass.

- [ ] **Step 5: Commit deployment activation**

  Run: `git add deploy tests README.md && git commit -m "feat(deploy): activate private workflow runtime"`.

## Task 7: Install local Codex Skills, verify the whole release, and publish

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/fresh-clone.yml`
- Local install target: `C:\Users\Michael Song\.codex\skills\<six-skill-id>`

- [ ] **Step 1: Make CI run for this branch and cover workflow packages**

  Add `codex/aihub-workflow-skills` to the push branch filter and keep the existing fresh-clone install, build, verify, security scan, and E2E gates.

- [ ] **Step 2: Install and validate all six Codex Skills locally**

  Copy each tracked Skill directory without deleting unrelated user Skills. Validate each installed `SKILL.md` with `quick_validate.py` and confirm all six names appear under `C:\Users\Michael Song\.codex\skills`.

- [ ] **Step 3: Run complete local verification**

  Run:

  ```powershell
  npm run security:scan
  npm run workspace:build
  npm run workspace:verify
  npm run e2e
  npm run security:scan
  git diff --check origin/main...HEAD
  git status --short
  ```

  Expected: all commands exit 0 and the worktree contains only the intended plan/implementation commits.

- [ ] **Step 4: Perform spec and code-quality review**

  Review every explicit scope decision above, then review the complete `origin/main...HEAD` diff for privacy, auth, rollback, error sanitization, input bounds, and TraceSheet data leakage. Fix and re-review every finding before publishing.

- [ ] **Step 5: Push and create a GitHub PR**

  Run:

  ```powershell
  git push --set-upstream origin codex/aihub-workflow-skills
  gh pr create --repo brainxai-tech/AI-HUB --base main --head codex/aihub-workflow-skills --title "feat: productionize AI HUB workflow skills" --body-file <generated-pr-body>
  gh pr checks --repo brainxai-tech/AI-HUB --watch
  ```

  Expected: the remote branch and PR point to the exact local HEAD and Fresh clone CI is green.

## Task 8: Deploy the exact GitHub commit and verify production

**Files:**
- Release artifact: `%TEMP%\ai-project-hub-<full-commit>.tar.gz`
- Server release: `/opt/ai-project-hub/releases/<full-commit>`

- [ ] **Step 1: Verify SSH host identity and preflight the server**

  Use the supplied ED25519 key with `IdentitiesOnly=yes`; accept no changed host key. Check Node, Nginx, current release, `ai-project-hub`, `ai-hub-shared-static-api`, available disk, and the rollback target.

- [ ] **Step 2: Create and verify the Git-backed artifact**

  Create the archive with `git archive HEAD`, calculate SHA-256 locally, upload it, calculate SHA-256 remotely, and stop if hashes differ.

- [ ] **Step 3: Perform the first two-stage activation**

  The first command uses the old deploy script to unpack and switch the release. The second command uses the newly activated deploy script to install and start the workflow unit:

  ```bash
  sudo /opt/ai-project-hub/current/deploy/deploy.sh /home/admin/staging/releases/ai-project-hub-<commit>.tar.gz <commit>
  sudo /opt/ai-project-hub/current/deploy/deploy.sh --activate <commit>
  ```

- [ ] **Step 4: Verify production without printing secrets**

  Prove the current symlink and `.release-commit` equal GitHub HEAD, both services are active, 4196 listens only on loopback, direct unauthenticated 4196 access is rejected, token-authenticated health and six-Skill discovery pass inside a root shell, `/hub/workflows/` loads, public workflow API access without admin authorization is rejected, Nginx has no direct 4196 proxy, and recent journals contain no secret or fatal error.

- [ ] **Step 5: Record the release result**

  Report the Git commit, PR URL, CI result, server release path, service states, six discovered Skill ids, production URL/tunnel command, and rollback commit. Delete the local temporary archive after verification; retain the remote artifact and prior release for rollback.
