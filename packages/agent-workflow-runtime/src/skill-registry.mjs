import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { WorkflowError } from "./errors.mjs";

const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORKFLOW_ITEM_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SkillRegistry {
  constructor(skillsRoot) {
    if (!skillsRoot) throw new TypeError("Skills root is required.");
    this.skillsRoot = path.resolve(skillsRoot);
    this.skills = new Map();
    this.adapters = new Map();
  }

  async load() {
    this.skills.clear();
    this.adapters.clear();
    const root = await realpath(this.skillsRoot);
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const skillRoot = path.join(root, entry.name);
      const manifestPath = path.join(skillRoot, "agent-skill.json");
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw new WorkflowError("INVALID_SKILL_MANIFEST", `无法读取 Skill：${entry.name}`, 500);
      }
      validateManifest(manifest, entry.name);
      await validateSkillMarkdown(skillRoot, manifest.id);
      const adapterPath = await safeAdapterPath(skillRoot, manifest.adapter);
      this.skills.set(manifest.id, Object.freeze({ ...manifest, root: skillRoot }));
      this.adapters.set(manifest.id, adapterPath);
    }

    if (!this.skills.size) {
      throw new WorkflowError("NO_SKILLS", "没有发现可加载的 AI HUB Skill。", 500);
    }
    return this;
  }

  list() {
    return [...this.skills.values()].map(publicSkill);
  }

  get(id) {
    const skill = this.skills.get(id);
    if (!skill) throw new WorkflowError("SKILL_NOT_FOUND", "没有找到指定的 Skill。", 404);
    return skill;
  }

  async adapter(id) {
    this.get(id);
    const module = await import(`${pathToFileURL(this.adapters.get(id)).href}?v=1`);
    if (!module.adapter || typeof module.adapter.start !== "function") {
      throw new WorkflowError("INVALID_SKILL_ADAPTER", `Skill ${id} 缺少 start 适配器。`, 500);
    }
    return module.adapter;
  }
}

function validateManifest(manifest, directoryName) {
  if (!manifest || typeof manifest !== "object") throw new Error("Skill manifest must be an object.");
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported Skill schema: ${manifest.schemaVersion}`);
  if (!SKILL_ID_PATTERN.test(manifest.id || "") || manifest.id !== directoryName) {
    throw new Error(`Skill id must match its directory: ${directoryName}`);
  }
  if (typeof manifest.projectId !== "string" || !manifest.projectId.trim()) {
    throw new Error(`Skill ${manifest.id} is missing projectId.`);
  }
  if (typeof manifest.adapter !== "string" || !manifest.adapter.startsWith("scripts/")) {
    throw new Error(`Skill ${manifest.id} adapter must live in scripts/.`);
  }
  if (!manifest.workflow || typeof manifest.workflow.id !== "string" || !manifest.workflow.id.trim()) {
    throw new Error(`Skill ${manifest.id} is missing workflow metadata.`);
  }
  if (!Number.isInteger(manifest.workflow.version) || manifest.workflow.version < 1) {
    throw new Error(`Skill ${manifest.id} workflow version must be a positive integer.`);
  }
  for (const field of ["steps", "checkpoints", "actions"]) {
    validateWorkflowItems(manifest.id, field, manifest.workflow[field]);
  }
}

function validateWorkflowItems(skillId, field, items) {
  if (!Array.isArray(items)) {
    throw new Error(`Skill ${skillId} workflow ${field} must be an array.`);
  }
  if (items.some((item) => typeof item !== "string" || !WORKFLOW_ITEM_PATTERN.test(item))) {
    throw new Error(`Skill ${skillId} workflow ${field} must contain only kebab-case identifiers.`);
  }
}

async function validateSkillMarkdown(skillRoot, id) {
  const markdown = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1]?.match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
  if (name !== id) throw new Error(`SKILL.md name must match ${id}.`);
}

async function safeAdapterPath(skillRoot, relativePath) {
  if (path.isAbsolute(relativePath)) throw new Error("Skill adapter path must be relative.");
  const resolved = await realpath(path.resolve(skillRoot, relativePath));
  const root = `${await realpath(skillRoot)}${path.sep}`;
  if (!resolved.startsWith(root) || !resolved.endsWith(".mjs")) {
    throw new Error("Skill adapter escapes its package or is not an .mjs module.");
  }
  return resolved;
}

function publicSkill(skill) {
  return {
    id: skill.id,
    projectId: skill.projectId,
    title: skill.title,
    description: skill.description,
    workflow: skill.workflow,
    knowledge: skill.knowledge || { mode: "none" },
  };
}
