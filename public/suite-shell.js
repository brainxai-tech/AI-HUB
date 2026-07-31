(function () {
  const script = document.currentScript;
  const projectName = script?.dataset?.suiteProject || document.title || "AI Project";
  const hubHref = script?.dataset?.suiteHub || "/hub/";
  const projectId = script?.dataset?.suiteId || inferProjectId(projectName, window.location.pathname);
  const projectApiBase = script?.dataset?.suiteApi || inferProjectApiBase(window.location.pathname);
  const gameProjectIds = new Set([
    "ai-xiangqi-duel",
    "ai-chess-duel",
    "ai-go-duel",
    "fury-flock",
    "dice-estate-duel",
  ]);
  const gamePathSegments = new Set(["xiangqi", "chess", "go", "fury-flock"]);
  const suiteKind = inferSuiteKind(projectId, window.location.pathname);
  const recentProjectsStorageKey = "aiHub.recentProjects.v1";
  const forbiddenProviderPattern = /(?:chatgpt|openai|deepseek|claude|anthropic|gemini|(?:^|[\s/、与和])codex(?:$|[\s/、与和]))/i;
  const modelFamilyPattern = /^gpt-/i;
  const legacyProviderControlPattern = /^(?:演示模式|演示|demo(?:\s*mode)?|本地预览|local(?:\s*preview)?|chatgpt(?:\s*\/\s*openai)?|openai|gpt|codex|deepseek|claude|anthropic|gemini)$/i;
  const legacyModelControlPattern = /^(?:gpt|codex|deepseek|claude|anthropic|gemini)[-_.\s][a-z0-9_.-]+$/i;
  const legacyUnifiedChoicePattern = /^统一模型(?:\s|$)/i;
  const legacyProviderChoicePattern = /(?:gpt-[a-z0-9_.-]+|^(?:演示模式|演示|demo(?:\s*mode)?|本地预览|local(?:[-\s]*preview)?))/i;
  const legacyModelHeadingPattern = /^(?:(?:AI|Hub)\s*)?(?:模型|模型配置|模型设置|模型服务|选择模型|大模型|models?|model\s*(?:provider|settings?|selection|configuration|service)?)$/i;
  const legacyModelFieldPattern = /(?:^|[-_.\s])(?:provider|vendor|model)(?:$|[-_.\s])|供应商|提供商|模型/i;
  const preservesModelReferenceUi = projectId === "hub-model-atlas";
  let sanitizingLegacyUi = false;

  applySuiteIdentity();

  loadShellStyles();
  loadPickerStyles();
  if (suiteKind === "tool") {
    loadToolFoundationStyles();
    loadProjectStyles();
  }
  recordRecentVisit();

  const ensureShell = () => {
    applySuiteIdentity();
    document.body.classList.add("suite-enhanced");
    document.body.dataset.suiteId = projectId;
    document.body.dataset.suiteKind = suiteKind;
    applyProjectChromeCopy();
    if (!preservesModelReferenceUi) sanitizeLegacyModelUi();
    const firstMain = document.querySelector("main, [role='main']");
    if (firstMain && !firstMain.id) firstMain.id = "suite-main";
    if (firstMain && !firstMain.hasAttribute("tabindex")) firstMain.setAttribute("tabindex", "-1");

    const existingSkip = document.querySelector(".suite-skip-link");
    if (existingSkip && firstMain) existingSkip.href = `#${firstMain.id}`;
    if (document.querySelector(".suite-topbar")) return;

    let skip = null;
    if (firstMain) {
      skip = document.createElement("a");
      skip.className = "suite-skip-link";
      skip.href = `#${firstMain.id}`;
      skip.textContent = "跳到主要内容";
      skip.addEventListener("click", () => {
        window.requestAnimationFrame(() => firstMain.focus({ preventScroll: true }));
      });
    }

    const bar = document.createElement("nav");
    bar.className = "suite-topbar";
    bar.setAttribute("aria-label", "AI 项目统一导航");

    const brandWrap = document.createElement("div");
    brandWrap.className = "suite-brand-wrap";

    const brand = document.createElement("a");
    brand.className = "suite-brand";
    brand.href = hubHref;
    brand.innerHTML = '<span class="suite-mark" aria-hidden="true">AI</span><span>项目汇集库</span>';

    const project = document.createElement("div");
    project.className = "suite-project";
    project.innerHTML = `<span>当前项目</span><strong>${escapeHtml(projectName)}</strong>`;

    const actions = document.createElement("div");
    actions.className = "suite-actions";

    const hubLink = document.createElement("a");
    hubLink.className = "suite-action-link";
    hubLink.href = hubHref;
    hubLink.textContent = "项目入口";
    actions.append(hubLink);

    brandWrap.append(brand, project);
    bar.append(brandWrap, actions);
    document.body.prepend(bar);
    if (skip) document.body.prepend(skip);
    if (!preservesModelReferenceUi) installModelPicker(actions);
  };

  const start = () => {
    ensureShell();
    window.addEventListener("load", ensureShell, { once: true });
    const observer = new MutationObserver(() => ensureShell());
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  function installModelPicker(actions) {
    if (!projectApiBase || document.querySelector(".suite-model-trigger")) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "suite-model-trigger";
    trigger.hidden = true;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");

    const backdrop = document.createElement("div");
    backdrop.className = "suite-model-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="suite-model-panel" role="dialog" aria-modal="true" aria-labelledby="suite-model-title">
        <div class="suite-model-panel-head">
          <div>
            <span class="suite-model-eyebrow">PROJECT MODEL</span>
            <h2 id="suite-model-title">选择本项目调用的模型</h2>
          </div>
          <button class="suite-model-close" type="button" aria-label="关闭模型选择">×</button>
        </div>
        <p class="suite-model-description">候选项只包含管理员 API Key 当前可用的具体 GPT 型号。保存后，只影响这个项目。</p>
        <label class="suite-model-field">
          <span>大模型</span>
          <select class="suite-model-select" aria-describedby="suite-model-status"></select>
        </label>
        <div class="suite-model-current"></div>
        <div class="suite-model-footer">
          <p id="suite-model-status" class="suite-model-status" role="status" aria-live="polite"></p>
          <button class="suite-model-save" type="button">保存为本项目模型</button>
        </div>
      </section>
    `;
    document.body.append(backdrop);

    const panel = backdrop.querySelector(".suite-model-panel");
    const closeButton = backdrop.querySelector(".suite-model-close");
    const select = backdrop.querySelector(".suite-model-select");
    const current = backdrop.querySelector(".suite-model-current");
    const status = backdrop.querySelector(".suite-model-status");
    const saveButton = backdrop.querySelector(".suite-model-save");
    let state = null;

    trigger.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop.hidden) close();
    });
    select.addEventListener("change", () => {
      status.dataset.state = "neutral";
      status.textContent = select.value === state?.model ? "当前选择已生效。" : "选择已更改，保存后生效。";
    });
    saveButton.addEventListener("click", save);
    window.addEventListener("aihub:model-selection-changed", (event) => {
      const payload = event.detail;
      if (payload?.projectId !== projectId || !Array.isArray(payload.models)) return;
      state = payload;
      render();
    });

    load();

    async function load() {
      try {
        const response = await fetch(`${projectApiBase}/api/model-selection`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        const models = Array.isArray(payload?.models)
          ? payload.models.filter((model) => modelFamilyPattern.test(String(model || "")))
          : [];
        if (models.length === 0) return;
        state = { ...payload, models };
        render();
        actions.prepend(trigger);
        trigger.hidden = false;
      } catch {
        // Projects without a model backend do not show the selector.
      }
    }

    function render() {
      const selectedModel = state.model || "请选择";
      trigger.innerHTML = `<span>模型</span><strong>${escapeHtml(selectedModel)}</strong>`;
      trigger.title = state.model ? `本项目当前调用：${state.model}` : "为本项目选择调用模型";
      select.replaceChildren();
      for (const model of state.models.filter((item) => modelFamilyPattern.test(item))) {
        select.append(new Option(model, model));
      }
      select.value = state.model || state.models[0] || "";
        current.innerHTML = state.model
          ? `<span>当前状态</span><strong>${state.inherited ? "统一默认" : "本项目专用"} · ${escapeHtml(state.model)}</strong>`
          : "<span>当前状态</span><strong>尚未选择，生成前必须保存一个模型</strong>";
        status.dataset.state = "neutral";
        status.textContent = state.model
          ? `API Key 可用模型 ${state.models.length} 个${state.inherited ? "；当前使用统一默认，可按项目调整" : ""}`
          : `API Key 提供 ${state.models.length} 个模型，请为本项目选择`;
    }

    function open() {
      backdrop.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      document.body.classList.add("suite-model-open");
      window.requestAnimationFrame(() => select.focus());
    }

    function close() {
      backdrop.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("suite-model-open");
      trigger.focus();
    }

    async function save() {
      const model = select.value;
      if (!model) {
        status.textContent = "请选择一个模型。";
        return;
      }
      if (model === state?.model) {
        status.textContent = "当前模型已经生效。";
        return;
      }
      saveButton.disabled = true;
      select.disabled = true;
      status.dataset.state = "working";
      status.textContent = "正在保存到本项目…";
      try {
        const response = await fetch(`${projectApiBase}/api/model-selection`, {
          method: "PUT",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ model }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error?.message || `保存失败（HTTP ${response.status}）`);
        state = payload;
        render();
        status.dataset.state = "success";
        status.textContent = "已保存。页面将刷新并启用所选模型。";
        window.dispatchEvent(new CustomEvent("aihub:model-selection-changed", { detail: payload }));
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        status.dataset.state = "error";
        status.textContent = error instanceof Error ? error.message : "模型选择保存失败。";
      } finally {
        saveButton.disabled = false;
        select.disabled = false;
      }
    }
  }

  function loadPickerStyles() {
    if (document.querySelector('link[data-suite-model-styles]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/hub/project-model-selector.css?v=20260727-project-models";
    link.dataset.suiteModelStyles = "true";
    document.head.append(link);
  }

  function loadShellStyles() {
    if (
      document.querySelector('link[href*="/hub/suite-theme.css"]') ||
      document.querySelector('link[data-suite-shell-styles]')
    ) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/hub/suite-theme.css?v=20260731-shell-foundation1";
    link.dataset.suiteShellStyles = "true";
    document.head.append(link);
  }

  function loadToolFoundationStyles() {
    if (document.querySelector('link[data-suite-tool-foundation]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/hub/suite-tool-foundation.css?v=20260730-signal-routing1";
    link.dataset.suiteToolFoundation = "true";
    document.head.append(link);
  }

  function loadProjectStyles() {
    const projectStyleVersions = {
      idol: "20260730-idol2",
      qisheng: "20260730-qisheng3",
      tarot: "20260730-tarot1",
      grassland: "20260730-grassland1",
      elder: "20260730-elder1",
    };
    const version = projectStyleVersions[projectId];
    if (!version || document.querySelector("link[data-suite-project-styles]")) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/hub/project-themes/${encodeURIComponent(projectId)}.css?v=${version}`;
    link.dataset.suiteProjectStyles = projectId;
    document.head.append(link);
  }

  function applyProjectChromeCopy() {
    const copyByProject = {
      idol: [
        [".api-connect-panel .section-kicker", "分析状态"],
        [".start-grid > .panel .hero-kicker", "匹配实验室"],
        [".start-grid > aside .section-kicker", "准备情况"],
      ],
      qisheng: [
        [".settings-header h2", "陪伴设置"],
        [".key-panel-header h2", "进入栖声"],
      ],
    };

    for (const [selector, copy] of copyByProject[projectId] || []) {
      const element = document.querySelector(selector);
      if (element && element.textContent !== copy) element.textContent = copy;
    }
  }

  function sanitizeLegacyModelUi() {
    if (sanitizingLegacyUi) return;
    sanitizingLegacyUi = true;
    try {
      const legacyControls = projectId === "hub" ? [] : hideLegacyProviderControls();
      if (legacyControls.length > 0) hideLegacyProviderGroups();
      if (projectId !== "hub") {
        hideLegacyModelContainers();
        hideLegacyProviderBadges();
      }

      for (const select of document.querySelectorAll("select:not(.suite-model-select)")) {
        const selectOptions = Array.from(select.options);
        const labelText = associatedLabelText(select);
        const signature = [
          select.id,
          select.name,
          select.className,
          select.getAttribute("aria-label"),
          select.getAttribute("data-testid"),
          labelText,
        ].filter(Boolean).join(" ");
        const providerOptions = selectOptions.filter((option) =>
          /^(?:openai|gpt|codex|deepseek|claude|anthropic|gemini)$/i.test(String(option.value || "").trim()),
        );
        const modelOptions = selectOptions.filter((option) =>
          /^(?:gpt|codex|deepseek|claude|gemini)-/i.test(String(option.value || "").trim()),
        );

        if (
          providerOptions.length > 0 ||
          modelOptions.length > 0 ||
          legacyModelFieldPattern.test(signature) ||
          /^(?:model|模型)/i.test(labelText)
        ) {
          const compatible = Array.from(select.options).find((option) =>
            /^(?:openai|gpt|codex)$/i.test(String(option.value || "").trim()),
          );
          if (compatible) select.value = compatible.value;
          hideLegacyElement(select);
          hideAssociatedLabel(select);
        }
      }

      for (const input of document.querySelectorAll("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])")) {
        if (input.closest(".suite-model-backdrop, [data-user-content], [contenteditable='true']")) continue;
        const labelText = associatedLabelText(input);
        const signature = [
          input.id,
          input.name,
          input.className,
          input.getAttribute("aria-label"),
          input.getAttribute("data-testid"),
          labelText,
        ].filter(Boolean).join(" ");
        if (!legacyModelFieldPattern.test(signature) && !/^(?:model|模型)/i.test(labelText)) continue;
        hideLegacyElement(input);
        hideAssociatedLabel(input);
      }

      const copySelector = [
        "form", "header", "nav", "[class*='provider']", "[class*='model']",
        "[id*='provider']", "[id*='model']",
      ].join(",");
      const copyElements = document.querySelectorAll("p, small, label, legend, span, button, h1, h2, h3");
      for (const element of copyElements) {
        if (!element.closest(copySelector) || element.closest("[data-user-content], [contenteditable='true']")) continue;
        if (element.closest("[data-suite-legacy-provider-hidden]")) continue;
        if (element.closest("[data-suite-legacy-provider-group-hidden]")) continue;
        const hasForbiddenCopy = Array.from(element.childNodes).some((node) =>
          node.nodeType === Node.TEXT_NODE && forbiddenProviderPattern.test(node.nodeValue || ""),
        );
        if (hasForbiddenCopy) hideLegacyElement(element);
      }
    } finally {
      sanitizingLegacyUi = false;
    }
  }

  function hideLegacyProviderControls() {
    const controls = [];
    const selector = [
      "button", "[role='button']", "[role='radio']", "input[type='radio']", "label[for]",
      "[data-provider]", "[data-vendor]", "[data-model-provider]",
    ].join(",");

    for (const control of document.querySelectorAll(selector)) {
      if (
        control.matches("[data-suite-legacy-provider-hidden]") ||
        control.closest(".suite-topbar, .suite-model-backdrop, [data-user-content], [contenteditable='true']")
      ) continue;

      const text = normalizeControlText(control.textContent);
      const attributes = [
        control.getAttribute("data-provider"),
        control.getAttribute("data-vendor"),
        control.getAttribute("data-model-provider"),
        control.getAttribute("value"),
        control.getAttribute("aria-label"),
        control.getAttribute("title"),
      ].map(normalizeControlText).filter(Boolean);
      const isProviderChoice =
        control.matches("[role='radio'], input[type='radio'], label, [data-provider], [data-vendor], [data-model-provider]") ||
        Boolean(control.closest("[role='radiogroup'], [class*='provider'], [id*='provider'], [class*='model-selector'], [id*='model-selector']"));
      const isLegacy =
        legacyProviderControlPattern.test(text) ||
        legacyModelControlPattern.test(text) ||
        attributes.some((value) => legacyProviderControlPattern.test(value) || legacyModelControlPattern.test(value)) ||
        (isProviderChoice && (
          forbiddenProviderPattern.test(`${text} ${attributes.join(" ")}`) ||
          legacyUnifiedChoicePattern.test(text) ||
          legacyProviderChoicePattern.test(`${text} ${attributes.join(" ")}`)
        ));
      if (!isLegacy) continue;

      hideLegacyElement(control);
      controls.push(control);

      if (control.matches("label[for]")) {
        const input = document.getElementById(control.htmlFor);
        if (input && !input.closest(".suite-model-backdrop")) {
          hideLegacyElement(input);
        }
      }
    }

    return controls;
  }

  function hideLegacyProviderGroups() {
    const marker = "[data-suite-legacy-provider-hidden]";
    const groupMarker = "data-suite-legacy-provider-group-hidden";
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, legend, [role='heading']");

    for (const heading of headings) {
      if (
        !legacyModelHeadingPattern.test(normalizeControlText(heading.textContent)) ||
        heading.closest(".suite-topbar, .suite-model-backdrop")
      ) continue;

      if (!hasNearbyLegacyControls(heading, marker)) continue;
      heading.hidden = true;
      heading.setAttribute("aria-hidden", "true");
      heading.setAttribute(groupMarker, "true");

      let sibling = heading.nextElementSibling;
      for (let count = 0; sibling && count < 2; count += 1, sibling = sibling.nextElementSibling) {
        if (!sibling.matches("p, small, [role='status']")) break;
        if (!/(?:Hub|模型|model|provider|本地演示|演示模式)/i.test(sibling.textContent || "")) break;
        sibling.hidden = true;
        sibling.setAttribute("aria-hidden", "true");
        sibling.setAttribute(groupMarker, "true");
      }
    }

    const legacyCopyPattern = /(?:Hub.*(?:模型|配置|未就绪)|模型.*(?:配置|未就绪|可用)|本地演示|演示模式)/i;
    const supportingCopy = document.querySelectorAll([
      "p", "small", "[role='status']", "[class*='config-note']", "[class*='model-status']",
    ].join(","));
    for (const element of supportingCopy) {
      if (
        element.closest(".suite-topbar, .suite-model-backdrop") ||
        !hasNearbyLegacyControls(element, marker) ||
        !legacyCopyPattern.test(element.textContent || "")
      ) continue;
      element.hidden = true;
      element.setAttribute("aria-hidden", "true");
      element.setAttribute(groupMarker, "true");
    }

    const safeGroups = document.querySelectorAll([
      "fieldset", "[role='radiogroup']", "[role='group']",
      "[data-provider-group]", "[data-model-provider-group]",
      "[class*='provider-grid']", "[class*='provider-options']",
      "[class*='model-grid']", "[class*='model-options']", "[class*='model-box']",
    ].join(","));
    for (const container of safeGroups) {
      if (
        container.closest(".suite-topbar, .suite-model-backdrop") ||
        container.querySelectorAll(marker).length === 0
      ) continue;
      const interactive = Array.from(container.querySelectorAll("button, [role='button'], [role='radio'], input, select"));
      if (interactive.length === 0 || interactive.some((item) => !item.hidden && !item.matches(marker) && !item.closest(marker))) continue;
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      container.setAttribute(groupMarker, "true");
    }
  }

  function hideLegacyModelContainers() {
    for (const summary of document.querySelectorAll("details > summary")) {
      if (
        summary.closest(".suite-model-backdrop, [data-user-content], [contenteditable='true']") ||
        !/^(?:模型设置|模型配置|model\s*settings?)/i.test(normalizeControlText(summary.textContent))
      ) continue;
      const details = summary.parentElement;
      details.hidden = true;
      details.setAttribute("aria-hidden", "true");
      details.setAttribute("data-suite-legacy-provider-group-hidden", "true");
    }
  }

  function hideLegacyProviderBadges() {
    for (const container of document.querySelectorAll("[aria-label]")) {
      if (
        container.closest(".suite-topbar, .suite-model-backdrop") ||
        !/(?:provider|供应商|提供商).*?(?:状态|status)/i.test(container.getAttribute("aria-label") || "")
      ) continue;
      container.hidden = true;
      container.setAttribute("aria-hidden", "true");
      container.setAttribute("data-suite-legacy-provider-group-hidden", "true");
    }

    for (const element of document.querySelectorAll("p.eyebrow, [class*='history'] small, .metric span, [class*='provider-metric'] span")) {
      const text = normalizeControlText(element.textContent);
      if (!forbiddenProviderPattern.test(text)) continue;
      const metric = element.closest(".metric, [class*='provider-metric']");
      if (metric) {
        metric.hidden = true;
        metric.setAttribute("aria-hidden", "true");
        metric.setAttribute("data-suite-legacy-provider-group-hidden", "true");
      } else {
        hideLegacyElement(element);
      }
    }
  }

  function normalizeControlText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function hideAssociatedLabel(select) {
    const wrappingLabel = select.closest("label");
    if (wrappingLabel) {
      hideLegacyElement(wrappingLabel);
      return;
    }
    if (!select.id) return;
    const explicitLabel = Array.from(document.querySelectorAll("label[for]"))
      .find((label) => label.htmlFor === select.id);
    if (explicitLabel) hideLegacyElement(explicitLabel);
  }

  function hasNearbyLegacyControls(element, marker) {
    let container = element.parentElement;
    for (let depth = 0; container && container !== document.body && depth < 4; depth += 1) {
      if (container.querySelector(marker)) return true;
      if (container.matches("main, [role='main'], form")) break;
      container = container.parentElement;
    }
    return false;
  }

  function associatedLabelText(control) {
    const wrappingLabel = control.closest("label");
    if (wrappingLabel) return normalizeControlText(wrappingLabel.textContent);
    if (!control.id) return "";
    const explicitLabel = Array.from(document.querySelectorAll("label[for]"))
      .find((label) => label.htmlFor === control.id);
    return normalizeControlText(explicitLabel?.textContent);
  }

  function hideLegacyElement(element) {
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("data-suite-legacy-provider-hidden", "true");
    if ("tabIndex" in element) element.tabIndex = -1;
  }

  function inferProjectApiBase(pathname) {
    const segments = String(pathname || "/").split("/").filter(Boolean);
    const firstSegment = segments[0];
    if (!firstSegment) return "";
    if (firstSegment !== "hub") return `/${firstSegment}`;
    return projectId !== "hub" && segments[1] ? `/hub/${segments[1]}` : "";
  }

  function applySuiteIdentity() {
    document.documentElement.classList.add("suite-enhanced-root");
    document.documentElement.dataset.suiteId = projectId;
    document.documentElement.dataset.suiteKind = suiteKind;
  }

  function inferSuiteKind(id, pathname) {
    const normalizedId = String(id || "").trim().toLowerCase();
    const segments = String(pathname || "/").split("/").filter(Boolean).map((segment) => segment.toLowerCase());
    const [firstSegment, secondSegment] = segments;

    if (
      gameProjectIds.has(normalizedId) ||
      gamePathSegments.has(firstSegment) ||
      (firstSegment === "hub" && secondSegment === "dice-estate")
    ) {
      return "game";
    }
    if (normalizedId === "hub" || normalizedId.startsWith("hub-") || firstSegment === "hub") {
      return "hub";
    }
    return "tool";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return map[char];
    });
  }

  function recordRecentVisit() {
    const path = window.location.pathname || "/";
    if (path === "/hub" || path.startsWith("/hub/")) return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(recentProjectsStorageKey) || "[]");
      const entries = Array.isArray(parsed) ? parsed : [];
      const existing = entries.find((entry) => entry.projectId === projectId || entry.path === path);
      const now = Date.now();
      const recentlyRecorded = existing && now - Number(existing.lastOpenedAt || 0) < 10000;
      const nextEntry = {
        projectId,
        path,
        name: String(projectName).replace(/^AI\s*·\s*/u, ""),
        lastOpenedAt: now,
        visitCount: Math.max(1, Number(existing?.visitCount || 0) + (recentlyRecorded ? 0 : 1)),
      };
      const nextEntries = [
        nextEntry,
        ...entries.filter((entry) => entry !== existing && entry.projectId !== projectId && entry.path !== path),
      ].slice(0, 12);
      window.localStorage.setItem(recentProjectsStorageKey, JSON.stringify(nextEntries));
    } catch {
      // Private browsing or storage policies may disable this optional history.
    }
  }

  function inferProjectId(name, pathname) {
    const value = `${name} ${pathname}`.toLowerCase();
    const matches = [
      ["qisheng", ["栖声", "qisheng"]], ["tarot", ["塔罗", "tarot"]],
      ["grassland", ["草原", "grassland"]], ["glory", ["glory", "荣耀"]],
      ["cooking", ["备餐", "cooking"]], ["resume", ["简历", "resume"]],
      ["elder", ["长辈", "防诈", "elder"]], ["hub", ["汇集库", "hub"]],
      ["idol", ["爱豆", "idol"]],
    ];
    const found = matches.find(([, needles]) => needles.some((needle) => value.includes(needle.toLowerCase())));
    return found ? found[0] : "project";
  }
})();
