const state = {
  scenarios: [],
  providers: [],
  hubUrl: "/hub/#models",
  sceneId: "interview",
  provider: "deepseek",
  model: "",
  level: "B1",
  tone: "supportive",
  objective: "",
  messages: [],
  busy: false,
  report: null
};

const dom = {
  sceneList: document.querySelector("#sceneList"),
  sceneMeta: document.querySelector("#sceneMeta"),
  stageTitle: document.querySelector("#stage-title"),
  statusPill: document.querySelector("#statusPill"),
  conversation: document.querySelector("#conversation"),
  replyForm: document.querySelector("#replyForm"),
  replyInput: document.querySelector("#replyInput"),
  startButton: document.querySelector("#startButton"),
  hintButton: document.querySelector("#hintButton"),
  sendButton: document.querySelector("#sendButton"),
  providerSelect: document.querySelector("#providerSelect"),
  modelSelect: document.querySelector("#modelSelect"),
  configState: document.querySelector("#configState"),
  configLink: document.querySelector("#configLink"),
  levelGroup: document.querySelector("#levelGroup"),
  toneGroup: document.querySelector("#toneGroup"),
  objectiveInput: document.querySelector("#objectiveInput"),
  evaluateButton: document.querySelector("#evaluateButton"),
  reportPanel: document.querySelector("#reportPanel")
};

init().catch((error) => {
  setStatus(error.message || "载入失败", true);
});

async function init() {
  const [scenariosData, providersData] = await Promise.all([getJson("api/scenarios"), getJson("api/providers")]);
  state.scenarios = scenariosData.scenarios;
  state.providers = providersData.providers;
  state.hubUrl = providersData.hubUrl || state.hubUrl;
  dom.configLink.href = state.hubUrl;

  bindEvents();
  chooseInitialProvider();
  renderProviderOptions();
  selectScene(state.sceneId);
  render();
}

function bindEvents() {
  dom.replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendReply();
  });
  dom.startButton.addEventListener("click", startScene);
  dom.hintButton.addEventListener("click", getHint);
  dom.evaluateButton.addEventListener("click", evaluateSession);
  dom.providerSelect.addEventListener("change", () => {
    state.provider = dom.providerSelect.value;
    chooseDefaultModel();
    renderModelOptions();
    render();
  });
  dom.modelSelect.addEventListener("change", () => {
    state.model = dom.modelSelect.value;
    render();
  });
  dom.objectiveInput.addEventListener("input", () => {
    state.objective = dom.objectiveInput.value.trim();
  });
  dom.levelGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-level]");
    if (!button) return;
    state.level = button.dataset.level;
    updateSegmented(dom.levelGroup, "level", state.level);
  });
  dom.toneGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tone]");
    if (!button) return;
    state.tone = button.dataset.tone;
    updateSegmented(dom.toneGroup, "tone", state.tone);
  });
}

function chooseInitialProvider() {
  const configured = state.providers.find(isProviderReady);
  state.provider = configured?.id || state.providers[0]?.id || "deepseek";
  chooseDefaultModel();
}

function chooseDefaultModel() {
  const provider = getProvider();
  const enabledModels = getEnabledModels(provider);
  state.model = enabledModels[0] || provider?.defaultModel || provider?.models?.[0] || "";
}

function renderProviderOptions() {
  dom.providerSelect.textContent = "";
  state.providers.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label || provider.name || provider.id;
    option.disabled = !isProviderReady(provider);
    dom.providerSelect.append(option);
  });
  dom.providerSelect.value = state.provider;
  renderModelOptions();
}

function renderModelOptions() {
  const provider = getProvider();
  const ready = isProviderReady(provider);
  const models = ready ? getEnabledModels(provider) : provider?.models || [];

  dom.modelSelect.textContent = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    dom.modelSelect.append(option);
  });

  if (!models.includes(state.model)) {
    state.model = models[0] || "";
  }
  dom.modelSelect.value = state.model;
  renderConfigState();
}

function renderConfigState() {
  const provider = getProvider();
  const ready = isProviderReady(provider);
  const enabledCount = getEnabledModels(provider).length;

  dom.configState.className = `config-state${ready ? " ready" : " blocked"}`;
  if (ready) {
    dom.configState.textContent = `${provider.label || provider.name} 已接入，当前可选 ${enabledCount || 1} 个模型。`;
    setStatus(`${provider.label || provider.name} 已就绪`, false);
    return;
  }

  dom.configState.textContent = "请先在 Hub 统一模型配置中保存 API Key 并启用模型。";
  setStatus("等待 Hub 模型配置", true);
}

function selectScene(sceneId) {
  state.sceneId = sceneId;
  state.messages = [];
  state.report = null;
  const scenario = getScenario();
  state.objective = scenario.goal;
  dom.objectiveInput.value = scenario.goal;
  renderSceneButtons();
  render();
}

function renderSceneButtons() {
  dom.sceneList.textContent = "";
  state.scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scene-button${scenario.id === state.sceneId ? " active" : ""}`;
    button.dataset.sceneId = scenario.id;
    const title = document.createElement("strong");
    title.textContent = scenario.titleZh;
    const summary = document.createElement("span");
    summary.textContent = `${scenario.role} / ${scenario.goal}`;
    button.append(title, summary);
    button.addEventListener("click", () => selectScene(scenario.id));
    dom.sceneList.append(button);
  });
}

function render() {
  const scenario = getScenario();
  dom.sceneMeta.textContent = `${scenario.role} / ${scenario.userRole}`;
  dom.stageTitle.textContent = scenario.titleZh;
  renderMessages();
  renderReport();
  renderConfigState();
  setBusy(state.busy);
}

function renderMessages() {
  dom.conversation.textContent = "";
  if (!state.messages.length) {
    const empty = createMessage("assistant", "Stage", getScenario().opening);
    dom.conversation.append(empty);
    return;
  }
  state.messages.forEach((message) => {
    const label = message.kind === "hint" ? "Hint" : message.role === "user" ? "You" : getScenario().role;
    dom.conversation.append(createMessage(message.role, label, message.content, message.kind));
  });
  dom.conversation.scrollTop = dom.conversation.scrollHeight;
}

function createMessage(role, label, text, kind = "") {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${kind === "hint" ? "hint" : role}`;
  const small = document.createElement("small");
  small.textContent = label;
  const content = document.createElement("div");
  content.textContent = text;
  wrapper.append(small, content);
  return wrapper;
}

function renderReport() {
  dom.reportPanel.textContent = "";
  if (!state.report) {
    dom.reportPanel.className = "report-empty";
    dom.reportPanel.textContent = "还没有测评报告。";
    return;
  }
  dom.reportPanel.className = "";
  const score = document.createElement("div");
  score.className = "score-ring";
  score.style.setProperty("--score", `${state.report.overallScore}%`);
  score.textContent = `${state.report.overallScore}`;

  const cefr = document.createElement("p");
  cefr.className = "eyebrow";
  cefr.textContent = `CEFR estimate: ${state.report.cefrEstimate}`;

  const subscores = document.createElement("div");
  subscores.className = "subscores";
  Object.entries(state.report.subscores).forEach(([name, value]) => {
    const row = document.createElement("div");
    row.className = "subscore";
    const label = document.createElement("span");
    label.textContent = labelize(name);
    const number = document.createElement("strong");
    number.textContent = String(value);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.style.width = `${value}%`;
    bar.append(fill);
    row.append(label, number, bar);
    subscores.append(row);
  });

  const lists = document.createElement("div");
  lists.className = "text-list";
  lists.append(
    renderList("Strengths", state.report.strengths),
    renderCorrections(state.report.corrections),
    renderList("Better replies", state.report.betterReplies),
    renderList("Next practice", state.report.nextPractice)
  );

  dom.reportPanel.append(score, cefr, subscores, lists);
}

function renderList(title, items) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  (items.length ? items : ["None yet."]).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  section.append(heading, list);
  return section;
}

function renderCorrections(items) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Corrections";
  section.append(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "eyebrow";
    empty.textContent = "None yet.";
    section.append(empty);
    return section;
  }
  items.forEach((item) => {
    const block = document.createElement("div");
    block.className = "correction";
    const original = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = item.original;
    original.append(strong);
    const issue = document.createElement("p");
    issue.textContent = item.issue;
    const improved = document.createElement("p");
    improved.textContent = item.improved;
    block.append(original, issue, improved);
    section.append(block);
  });
  return section;
}

async function startScene() {
  const scenario = getScenario();
  state.messages = [{ role: "assistant", content: scenario.opening }];
  state.report = null;
  dom.replyInput.value = scenario.starters?.[0] || "";
  setStatus("场景已开始", false);
  render();
}

async function sendReply() {
  if (!canUseModel()) return;

  const text = dom.replyInput.value.trim();
  if (!text) return;
  const previousMessages = [...state.messages];
  state.messages.push({ role: "user", content: text });
  dom.replyInput.value = "";
  state.report = null;
  render();
  await withBusy(async () => {
    const data = await postJson("api/roleplay", buildPayload({ messages: previousMessages, userText: text }));
    state.messages.push({ role: "assistant", content: data.reply });
    setStatus(`${data.provider} / ${data.model}`, false);
  });
  render();
}

async function getHint() {
  if (!canUseModel()) return;

  await withBusy(async () => {
    const data = await postJson("api/hint", buildPayload({ messages: state.messages }));
    state.messages.push({ role: "assistant", kind: "hint", content: data.hint });
    setStatus("提示已生成", false);
  });
  renderMessages();
}

async function evaluateSession() {
  if (!canUseModel()) return;

  await withBusy(async () => {
    const data = await postJson("api/evaluate", buildPayload({ messages: state.messages }));
    state.report = data.report;
    setStatus(`测评已生成：${data.provider} / ${data.model}`, false);
  });
  render();
}

function buildPayload(extra = {}) {
  return {
    provider: state.provider,
    model: state.model,
    sceneId: state.sceneId,
    level: state.level,
    tone: state.tone,
    objective: state.objective,
    ...extra
  };
}

async function withBusy(action) {
  state.busy = true;
  setBusy(true);
  try {
    await action();
  } catch (error) {
    setStatus(error.message || "请求失败", true);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

function setBusy(isBusy) {
  const disabledForModel = !isProviderReady(getProvider()) || !state.model;
  dom.replyInput.disabled = isBusy || disabledForModel;
  dom.startButton.disabled = isBusy;
  dom.hintButton.disabled = isBusy || disabledForModel;
  dom.sendButton.disabled = isBusy || disabledForModel;
  dom.evaluateButton.disabled = isBusy || disabledForModel || state.messages.length < 2;
  dom.providerSelect.disabled = isBusy;
  dom.modelSelect.disabled = isBusy || disabledForModel;
  if (isBusy) dom.statusPill.textContent = "模型生成中...";
}

function canUseModel() {
  const ready = isProviderReady(getProvider()) && state.model;
  if (!ready) {
    setStatus("请先在 Hub 统一模型配置中保存 API Key 并启用模型。", true);
  }
  return ready;
}

function setStatus(text, isError) {
  dom.statusPill.textContent = text;
  dom.statusPill.style.background = isError ? "#fff0e8" : "#eaf4ef";
  dom.statusPill.style.color = isError ? "#9d3d25" : "#0c4e4e";
}

function getScenario() {
  return state.scenarios.find((scenario) => scenario.id === state.sceneId) || state.scenarios[0];
}

function getProvider() {
  return state.providers.find((provider) => provider.id === state.provider) || state.providers[0];
}

function getEnabledModels(provider) {
  if (!provider) return [];
  return Array.isArray(provider.enabledModels) && provider.enabledModels.length ? provider.enabledModels : provider.models || [];
}

function isProviderReady(provider) {
  return Boolean(provider?.enabled && provider?.configured && getEnabledModels(provider).length);
}

function updateSegmented(group, key, value) {
  group.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset[key] === value);
  });
}

function labelize(name) {
  return name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

async function getJson(url) {
  const response = await fetch(url);
  return parseApiResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "请求失败");
  }
  return data;
}
