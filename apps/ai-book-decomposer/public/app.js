const state = {
  providers: [],
  modelSelection: null,
  inputMode: "excerpt",
  activeTab: "chapterMap",
  analysis: null,
  markdown: "",
  isGenerating: false,
};

const labels = {
  excerpt: "摘录",
  title: "书名补充",
  toc: "目录",
  notes: "笔记",
  chapterMap: "章节地图",
  coreIdeas: "核心观点",
  actionList: "行动清单",
  counterArguments: "反方观点",
  questions: "继续追问",
  warnings: "风险提醒",
};

const fields = {
  chapterMap: ["chapter", "role", "keyPoints", "evidence"],
  coreIdeas: ["title", "detail", "whyItMatters", "boundary"],
  actionList: ["action", "scenario", "priority", "firstStep"],
  counterArguments: ["argument", "rationale", "whenValid"],
};

const fieldLabels = {
  chapter: "章节",
  role: "作用",
  keyPoints: "要点",
  evidence: "依据",
  title: "观点",
  detail: "说明",
  whyItMatters: "意义",
  boundary: "边界",
  action: "行动",
  scenario: "场景",
  priority: "优先级",
  firstStep: "第一步",
  argument: "质疑",
  rationale: "理由",
  whenValid: "成立条件",
};

const els = {
  form: document.querySelector("#analysisForm"),
  provider: document.querySelector("#providerSelect"),
  model: document.querySelector("#modelSelect"),
  refreshModels: document.querySelector("#refreshModelsButton"),
  testProvider: document.querySelector("#testProviderButton"),
  title: document.querySelector("#titleInput"),
  content: document.querySelector("#contentInput"),
  contentLabel: document.querySelector("#contentLabel"),
  depth: document.querySelector("#depthSelect"),
  orientation: document.querySelector("#orientationSelect"),
  status: document.querySelector("#formStatus"),
  modelGate: document.querySelector("#modelGate"),
  connectionStatus: document.querySelector("#connectionStatus"),
  generate: document.querySelector("#generateButton"),
  copy: document.querySelector("#copyMarkdownButton"),
  download: document.querySelector("#downloadMarkdownButton"),
  resultContent: document.querySelector("#resultContent"),
  sourceBoundary: document.querySelector("#sourceBoundary"),
  confidence: document.querySelector("#confidenceBadge"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  tabButtons: [...document.querySelectorAll("[data-tab]")],
};

init();

async function init() {
  bindEvents();
  setInputMode(state.inputMode);
  await loadProviders();
}

function bindEvents() {
  els.provider.addEventListener("change", () => {
    renderModels();
    updateSelectedModelStatus();
  });
  els.model.addEventListener("change", saveProjectModel);
  els.refreshModels.addEventListener("click", () => loadProviders({ force: true }));
  els.testProvider.addEventListener("click", testProvider);
  els.form.addEventListener("submit", generateAnalysis);
  els.copy.addEventListener("click", copyMarkdown);
  els.download.addEventListener("click", downloadMarkdown);
  window.addEventListener("aihub:model-selection-changed", (event) => {
    if (event.detail?.projectId === "ai-book-decomposer") {
      applyModelSelection(event.detail);
    }
  });

  for (const button of els.modeButtons) {
    button.addEventListener("click", () => setInputMode(button.dataset.mode));
  }
  for (const button of els.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }
}

async function loadProviders(options = {}) {
  const keepProvider = options.force ? els.provider.value : "";

  setModelGate("正在读取 Hub 模型配置。", "loading");
  setControlsEnabled(false);

  try {
    const [response, selectionResponse] = await Promise.all([
      fetch("api/providers", { cache: "no-store" }),
      fetch("api/model-selection", { cache: "no-store" }),
    ]);
    const [body, selection] = await Promise.all([
      response.json(),
      selectionResponse.json(),
    ]);
    if (!response.ok) throw new Error(body?.error?.message || "模型目录读取失败。");
    if (!selectionResponse.ok) {
      throw new Error(selection?.error?.message || "项目模型选择读取失败。");
    }
    state.modelSelection = selection;
    state.providers = normalizeProviders(body.providers || []);
    syncProviderSelection();
    renderProviders(keepProvider);
    updateModelGate();
  } catch {
    state.providers = [];
    renderProviders();
    setModelGate("无法读取 Hub 模型配置。请确认 AI Hub 正在运行。", "error");
    setStatus("模型配置读取失败。", "error");
  }
}

function normalizeProviders(providers) {
  return providers.map((provider) => {
    const enabledModels = Array.isArray(provider.enabledModels)
      ? provider.enabledModels.filter(Boolean)
      : [];
    const models = enabledModels.length
      ? enabledModels
      : Array.isArray(provider.models)
        ? provider.models.filter(Boolean)
        : [];
    return {
      ...provider,
      models: Array.from(new Set(models)),
    };
  });
}

function renderProviders(preferredProvider = "") {
  els.provider.replaceChildren();
  const providers = usableProviders();

  if (!providers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Hub 暂无可用模型";
    els.provider.append(option);
    renderModels();
    return;
  }

  for (const provider of providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.name;
    option.selected = provider.id === preferredProvider;
    els.provider.append(option);
  }

  if (preferredProvider && !providers.some((provider) => provider.id === preferredProvider)) {
    els.provider.selectedIndex = 0;
  }

  renderModels();
}

function renderModels() {
  const provider = currentProvider();
  els.model.replaceChildren();

  if (!provider) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "先启用供应商";
    els.model.append(option);
    updateSelectedModelStatus();
    return;
  }

  if (!provider.defaultModel) {
    const placeholder = new Option("请选择本项目模型", "", true, true);
    placeholder.disabled = true;
    els.model.append(placeholder);
  }

  for (const model of provider.models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    option.selected = model === provider.defaultModel;
    els.model.append(option);
  }

  updateSelectedModelStatus();
}

function updateModelGate() {
  const providers = usableProviders();
  if (!providers.length) {
    setControlsEnabled(false);
    setModelGate(
      "Hub 还没有读取到可用模型。请检查统一模型配置中的 API Key 和模型目录。",
      "error",
    );
    setStatus("没有读取到 API Key 对应的模型目录。", "error");
    return;
  }

  setControlsEnabled(true);
  if (!hasProjectModelSelection()) {
    els.testProvider.disabled = true;
    els.generate.disabled = true;
    setModelGate(
      `API Key 已连接，检测到 ${state.modelSelection?.models?.length || providers[0].models.length} 个可用模型。请在本页或顶部为当前项目选择模型。`,
      "loading",
    );
    setStatus("请选择一个模型；保存后只对 AI 读书拆解器生效。", "");
    return;
  }
  const providerNames = providers.map((provider) => provider.name).join("、");
  setModelGate(`本项目已选择：${state.modelSelection.model}（${providerNames}）。`, "success");
  setStatus("模型选择已保存，可以开始拆解。", "success");
}

function updateSelectedModelStatus() {
  const provider = currentProvider();
  const model = els.model.value;

  if (!provider || !model) {
    els.connectionStatus.textContent = "等待 Hub 配置";
    els.connectionStatus.dataset.state = "idle";
    return;
  }

  els.connectionStatus.textContent = `${provider.name} · ${model}`;
  els.connectionStatus.dataset.state = "ready";
}

async function saveProjectModel() {
  const model = els.model.value;
  if (!model || model === state.modelSelection?.model) {
    updateSelectedModelStatus();
    return;
  }

  els.model.disabled = true;
  els.testProvider.disabled = true;
  els.generate.disabled = true;
  setStatus("正在把模型保存到 AI 读书拆解器…");
  try {
    const response = await fetch("api/model-selection", {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ model }),
      cache: "no-store",
    });
    const selection = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(selection?.error?.message || `模型保存失败（HTTP ${response.status}）。`);
    }
    applyModelSelection(selection);
    window.dispatchEvent(new CustomEvent("aihub:model-selection-changed", { detail: selection }));
  } catch (error) {
    syncProviderSelection();
    renderModels();
    setStatus(error instanceof Error ? error.message : "模型保存失败。", "error");
  } finally {
    els.model.disabled = false;
    updateModelGate();
  }
}

function applyModelSelection(selection) {
  state.modelSelection = selection;
  syncProviderSelection();
  renderProviders(selection.provider);
  updateModelGate();
  updateSelectedModelStatus();
}

function syncProviderSelection() {
  for (const provider of state.providers) {
    provider.defaultModel = provider.id === state.modelSelection?.provider
      ? state.modelSelection.model || ""
      : "";
  }
}

function hasProjectModelSelection() {
  return Boolean(state.modelSelection?.model);
}

function setInputMode(mode) {
  state.inputMode = mode;
  for (const button of els.modeButtons) {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
  els.contentLabel.textContent = labels[mode] || "内容";
  els.content.placeholder =
    mode === "title"
      ? "可以补充作者、版本、你关心的问题；留空时只做预拆解"
      : `粘贴${labels[mode] || "内容"}`;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  for (const button of els.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  renderCurrentTab();
}

async function testProvider() {
  const payload = basePayload();
  if (!payload.provider || !payload.model) {
    setStatus("请先为 AI 读书拆解器选择并保存模型。", "error");
    return;
  }

  setBusy(true, "正在测试 Hub 模型...");
  try {
    const body = await postJson("api/test-provider", payload);
    els.connectionStatus.textContent = body.message || "Hub 模型连接成功";
    els.connectionStatus.dataset.state = "ready";
    setStatus("连接测试完成。", "success");
  } catch (error) {
    els.connectionStatus.textContent = "连接失败";
    els.connectionStatus.dataset.state = "error";
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function generateAnalysis(event) {
  event.preventDefault();
  const payload = {
    ...basePayload(),
    inputMode: state.inputMode,
    title: els.title.value.trim(),
    content: els.content.value.trim(),
    depth: els.depth.value,
    orientation: els.orientation.value,
    outputLanguage: "zh-CN",
  };

  if (!payload.provider || !payload.model) {
    setStatus("请先为 AI 读书拆解器选择并保存模型。", "error");
    return;
  }
  if (!payload.title && !payload.content) {
    setStatus("请至少输入书名或内容。", "error");
    return;
  }

  setBusy(true, "正在拆解...");
  renderLoading();

  try {
    const body = await postJson("api/analyze", payload);
    state.analysis = body.analysis;
    state.markdown = body.markdown || "";
    els.copy.disabled = !state.markdown;
    els.download.disabled = !state.markdown;
    renderAnalysis();
    setStatus("拆解完成。", "success");
  } catch (error) {
    renderError(error.message);
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function basePayload() {
  return {
    provider: els.provider.value,
    model: els.model.value,
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "请求失败。");
  }
  return body;
}

function renderAnalysis() {
  const analysis = state.analysis;
  els.sourceBoundary.textContent = analysis?.sourceBoundary || "资料边界未标注";
  els.confidence.textContent = analysis?.confidence || "-";
  els.confidence.dataset.level = analysis?.confidence || "LOW";
  renderCurrentTab();
}

function renderCurrentTab() {
  if (!state.analysis) {
    renderEmpty();
    return;
  }
  const value = state.analysis[state.activeTab] || [];
  const container = document.createElement("div");
  container.className = "result-list";

  if (!value.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("h3");
    title.textContent = "暂无内容";
    const copy = document.createElement("p");
    copy.textContent = "模型没有返回这个模块。";
    empty.append(title, copy);
    container.append(empty);
  } else {
    for (const item of value) {
      container.append(renderResultItem(item, state.activeTab));
    }
  }

  if (state.analysis.rawText && state.activeTab === "warnings") {
    container.append(renderRawOutput(state.analysis.rawText));
  }

  els.resultContent.replaceChildren(container);
}

function renderResultItem(item, tab) {
  const article = document.createElement("article");
  article.className = "result-item";

  if (typeof item === "string") {
    const heading = document.createElement("h3");
    heading.textContent = item;
    article.append(heading);
    return article;
  }

  const orderedFields = fields[tab] || Object.keys(item);
  const headingKey = orderedFields.find((key) => item[key]) || Object.keys(item)[0];
  const heading = document.createElement("h3");
  heading.textContent = stringifyValue(item[headingKey] || labels[tab]);
  article.append(heading);

  const dl = document.createElement("dl");
  for (const key of orderedFields) {
    if (key === headingKey || item[key] == null || item[key] === "") continue;
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = fieldLabels[key] || key;
    dd.textContent = stringifyValue(item[key]);
    row.append(dt, dd);
    dl.append(row);
  }
  article.append(dl);
  return article;
}

function renderRawOutput(text) {
  const details = document.createElement("details");
  details.className = "raw-output";
  const summary = document.createElement("summary");
  summary.textContent = "模型原文";
  const pre = document.createElement("pre");
  pre.textContent = text;
  details.append(summary, pre);
  return details;
}

function renderLoading() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const visual = document.createElement("div");
  visual.className = "empty-visual";
  const title = document.createElement("h3");
  title.textContent = "正在拆解";
  const copy = document.createElement("p");
  copy.textContent = "模型返回后会自动填充结果。";
  wrapper.append(visual, title, copy);
  els.resultContent.replaceChildren(wrapper);
}

function renderEmpty() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const visual = document.createElement("div");
  visual.className = "empty-visual";
  const title = document.createElement("h3");
  title.textContent = "准备拆解";
  const copy = document.createElement("p");
  copy.textContent = "选择 Hub 已启用模型后，输入书名、目录、摘录或笔记。";
  wrapper.append(visual, title, copy);
  els.resultContent.replaceChildren(wrapper);
}

function renderError(message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const title = document.createElement("h3");
  title.textContent = "生成失败";
  const copy = document.createElement("p");
  copy.textContent = message;
  wrapper.append(title, copy);
  els.resultContent.replaceChildren(wrapper);
}

async function copyMarkdown() {
  if (!state.markdown) return;
  try {
    await navigator.clipboard.writeText(state.markdown);
    setStatus("已复制 Markdown。", "success");
  } catch {
    setStatus("复制失败，请使用下载。", "error");
  }
}

function downloadMarkdown() {
  if (!state.markdown) return;
  const title = state.analysis?.title || "book-analysis";
  const fileName = `${sanitizeFileName(title)}.md`;
  const blob = new Blob([state.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setBusy(isBusy, message = "") {
  state.isGenerating = isBusy;
  els.generate.disabled = isBusy || !usableProviders().length || !hasProjectModelSelection();
  els.testProvider.disabled = isBusy || !usableProviders().length || !hasProjectModelSelection();
  els.refreshModels.disabled = isBusy;
  if (message) setStatus(message);
}

function setControlsEnabled(isEnabled) {
  els.provider.disabled = !isEnabled;
  els.model.disabled = !isEnabled;
  els.testProvider.disabled = !isEnabled;
  els.generate.disabled = !isEnabled;
}

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `form-status ${type}`.trim();
}

function setModelGate(message, stateName) {
  els.modelGate.textContent = message;
  els.modelGate.dataset.state = stateName;
}

function usableProviders() {
  return state.providers.filter(
    (provider) => provider.enabled && provider.configured && provider.models.length,
  );
}

function currentProvider() {
  return usableProviders().find((provider) => provider.id === els.provider.value);
}

function stringifyValue(value) {
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join("；");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function sanitizeFileName(value) {
  return (
    String(value)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "book-analysis"
  );
}
