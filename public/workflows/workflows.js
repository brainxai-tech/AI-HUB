const API_ROOT = "/hub/api/workflows";
const RECENT_RUNS_KEY = "aihub.workflow.recent-run-ids";
const MAX_RECENT_RUNS = 8;

let adminToken = "";
let activeSkillId = "coach-chinese-essay";
let currentRun = null;
let availableSkillIds = new Set();

const workflowForms = {
  "coach-chinese-essay": {
    title: "中文作文分阶段教练",
    summary: "审题、真实素材、提纲选择与成文讲评",
    start: {
      intro: "先提交题目要求；系统会在生成提纲前停下来收集学生自己的真实素材。",
      submitLabel: "开始作文辅导",
      fields: [
        textField("essay.prompt", "作文题目与完整材料", { type: "textarea", required: true, wide: true }),
        textField("essay.grade", "年级", { type: "select", required: true, options: ["初一", "初二", "初三", "高一", "高二", "高三"] }),
        textField("essay.genre", "文体", { type: "select", required: true, options: ["记叙文", "议论文", "材料作文"] }),
        textField("essay.targetLength", "目标字数", { type: "number", value: 800, min: 200, max: 3000, required: true }),
        textField("essay.scene", "使用场景", { value: "日常练习", placeholder: "日常练习 / 课堂作业 / 考前训练" }),
        textField("essay.includePunctuation", "字数包含标点", { type: "checkbox", checked: true, wide: true }),
      ],
    },
    checkpoints: {
      "collect-materials": {
        title: "补充真实素材",
        intro: "只填写学习者亲身经历；不要为了满足表单而编造事实。",
        submitLabel: "生成三套提纲",
        fields: [
          textField("materials.experience", "亲身经历", { type: "textarea", required: true, wide: true }),
          textField("materials.detail", "可观察细节", { type: "textarea", required: true, wide: true }),
          textField("materials.insight", "由此得到的感受或思考", { type: "textarea", required: true, wide: true }),
        ],
      },
      "select-outline": {
        title: "选择提纲",
        intro: "从运行数据的提纲候选中复制 outlineId。",
        submitLabel: "按此提纲成文",
        fields: [textField("outlineId", "提纲 ID", { required: true, wide: true })],
      },
    },
    actions: {},
  },
  "plan-weekly-meals": {
    title: "每周备餐闭环",
    summary: "生成周计划、换餐、执行记录与复盘",
    start: {
      intro: "根据人数、天数和约束生成有本地资料依据的每周备餐计划。",
      submitLabel: "生成本周计划",
      fields: [
        textField("profile.days", "计划天数", { type: "number", value: 7, min: 1, max: 14, required: true }),
        textField("profile.familySize", "用餐人数", { type: "number", value: 2, min: 1, max: 8, required: true }),
        textField("profile.targetCalories", "每日目标热量", { type: "number", value: 1800, min: 1000, max: 3200 }),
        textField("profile.allergies", "过敏原", { transform: "csv", placeholder: "花生, 牛奶" }),
        textField("profile.pantry", "现有食材", { transform: "csv", placeholder: "鸡蛋, 番茄", wide: true }),
      ],
    },
    checkpoints: {
      "weekly-execution": {
        title: "提交本周执行记录",
        intro: "executionState 使用 JSON 记录实际完成情况；系统会据此生成下周调整建议。",
        submitLabel: "完成周复盘",
        fields: [
          textField("executionState", "执行状态 JSON", { type: "textarea", transform: "json", value: "{\n  \"completedMeals\": [],\n  \"skippedMeals\": []\n}", required: true, wide: true }),
          textField("feedback", "补充反馈", { type: "textarea", wide: true }),
        ],
      },
    },
    actions: {
      "adjust-meal": {
        title: "调整一餐",
        intro: "保留原计划，仅针对指定 mealKey 生成调整记录。",
        submitLabel: "提交换餐要求",
        fields: [
          textField("mealKey", "餐次标识 mealKey", { required: true }),
          textField("reason", "调整原因", { required: true }),
          textField("constraints", "附加约束", { type: "textarea", placeholder: "例如：只用豆腐，不要辛辣", wide: true }),
        ],
      },
    },
  },
  "read-research-paper": {
    title: "论文证据阅读工作流",
    summary: "论文地图、原文检索、问答与复习",
    start: {
      intro: "粘贴论文正文或提供公开链接；每次解释都会保留实际检索到的原文段落引用。",
      submitLabel: "导入并建立论文地图",
      fields: [
        textField("source.kind", "资料类型", { type: "select", options: [{ value: "text", label: "粘贴正文" }, { value: "url", label: "URL / DOI / arXiv" }], required: true }),
        textField("userLevel", "阅读水平", { type: "select", options: [{ value: "beginner", label: "入门" }, { value: "graduate", label: "研究生" }, { value: "reviewer", label: "审稿人" }], required: true }),
        textField("outputLanguage", "输出语言", { type: "select", options: [{ value: "zh-CN", label: "中文" }, { value: "en", label: "English" }], required: true }),
        textField("model", "指定 GPT 型号（可选）", { placeholder: "留空使用项目默认型号" }),
        textField("source.value", "论文正文或链接", { type: "textarea", required: true, wide: true }),
      ],
    },
    checkpoints: {
      "paper-task": {
        title: "选择下一项阅读任务",
        intro: "可以连续做章节解释、证据问答或测验；勾选完成后结束本次阅读。",
        submitLabel: "执行阅读任务",
        fields: [
          textField("finish", "结束本次阅读", { type: "checkbox", wide: true }),
          textField("task", "任务", { type: "select", options: [{ value: "qa", label: "证据问答" }, { value: "section_explain", label: "章节解释" }, { value: "quiz", label: "复习测验" }] }),
          textField("sectionId", "章节 ID（章节解释时填写）"),
          textField("question", "问题或复习重点", { type: "textarea", wide: true }),
        ],
      },
    },
    actions: {},
  },
  "build-course-pack": {
    title: "课程教学包工作流",
    summary: "授权资料、教学包、检查与教师确认",
    start: {
      intro: "只提交有权使用的短摘录；系统会保留 sourceId，并在教师确认前停下。",
      submitLabel: "生成课程教学包",
      fields: [
        textField("request.topic", "课程主题", { required: true }),
        textField("request.audience", "授课对象", { required: true }),
        textField("request.durationMinutes", "课时（分钟）", { type: "number", value: 45, min: 10, max: 480, required: true }),
        textField("request.difficulty", "难度", { value: "基础" }),
        textField("request.teachingStyle", "教学方式", { value: "讲练结合" }),
        textField("request.quizCount", "测验题数", { type: "number", value: 5, min: 0, max: 50 }),
        textField("request.outputFormat", "输出形式", { type: "select", options: ["teaching_bundle", "word", "ppt", "mind_map"], required: true }),
        textField("request.includeExamples", "包含示例", { type: "checkbox", checked: true }),
        textField("request.extraRequirements", "其他要求", { type: "textarea", wide: true }),
        textField("knowledgeSources", "授权资料 JSON 数组", { type: "textarea", transform: "json", value: "[\n  {\"sourceId\": \"course-01\", \"title\": \"资料名称\", \"excerpt\": \"授权使用的短摘录\"}\n]", required: true, wide: true }),
      ],
    },
    checkpoints: {
      "teacher-review": {
        title: "教师审核",
        intro: "确认可用，或写明可验证的修改要求后重新生成。",
        submitLabel: "提交教师决定",
        fields: [
          textField("approved", "审核决定", { type: "select", transform: "boolean", options: [{ value: "true", label: "确认通过" }, { value: "false", label: "需要修改" }], required: true }),
          textField("revisionNotes", "修改要求", { type: "textarea", wide: true }),
        ],
      },
    },
    actions: {},
  },
  "review-legal-clause": {
    title: "合同条款审阅",
    summary: "风险解释、证据复核与律师审阅包",
    start: {
      intro: "这是模型辅助阅读，不是法律意见，也不代表已接入法域法规知识库。",
      submitLabel: "分析合同条款",
      fields: [
        textField("clauseText", "合同条款", { type: "textarea", required: true, wide: true }),
        textField("userRole", "你在合同中的身份", { value: "合同接收方", required: true }),
        textField("contractType", "合同类型", { value: "通用条款" }),
        textField("jurisdiction", "适用地区 / 法域", { value: "中国大陆", required: true }),
        textField("outputLanguage", "输出语言", { type: "select", options: [{ value: "zh-CN", label: "中文" }, { value: "en", label: "English" }], required: true }),
        textField("model", "指定 GPT 型号（可选）"),
        textField("reviewGoal", "本次关注点", { type: "textarea", wide: true }),
        textField("reviewerNotes", "初始复核备注", { type: "textarea", wide: true }),
      ],
    },
    checkpoints: {
      "analysis-review": {
        title: "复核分析结果",
        intro: "确认风险、证据片段与质量警告完整后，再准备律师审阅包。",
        submitLabel: "准备律师审阅包",
        fields: [
          textField("decision", "下一步", { type: "select", options: [{ value: "prepare-lawyer-review", label: "准备律师审阅包" }], required: true }),
          textField("reviewerNotes", "复核备注", { type: "textarea", wide: true }),
        ],
      },
      "legal-review": {
        title: "记录人工法律复核",
        intro: "这里只记录阅读结论，不使用“法律审核通过”措辞。",
        submitLabel: "完成审阅记录",
        fields: [
          textField("decision", "人工决定", { type: "select", options: [{ value: "approved-for-reading", label: "可作为阅读辅助" }, { value: "needs-lawyer", label: "需要律师进一步审查" }], required: true }),
          textField("reviewerNotes", "人工备注", { type: "textarea", required: true, wide: true }),
        ],
      },
    },
    actions: {
      reanalyze: {
        title: "补充上下文并重新分析",
        intro: "新增版本不会覆盖此前分析。",
        submitLabel: "创建新的分析版本",
        fields: [
          textField("additionalContext", "补充合同上下文", { type: "textarea", required: true, wide: true }),
          textField("reviewerNotes", "版本备注", { type: "textarea", wide: true }),
        ],
      },
    },
  },
  "operate-trace-sheet": {
    title: "TraceSheet 数据操作审批",
    summary: "只传元数据，浏览器预览并确定性执行",
    start: {
      intro: "不得粘贴 rows、cells 或 data。这里只提交文件名、工作表、字段名与行数。",
      submitLabel: "生成元数据计划",
      fields: [
        textField("goal", "数据处理目标", { type: "textarea", required: true, wide: true }),
        textField("context.activeSourceId", "主数据源 ID", { required: true }),
        textField("context.sources", "数据源元数据 JSON 数组", { type: "textarea", transform: "json", value: "[\n  {\"id\": \"source-01\", \"name\": \"订单表\", \"fileName\": \"orders.xlsx\", \"sheetName\": \"Sheet1\", \"columns\": [\"订单号\"], \"rowCount\": 100}\n]", required: true, wide: true }),
      ],
    },
    checkpoints: {
      "review-plan": {
        title: "审核变换计划",
        intro: "先在 TraceSheet 浏览器中完成差异预览；DEDUP 必须按高风险步骤确认。",
        submitLabel: "批准并等待执行回执",
        fields: [
          textField("approved", "批准计划", { type: "checkbox", required: true, wide: true }),
          textField("notes", "审核备注", { type: "textarea", wide: true }),
        ],
      },
      "execution-receipt": {
        title: "提交浏览器执行回执",
        intro: "只提交数量、版本 ID、警告和审计哈希，不要提交单元格内容。",
        submitLabel: "完成审计记录",
        fields: [
          textField("receipt.finalVersionId", "最终版本 ID", { required: true }),
          textField("receipt.auditHash", "审计哈希", { required: true }),
          textField("receipt.inputRows", "输入行数", { type: "number", min: 0, required: true }),
          textField("receipt.outputRows", "输出行数", { type: "number", min: 0, required: true }),
          textField("receipt.changedRows", "变化行数", { type: "number", min: 0, required: true }),
          textField("receipt.warnings", "警告", { transform: "csv", wide: true }),
        ],
      },
    },
    actions: {
      "revise-plan": {
        title: "修订计划",
        intro: "根据新增要求创建不可变的新计划版本。",
        submitLabel: "创建计划修订版",
        fields: [
          textField("goal", "修订后的目标", { type: "textarea", required: true, wide: true }),
          textField("notes", "修订原因", { type: "textarea", wide: true }),
        ],
      },
    },
  },
};

const elements = {
  unlockPanel: document.querySelector("#unlockPanel"),
  unlockForm: document.querySelector("#unlockForm"),
  adminTokenInput: document.querySelector("#adminTokenInput"),
  unlockStatus: document.querySelector("#unlockStatus"),
  workspace: document.querySelector("#workspace"),
  skillList: document.querySelector("#skillList"),
  skillAvailability: document.querySelector("#skillAvailability"),
  startFormContainer: document.querySelector("#startFormContainer"),
  openRunForm: document.querySelector("#openRunForm"),
  runIdInput: document.querySelector("#runIdInput"),
  recentRuns: document.querySelector("#recentRuns"),
  runEmpty: document.querySelector("#runEmpty"),
  runDetail: document.querySelector("#runDetail"),
  runStatusBadge: document.querySelector("#runStatusBadge"),
  runIdValue: document.querySelector("#runIdValue"),
  runStepValue: document.querySelector("#runStepValue"),
  runCheckpointValue: document.querySelector("#runCheckpointValue"),
  refreshRunButton: document.querySelector("#refreshRunButton"),
  retryRunButton: document.querySelector("#retryRunButton"),
  deleteRunButton: document.querySelector("#deleteRunButton"),
  checkpointContainer: document.querySelector("#checkpointContainer"),
  actionContainer: document.querySelector("#actionContainer"),
  eventList: document.querySelector("#eventList"),
  runJson: document.querySelector("#runJson"),
  workspaceStatus: document.querySelector("#workspaceStatus"),
};

elements.unlockForm.addEventListener("submit", unlockWorkspace);
elements.openRunForm.addEventListener("submit", openRunFromForm);
elements.refreshRunButton.addEventListener("click", refreshCurrentRun);
elements.retryRunButton.addEventListener("click", retryCurrentRun);
elements.deleteRunButton.addEventListener("click", deleteCurrentRun);
renderSkillList();
selectSkill(activeSkillId);
renderRecentRuns();

async function unlockWorkspace(event) {
  event.preventDefault();
  setStatus(elements.unlockStatus, "正在验证…");
  const candidate = elements.adminTokenInput.value.trim();
  elements.adminTokenInput.value = "";
  adminToken = candidate;
  try {
    await loadAvailableSkills();
    elements.unlockPanel.hidden = true;
    elements.workspace.hidden = false;
    setStatus(elements.unlockStatus, "");
    setStatus(elements.workspaceStatus, "管理员身份已验证。", "success");
  } catch (error) {
    adminToken = "";
    setStatus(elements.unlockStatus, error.message || "管理员口令验证失败。", "error");
    elements.adminTokenInput.focus();
  }
}

async function loadAvailableSkills() {
  const payload = await workflowRequest("/skills");
  availableSkillIds = new Set((payload.skills || []).map((skill) => skill.id));
  renderSkillList();
  selectSkill(activeSkillId);
  setStatus(elements.workspaceStatus, `已发现 ${availableSkillIds.size} 个可运行 Skill。`, "success");
}

function renderSkillList() {
  const fragment = document.createDocumentFragment();
  Object.entries(workflowForms).forEach(([skillId, definition], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill-card";
    button.dataset.skillId = skillId;
    button.setAttribute("aria-pressed", String(skillId === activeSkillId));
    button.addEventListener("click", () => selectSkill(skillId));

    const marker = document.createElement("span");
    marker.className = "skill-card__index";
    marker.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "skill-card__copy";
    const title = document.createElement("strong");
    title.textContent = definition.title;
    const summary = document.createElement("small");
    summary.textContent = definition.summary;
    copy.append(title, summary);
    button.append(marker, copy);
    fragment.append(button);
  });
  elements.skillList.replaceChildren(fragment);
}

function selectSkill(skillId) {
  activeSkillId = skillId;
  for (const button of elements.skillList.querySelectorAll("[data-skill-id]")) {
    button.setAttribute("aria-pressed", String(button.dataset.skillId === skillId));
  }
  const ready = availableSkillIds.has(skillId);
  elements.skillAvailability.textContent = ready ? "运行时已发现" : "等待运行时发现";
  elements.skillAvailability.dataset.ready = String(ready);
  renderStartForm(workflowForms[skillId]);
}

function renderStartForm(definition) {
  const heading = document.createElement("h3");
  heading.textContent = definition.title;
  const form = buildForm(definition.start, async (input) => {
    setStatus(elements.workspaceStatus, "正在创建运行…");
    const run = await createRun(activeSkillId, input);
    renderRun(run);
    setStatus(elements.workspaceStatus, "运行已创建。", "success");
  });
  elements.startFormContainer.replaceChildren(heading, form);
}

function buildForm(specification, onSubmit) {
  const form = document.createElement("form");
  form.className = "dynamic-form";
  const intro = document.createElement("p");
  intro.className = "form-intro";
  intro.textContent = specification.intro;
  const grid = document.createElement("div");
  grid.className = "form-grid";
  for (const field of specification.fields) grid.append(renderField(field));
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = specification.submitLabel;
  form.append(intro, grid, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const values = readFormValues(form);
      await onSubmit(values);
    } catch (error) {
      setStatus(elements.workspaceStatus, error.message || "操作失败。", "error");
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

function renderField(field) {
  const wrapper = document.createElement("label");
  wrapper.className = field.type === "checkbox" ? "checkbox-field" : "field";
  if (field.wide) wrapper.classList.add("field--wide");
  const control = createControl(field);
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = field.label;
  if (field.type === "checkbox") wrapper.append(control, label);
  else wrapper.append(label, control);
  if (field.hint) {
    const hint = document.createElement("span");
    hint.className = "field-hint-text";
    hint.textContent = field.hint;
    wrapper.append(hint);
  }
  return wrapper;
}

function createControl(field) {
  let control;
  if (field.type === "textarea") {
    control = document.createElement("textarea");
  } else if (field.type === "select") {
    control = document.createElement("select");
    for (const optionValue of field.options || []) {
      const normalized = typeof optionValue === "object" ? optionValue : { value: optionValue, label: optionValue };
      const option = document.createElement("option");
      option.value = normalized.value;
      option.textContent = normalized.label;
      control.append(option);
    }
  } else {
    control = document.createElement("input");
    control.type = field.type || "text";
  }
  control.dataset.field = field.name;
  control.dataset.transform = field.transform || "string";
  control.required = Boolean(field.required);
  if (field.placeholder) control.placeholder = field.placeholder;
  if (field.value !== undefined) control.value = String(field.value);
  if (field.checked !== undefined) control.checked = Boolean(field.checked);
  if (field.min !== undefined) control.min = String(field.min);
  if (field.max !== undefined) control.max = String(field.max);
  return control;
}

function readFormValues(form) {
  const values = {};
  for (const control of form.querySelectorAll("[data-field]")) {
    const fieldName = control.dataset.field;
    let value = control.type === "checkbox" ? control.checked : control.value.trim();
    if (control.type !== "checkbox" && value === "") continue;
    if (control.type === "number") value = Number(value);
    if (control.dataset.transform === "boolean") value = value === "true";
    if (control.dataset.transform === "csv") {
      value = String(value).split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
    }
    if (control.dataset.transform === "json") {
      try {
        value = JSON.parse(String(value));
      } catch {
        throw new Error(`“${fieldName}”不是有效 JSON。`);
      }
    }
    setPath(values, fieldName, value);
  }
  return values;
}

function setPath(target, pathname, value) {
  const segments = pathname.split(".");
  let cursor = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) cursor[segment] = value;
    else {
      cursor[segment] ||= {};
      cursor = cursor[segment];
    }
  });
}

async function openRunFromForm(event) {
  event.preventDefault();
  const runId = elements.runIdInput.value.trim();
  if (!runId) return;
  try {
    setStatus(elements.workspaceStatus, "正在读取运行…");
    renderRun(await getRun(runId));
    elements.runIdInput.value = "";
    setStatus(elements.workspaceStatus, "运行已打开。", "success");
  } catch (error) {
    setStatus(elements.workspaceStatus, error.message, "error");
  }
}

async function refreshCurrentRun() {
  if (!currentRun) return;
  try {
    renderRun(await getRun(currentRun.id));
    setStatus(elements.workspaceStatus, "运行状态已刷新。", "success");
  } catch (error) {
    setStatus(elements.workspaceStatus, error.message, "error");
  }
}

async function retryCurrentRun() {
  if (!currentRun) return;
  try {
    setStatus(elements.workspaceStatus, "正在重试失败步骤…");
    renderRun(await retryRun(currentRun.id));
    setStatus(elements.workspaceStatus, "重试已完成。", "success");
  } catch (error) {
    setStatus(elements.workspaceStatus, error.message, "error");
  }
}

async function deleteCurrentRun() {
  if (!currentRun) return;
  const runId = currentRun.id;
  if (!window.confirm(`确定删除运行 ${runId}？此操作无法撤销。`)) return;
  try {
    await deleteRun(runId);
    forgetRecentRun(runId);
    currentRun = null;
    elements.runDetail.hidden = true;
    elements.runEmpty.hidden = false;
    elements.runStatusBadge.textContent = "未打开";
    delete elements.runStatusBadge.dataset.status;
    setStatus(elements.workspaceStatus, "运行已删除。", "success");
  } catch (error) {
    setStatus(elements.workspaceStatus, error.message, "error");
  }
}

function renderRun(run) {
  currentRun = run;
  activeSkillId = run.skillId;
  renderSkillList();
  selectSkill(activeSkillId);
  rememberRecentRun(run.id);
  elements.runEmpty.hidden = true;
  elements.runDetail.hidden = false;
  elements.runStatusBadge.textContent = statusLabel(run.status);
  elements.runStatusBadge.dataset.status = run.status;
  elements.runIdValue.textContent = run.id || "—";
  elements.runStepValue.textContent = run.step || "—";
  elements.runCheckpointValue.textContent = run.checkpoint?.id || "—";
  elements.retryRunButton.disabled = run.status !== "failed";
  elements.runJson.textContent = JSON.stringify(run, null, 2);
  renderEvents(run.events || []);
  renderCheckpoint(run);
  renderActions(run);
}

function renderEvents(events) {
  const fragment = document.createDocumentFragment();
  for (const event of [...events].reverse()) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = event.at || "";
    time.textContent = formatTimestamp(event.at);
    const description = document.createElement("strong");
    const metadata = Object.fromEntries(Object.entries(event).filter(([key]) => !["at", "type"].includes(key)));
    description.textContent = `${event.type || "event"}${Object.keys(metadata).length ? ` · ${JSON.stringify(metadata)}` : ""}`;
    item.append(time, description);
    fragment.append(item);
  }
  elements.eventList.replaceChildren(fragment);
}

function renderCheckpoint(run) {
  elements.checkpointContainer.replaceChildren();
  if (run.status !== "waiting" || !run.checkpoint?.id) return;
  const specification = workflowForms[run.skillId]?.checkpoints?.[run.checkpoint.id];
  if (!specification) {
    const message = document.createElement("p");
    message.textContent = `当前检查点 ${run.checkpoint.id} 尚未配置表单。`;
    elements.checkpointContainer.append(message);
    return;
  }
  const heading = document.createElement("h3");
  heading.textContent = specification.title;
  const form = buildForm(specification, async (input) => {
    setStatus(elements.workspaceStatus, "正在提交检查点…");
    renderRun(await resumeRun(run.id, input));
    setStatus(elements.workspaceStatus, "检查点已提交。", "success");
  });
  elements.checkpointContainer.append(heading, form);
}

function renderActions(run) {
  elements.actionContainer.replaceChildren();
  if (!["waiting", "completed"].includes(run.status)) return;
  const actions = workflowForms[run.skillId]?.actions || {};
  for (const [actionId, specification] of Object.entries(actions)) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.textContent = specification.title;
    const form = buildForm(specification, async (input) => {
      setStatus(elements.workspaceStatus, `正在执行 ${actionId}…`);
      renderRun(await actionRun(run.id, actionId, input));
      setStatus(elements.workspaceStatus, "动作已执行。", "success");
    });
    section.append(heading, form);
    elements.actionContainer.append(section);
  }
}

async function createRun(skillId, input) {
  const payload = await workflowRequest("/runs", { method: "POST", body: { skillId, input } });
  return payload.run;
}

async function getRun(runId) {
  const payload = await workflowRequest(`/runs/${encodeURIComponent(runId)}`);
  return payload.run;
}

async function resumeRun(runId, input) {
  const payload = await workflowRequest(`/runs/${encodeURIComponent(runId)}/resume`, { method: "POST", body: { input } });
  return payload.run;
}

async function retryRun(runId) {
  const payload = await workflowRequest(`/runs/${encodeURIComponent(runId)}/retry`, { method: "POST" });
  return payload.run;
}

async function actionRun(runId, actionId, input) {
  const payload = await workflowRequest(
    `/runs/${encodeURIComponent(runId)}/actions/${encodeURIComponent(actionId)}`,
    { method: "POST", body: { input } },
  );
  return payload.run;
}

async function deleteRun(runId) {
  await workflowRequest(`/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
}

async function workflowRequest(pathname, { method = "GET", body } = {}) {
  return hubRequest(`${API_ROOT}${pathname}`, { method, body });
}

async function hubRequest(pathname, { method = "GET", body } = {}) {
  if (!adminToken) throw new Error("请先验证管理员身份。");
  const headers = { "x-hub-admin-token": adminToken };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401) lockWorkspace();
    const error = payload.error || {};
    throw new Error(error.message || (typeof error === "string" ? error : `请求失败（${response.status}）`));
  }
  return payload;
}

function lockWorkspace() {
  adminToken = "";
  elements.workspace.hidden = true;
  elements.unlockPanel.hidden = false;
  setStatus(elements.unlockStatus, "管理员会话已失效，请重新验证。", "error");
}

function rememberRecentRun(runId) {
  const runIds = [runId, ...readRecentRuns().filter((id) => id !== runId)].slice(0, MAX_RECENT_RUNS);
  try {
    sessionStorage.setItem(RECENT_RUNS_KEY, JSON.stringify(runIds));
  } catch {
    // Session storage can be unavailable in hardened browsers.
  }
  renderRecentRuns();
}

function forgetRecentRun(runId) {
  const runIds = readRecentRuns().filter((id) => id !== runId);
  try {
    sessionStorage.setItem(RECENT_RUNS_KEY, JSON.stringify(runIds));
  } catch {
    // Session storage can be unavailable in hardened browsers.
  }
  renderRecentRuns();
}

function readRecentRuns() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECENT_RUNS_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((id) => typeof id === "string" && /^[a-z0-9][a-z0-9-]{7,80}$/i.test(id)).slice(0, MAX_RECENT_RUNS)
      : [];
  } catch {
    return [];
  }
}

function renderRecentRuns() {
  const fragment = document.createDocumentFragment();
  for (const runId of readRecentRuns()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-run-button";
    button.textContent = runId;
    button.addEventListener("click", async () => {
      try {
        renderRun(await getRun(runId));
      } catch (error) {
        setStatus(elements.workspaceStatus, error.message, "error");
      }
    });
    fragment.append(button);
  }
  elements.recentRuns.replaceChildren(fragment);
}

function setStatus(element, message, tone = "") {
  element.textContent = message || "";
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function statusLabel(status) {
  return ({ created: "已创建", running: "执行中", waiting: "等待确认", failed: "执行失败", completed: "已完成" })[status] || status || "未知";
}

function formatTimestamp(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function textField(name, label, options = {}) {
  return { name, label, type: "text", ...options };
}
