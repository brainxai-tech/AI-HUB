import path from "node:path";
import { fileURLToPath } from "node:url";

import { workflowRetentionDays } from "./src/config.mjs";
import { createWorkflowHttpServer } from "./src/http-api.mjs";
import { ProjectClient } from "./src/project-client.mjs";
import { FileRunStore } from "./src/run-store.mjs";
import { SkillRegistry } from "./src/skill-registry.mjs";
import { WorkflowRunner } from "./src/workflow-runner.mjs";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageRoot, "../..");
const skillsRoot = path.resolve(process.env.AIHUB_SKILLS_ROOT || path.join(repositoryRoot, "skills"));
const dataRoot = path.resolve(
  process.env.AIHUB_WORKFLOW_DATA_DIR || path.join(repositoryRoot, ".local-runtime", "workflow-runs"),
);
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4196);
const retentionDays = workflowRetentionDays(process.env);

const registry = await new SkillRegistry(skillsRoot).load();
const store = new FileRunStore(dataRoot, { retentionDays });
await store.initialize();
const runner = new WorkflowRunner({ registry, store, client: new ProjectClient() });
const server = createWorkflowHttpServer({ runner, registry });

server.listen(port, host, () => {
  console.log(JSON.stringify({
    ready: true,
    service: "ai-hub-agent-workflow-runtime",
    origin: `http://${host}:${port}`,
    skills: registry.list().map(({ id }) => id),
  }));
});
