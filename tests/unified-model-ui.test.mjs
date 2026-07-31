import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const forbiddenVendors = /DeepSeek|Claude|Anthropic|Gemini|deepseek-|claude-|gemini-/i;

test("Hub discovery, configuration, and guide present GPT choices only", async () => {
  const [html, app, projects, configHtml, configScript, guideHtml, guideData, guideApp] = await Promise.all([
    read("public/index.html"),
    read("public/app.js"),
    read("public/projects.js"),
    read("public/key-config/index.html"),
    read("public/key-config/key-config.js"),
    read("public/models.html"),
    read("public/model-guide-data.js"),
    read("public/model-guide.js"),
  ]);

  for (const source of [html, app, projects, configHtml, configScript, guideHtml, guideApp]) {
    assert.doesNotMatch(source, forbiddenVendors);
    assert.doesNotMatch(source, /codex-auto-review/i);
    assert.doesNotMatch(source, /GPT\s*(?:\/|与)\s*Codex/i);
  }
  assert.match(html, /href="\/hub\/models\.html">了解模型差异/);
  assert.match(guideData, /gpt-5\.6-sol/);
  assert.match(app, /gpt-5\.3-codex-spark/);
  assert.match(projects, /gpt-5\.6-luna/);
  assert.match(projects, /gpt-5\.6-terra/);
  assert.match(app, /availableModels\.has\(project\.modelRecommendation\.model\)/);
  assert.match(configScript, /\^gpt-/);
  assert.match(guideApp, /providerOrder = \["OpenAI"\]/);
});

test("shared project shell removes legacy vendor controls and keeps only GPT models", async () => {
  const suiteShell = await read("public/suite-shell.js");

  assert.match(suiteShell, /forbiddenProviderPattern/);
  assert.match(suiteShell, /modelFamilyPattern/);
  assert.match(suiteShell, /sanitizeLegacyModelUi/);
  assert.match(suiteShell, /preservesModelReferenceUi/);
  assert.match(suiteShell, /projectId === "hub-model-atlas"/);
  assert.match(suiteShell, /if \(!preservesModelReferenceUi\) sanitizeLegacyModelUi\(\)/);
  assert.match(suiteShell, /if \(!preservesModelReferenceUi\) installModelPicker\(actions\)/);
  assert.match(suiteShell, /MutationObserver/);
  assert.match(suiteShell, /hideLegacyElement\(select\)/);
  assert.match(suiteShell, /state\.models\.filter/);
  assert.match(suiteShell, /\^gpt-/);
  assert.doesNotMatch(suiteShell, /option\.remove\(\)/);
  assert.doesNotMatch(suiteShell, /node\.nodeValue\s*=/);
  assert.doesNotMatch(suiteShell, /codex-auto-review/i);
  assert.doesNotMatch(suiteShell, /GPT\s*(?:\/|与)\s*Codex/i);
  assert.match(suiteShell, /统一默认/);
  assert.match(suiteShell, /可按项目调整/);
});

test("shared project shell hides legacy provider button grids instead of relabeling them as GPT", async () => {
  const [suiteShell, pickerStyles] = await Promise.all([
    read("public/suite-shell.js"),
    read("public/project-model-selector.css"),
  ]);

  assert.match(suiteShell, /legacyProviderControlPattern/);
  assert.match(suiteShell, /legacyUnifiedChoicePattern/);
  assert.match(suiteShell, /legacyProviderChoicePattern/);
  assert.match(suiteShell, /legacyModelFieldPattern/);
  assert.match(suiteShell, /hideLegacyProviderControls/);
  assert.match(suiteShell, /hideLegacyProviderGroups/);
  assert.match(suiteShell, /hideLegacyModelContainers/);
  assert.match(suiteShell, /hideLegacyProviderBadges/);
  assert.match(suiteShell, /provider-metric/);
  assert.match(suiteShell, /details > summary/);
  assert.match(suiteShell, /associatedLabelText/);
  assert.match(suiteShell, /\^\(\?:model\|模型\)/);
  assert.match(suiteShell, /hasNearbyLegacyControls/);
  assert.match(suiteShell, /hideLegacyElement/);
  assert.match(suiteShell, /\[role='radiogroup'\]/);
  assert.match(suiteShell, /legacyCopyPattern/);
  assert.match(suiteShell, /data-suite-legacy-provider-hidden/);
  assert.match(suiteShell, /element\.hidden = true/);
  assert.match(suiteShell, /closest\("\[data-suite-legacy-provider-hidden\]"\)/);
  assert.match(pickerStyles, /\[data-suite-legacy-provider-hidden\]/);
  assert.match(pickerStyles, /display:\s*none\s*!important/);
});

test("shared project shell loads the common design foundation for tools but excludes every game", async () => {
  const [suiteShell, toolFoundation, suiteTheme] = await Promise.all([
    read("public/suite-shell.js"),
    read("public/suite-tool-foundation.css"),
    read("public/suite-theme.css"),
  ]);

  assert.match(suiteShell, /gameProjectIds = new Set/);
  for (const gameId of [
    "ai-xiangqi-duel",
    "ai-chess-duel",
    "ai-go-duel",
    "fury-flock",
    "dice-estate-duel",
  ]) {
    assert.match(suiteShell, new RegExp(`"${gameId}"`));
  }
  assert.match(suiteShell, /inferSuiteKind/);
  assert.match(suiteShell, /function applySuiteIdentity/);
  assert.match(suiteShell, /applySuiteIdentity\(\)/);
  assert.match(suiteShell, /dataset\.suiteKind = suiteKind/);
  assert.match(suiteShell, /suiteKind === "tool"/);
  assert.match(suiteShell, /loadToolFoundationStyles/);
  assert.match(suiteShell, /suite-tool-foundation\.css\?v=20260730-signal-routing1/);
  assert.match(suiteShell, /firstSegment === "hub" && secondSegment === "dice-estate"/);

  assert.match(toolFoundation, /html\[data-suite-kind="tool"\]/);
  assert.match(toolFoundation, /--suite-tool-radius:\s*14px/);
  assert.match(toolFoundation, /--suite-tool-radius-lg:\s*16px/);
  assert.match(toolFoundation, /--suite-tool-font-display:/);
  assert.match(toolFoundation, /--suite-tool-route:/);
  assert.match(toolFoundation, /\.suite-topbar::after/);
  assert.match(toolFoundation, /:has\(\.suite-model-trigger:not\(\[hidden\]\)\)/);
  assert.match(toolFoundation, /data-suite-id="ai-counterfactual-life-simulator"/);
  assert.match(toolFoundation, /overflow-x:\s*clip/);
  assert.match(toolFoundation, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(toolFoundation, /white-space:\s*nowrap/);
  assert.match(toolFoundation, /\.suite-project > strong/);
  assert.match(toolFoundation, /\.source-pill/);
  assert.match(toolFoundation, /\.tarot-card\):not\(\.card-back\)/);
  assert.doesNotMatch(toolFoundation, /ai-xiangqi-duel|ai-chess-duel|ai-go-duel|fury-flock|dice-estate-duel/);
  assert.match(suiteTheme, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
});
