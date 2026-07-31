(function () {
  const capabilityGate = window.HubCapabilityGate;
  const stageLabels = {
    idea: "构思中",
    prototype: "原型",
    live: "已上线",
    archived: "归档",
    unknown: "未标注",
  };

  const state = {
    query: "",
    category: "all",
    purpose: "all",
    sort: "updated",
    page: "projects",
  };

  const featuredProjectIds = [
    "mbti-persona-compass",
    "ai-essay-coach",
    "yingzhou-ai",
  ];
  const featuredProjectOrder = new Map(featuredProjectIds.map((id, index) => [id, index]));
  const purposeCategories = {
    work: ["实用工具", "办公效率", "创作工具", "安全教育"],
    learning: ["学习辅助", "学习教育", "亲子教育"],
    entertainment: ["娱乐互动"],
    games: ["游戏原型"],
  };
  const supportedRecommendationModels = {
    GPT: new Set([
      "gpt-5.3-codex-spark",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.5",
      "gpt-5.6-luna",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
    ]),
  };
  const providerRoutingStrengths = {
    GPT: ["复杂推理", "结构化输出"],
  };
  const recentProjectsStorageKey = "aiHub.recentProjects.v1";
  const trustProfiles = {
    "ai-legal-clause-translator": {
      data: "合同条款",
      boundary: "不能替代执业律师意见。",
    },
    "ai-data-analyst": {
      data: "业务数据文件",
      boundary: "上传前请移除客户信息与商业机密。",
    },
    "trace-sheet-workbench": {
      data: "Excel 与 CSV 文件",
      boundary: "数据默认在浏览器内处理；调用模型时只发送字段与行数等结构摘要。",
    },
    "elder-fraud-assistant": {
      data: "短信、通话或群聊内容",
      boundary: "涉及转账或人身风险时，请立即联系银行或警方。",
    },
  };

  const modelState = {
    config: null,
    loaded: false,
    loading: null,
    loadFailed: false,
    projects: [],
    adminToken: "",
    adminVerified: false,
  };

  const elements = {
    pageTabs: Array.from(document.querySelectorAll("[data-page-target]")),
    pagePanels: Array.from(document.querySelectorAll("[data-page-panel]")),
    count: document.querySelector("#projectCount"),
    catalogCount: document.querySelector("#catalogCount"),
    updated: document.querySelector("#lastUpdated"),
    search: document.querySelector("#searchInput"),
    category: document.querySelector("#categoryFilter"),
    sort: document.querySelector("#sortFilter"),
    summary: document.querySelector("#resultSummary"),
    resetFilters: document.querySelector("#resetFilters"),
    grid: document.querySelector("#projectGrid"),
    empty: document.querySelector("#emptyState"),
    emptyTitle: document.querySelector("#emptyTitle"),
    emptyMessage: document.querySelector("#emptyMessage"),
    reload: document.querySelector("#reloadButton"),
    copyTemplate: document.querySelector("#copyTemplateButton"),
    actionStatus: document.querySelector("#emptyActionStatus"),
    adminToken: document.querySelector("#adminTokenInput"),
    defaultProvider: document.querySelector("#defaultProviderSelect"),
    providerList: document.querySelector("#providerList"),
    cozeIntegration: document.querySelector("#cozeIntegration"),
    reloadModelConfig: document.querySelector("#reloadModelConfigButton"),
    saveModelConfig: document.querySelector("#saveModelConfigButton"),
    modelConfigStatus: document.querySelector("#modelConfigStatus"),
    projectGateStatus: document.querySelector("#projectGateStatus"),
    gatewayHealth: document.querySelector("#gatewayHealth"),
    chatEndpoint: document.querySelector("#chatEndpoint"),
    compatibleEndpoint: document.querySelector("#compatibleEndpoint"),
    projectLaunchStatus: document.querySelector("#projectLaunchStatus"),
    purposeNav: document.querySelector("#purposeNav"),
    recentSection: document.querySelector("#recentSection"),
    recentGrid: document.querySelector("#recentGrid"),
    allProjectsDisclosure: document.querySelector("#allProjectsDisclosure"),
    adminAccessGate: document.querySelector("#adminAccessGate"),
    adminUnlock: document.querySelector("#adminUnlockButton"),
    adminAccessStatus: document.querySelector("#adminAccessStatus"),
    adminNav: document.querySelector("#adminNav"),
  };

  const projectTemplate = `window.AI_PROJECTS = [
  {
    id: "unique-project-id",
    name: "AI · 项目名称",
    description: "一句话说明这个 AI 项目做什么。",
    url: "https://example.com",
    image: "/hub/assets/project-covers/unique-project-id.jpg?v=20260625-coverfix",
    category: "实用工具",
    stage: "live",
    updatedAt: "2026-06-25",
    requiredCapabilities: ["model:chat"],
    modelRecommendation: {
      provider: "GPT",
      model: "gpt-5.4-mini",
      reason: "说明这个具体型号为什么适合该项目的任务、质量、速度或成本要求。",
    },
  },
];`;

  function apiUrl(path) {
    const prefix = window.location.pathname.indexOf("/hub") === 0 ? "/hub" : "";
    return `${prefix}${path}`;
  }

  function projectPathFromUrl(value) {
    try {
      return new URL(value, window.location.href).pathname || "/hub/";
    } catch {
      return "/hub/";
    }
  }

  function readRecentProjects() {
    try {
      const value = JSON.parse(window.localStorage.getItem(recentProjectsStorageKey) || "[]");
      return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
    } catch {
      return [];
    }
  }

  function recordRecentProject(project) {
    const entries = readRecentProjects();
    const now = Date.now();
    const path = projectPathFromUrl(project.url);
    const existing = entries.find((entry) => entry.projectId === project.id || entry.path === path);
    const recentlyRecorded = existing && now - Number(existing.lastOpenedAt || 0) < 10000;
    const nextEntry = {
      projectId: project.id,
      path,
      name: project.displayName,
      lastOpenedAt: now,
      visitCount: Math.max(1, Number(existing?.visitCount || 0) + (recentlyRecorded ? 0 : 1)),
    };
    const nextEntries = [
      nextEntry,
      ...entries.filter((entry) => entry !== existing && entry.projectId !== project.id && entry.path !== path),
    ].slice(0, 12);
    try {
      window.localStorage.setItem(recentProjectsStorageKey, JSON.stringify(nextEntries));
    } catch {
      // Recent-use history is an optional local convenience.
    }
  }

  function trackHubEvent(event) {
    const payload = {
      eventType: event.eventType,
      projectId: event.projectId,
      projectPath: event.projectPath,
      source: "hub",
    };

    fetch(apiUrl("/api/track"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  function getPageFromHash() {
    const isAdminPage = window.location.pathname.indexOf("/hub/admin/") === 0;
    return window.location.hash === "#models" || (isAdminPage && !window.location.hash)
      ? "models"
      : "projects";
  }

  function setPage(page) {
    if (elements.adminAccessGate && !modelState.adminVerified) {
      for (const panel of elements.pagePanels) {
        panel.hidden = true;
      }
      return;
    }

    const supportsModelPage = elements.pagePanels.some((panel) => panel.dataset.pagePanel === "models");
    state.page = page === "models" && supportsModelPage ? "models" : "projects";

    for (const tab of elements.pageTabs) {
      if (tab.dataset.pageTarget === state.page) {
        tab.setAttribute("aria-current", "page");
      } else {
        tab.removeAttribute("aria-current");
      }
    }

    for (const panel of elements.pagePanels) {
      panel.hidden = panel.dataset.pagePanel !== state.page;
    }

    if (state.page === "models" && !modelState.loaded) {
      loadModelConfig();
    }
  }

  function isSafeUrl(value) {
    if (typeof value !== "string" || value.trim() === "") {
      return false;
    }

    try {
      const url = new URL(value, window.location.href);
      return ["http:", "https:", "file:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function normalizeModelRecommendation(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const provider = String(value.provider || "").trim();
    const model = String(value.model || "").trim();
    const reason = String(value.reason || "").trim();
    if (!supportedRecommendationModels[provider]?.has(model) || !reason) {
      return null;
    }

    return { provider, model, reason };
  }

  function normalizeProject(project, index) {
    const id = String(project.id || `project-${index}`);
    const updatedAt = typeof project.updatedAt === "string" ? project.updatedAt : "";
    const cover = window.AI_PROJECT_COVERS && window.AI_PROJECT_COVERS[id];

    return {
      id,
      name: String(project.name || "未命名项目").trim(),
      displayName: String(project.name || "未命名项目").trim().replace(/^AI\s*·\s*/u, ""),
      description: String(project.description || "暂无描述").trim(),
      url: String(project.url || "").trim(),
      image: String(cover?.fallback || project.image || "").trim(),
      cover: cover || null,
      category: String(project.category || "未分类").trim(),
      stage: stageLabels[project.stage] ? project.stage : "unknown",
      updatedAt,
      featured: Boolean(project.featured),
      trust: trustProfiles[id] || null,
      modelRecommendation: normalizeModelRecommendation(project.modelRecommendation),
      requiredCapabilities: Array.from(
        new Set(Array.isArray(project.requiredCapabilities) ? project.requiredCapabilities : []),
      ).filter((capability) => ["model:chat", "coze:invoke"].includes(capability)),
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) {
      return "未标注";
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function uniqueValues(projects, field) {
    return Array.from(new Set(projects.map((project) => project[field]).filter(Boolean))).sort(
      (first, second) => first.localeCompare(second, "zh-CN"),
    );
  }

  function fieldLabel(value) {
    return stageLabels[value] || value;
  }

  function getProjectAvailability(project) {
    if (project.requiredCapabilities.length === 0) {
      return "ready";
    }
    if (modelState.loadFailed) {
      return "unknown";
    }
    if (!modelState.loaded) {
      return "checking";
    }
    const missing = capabilityGate.missingCapabilities(project.requiredCapabilities, modelState.config);
    return missing.length > 0 ? "unavailable" : "ready";
  }

  function availabilityLabel(availability) {
    return {
      ready: "可使用",
      checking: "检查中",
      unavailable: "维护中",
      unknown: "状态未知",
    }[availability];
  }

  function renderSelect(select, options, selected, allLabel, counts) {
    select.innerHTML = [
      `<option value="all">${allLabel}${counts ? ` (${counts.get("all") || 0})` : ""}</option>`,
      ...options.map((option) => {
        const label = fieldLabel(option);
        const count = counts ? ` (${counts.get(option) || 0})` : "";
        return `<option value="${escapeHtml(option)}">${escapeHtml(label)}${count}</option>`;
      }),
    ].join("");
    select.value = selected;
  }

  function renderFilters(projects) {
    const categoryCounts = new Map([["all", projects.length]]);
    for (const project of projects) {
      categoryCounts.set(project.category, (categoryCounts.get(project.category) || 0) + 1);
    }
    renderSelect(
      elements.category,
      uniqueValues(projects, "category"),
      state.category,
      "全部分类",
      categoryCounts,
    );
  }

  function matchesQuery(project, query) {
    if (!query) {
      return true;
    }

    const haystack = [
      project.name,
      project.description,
      project.category,
      stageLabels[project.stage],
      project.modelRecommendation?.provider,
      project.modelRecommendation?.model,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query.toLowerCase());
  }

  function getFilteredProjects(projects) {
    const shouldFeatureFirst =
      state.query === "" && state.category === "all" && state.purpose === "all" && state.sort === "updated";
    return projects
      .filter(
        (project) =>
          state.purpose === "all" || purposeCategories[state.purpose]?.includes(project.category),
      )
      .filter((project) => state.category === "all" || project.category === state.category)
      .filter((project) => matchesQuery(project, state.query))
      .sort((first, second) => {
        if (shouldFeatureFirst) {
          const firstFeatured = featuredProjectOrder.has(first.id)
            ? featuredProjectOrder.get(first.id)
            : Number.POSITIVE_INFINITY;
          const secondFeatured = featuredProjectOrder.has(second.id)
            ? featuredProjectOrder.get(second.id)
            : Number.POSITIVE_INFINITY;
          if (firstFeatured !== secondFeatured) {
            return firstFeatured - secondFeatured;
          }
        }

        if (state.sort === "name") {
          return first.name.localeCompare(second.name, "zh-CN");
        }

        if (state.sort === "category") {
          return first.category.localeCompare(second.category, "zh-CN");
        }

        return String(second.updatedAt).localeCompare(String(first.updatedAt));
      });
  }

  function renderStatus(projects, filteredProjects) {
    if (elements.catalogCount) {
      elements.catalogCount.textContent = `共 ${projects.length} 个项目`;
    }

    if (modelState.loaded || modelState.loadFailed) {
      const readyCount = projects.filter((project) => getProjectAvailability(project) === "ready").length;
      const unavailableCount = projects.length - readyCount;
      elements.count.textContent = unavailableCount > 0
        ? `${readyCount} 可用 · ${unavailableCount} 维护`
        : `${readyCount} 个项目可用`;
    } else {
      elements.count.textContent = `${projects.length} 个项目`;
    }

    const updateDates = projects
      .map((project) => project.updatedAt)
      .filter(Boolean)
      .sort();
    const latest = updateDates.length > 0 ? updateDates[updateDates.length - 1] : "";

    elements.updated.textContent = latest ? `最近更新 ${formatDate(latest)}` : "等待收录";
    const hasActiveControls =
      state.query !== "" ||
      state.category !== "all" ||
      state.purpose !== "all" ||
      state.sort !== "updated";
    elements.summary.textContent = hasActiveControls
      ? `找到 ${filteredProjects.length} 个项目`
      : `${filteredProjects.length} 个项目`;
    elements.summary.hidden = !hasActiveControls;
    if (elements.resetFilters) {
      elements.resetFilters.hidden = !hasActiveControls;
    }
  }

  function renderProjectCard(project, options) {
    const description = escapeHtml(project.description);
    const isFeatured = Boolean(options && options.featured);
    const requiresCapabilities = project.requiredCapabilities.length > 0;
    const availability = getProjectAvailability(project);
    const href = escapeHtml(project.url);
    const gateAttrs = requiresCapabilities
      ? ` data-required-capabilities="${escapeHtml(project.requiredCapabilities.join(" "))}"`
      : "";
    const image = renderProjectImage(project);
    const featuredAttr = isFeatured ? ` data-featured="true"` : "";
    const linkDisabledAttr = availability === "unavailable" || availability === "unknown"
      ? ` aria-disabled="true"`
      : "";
    const trustBadge = project.trust
      ? `<span class="pill pill--trust" title="将处理：${escapeHtml(project.trust.data)}；${escapeHtml(project.trust.boundary)}">隐私提醒</span>`
      : "";
    const featuredBadge = isFeatured ? `<span class="pill pill--featured">精选</span>` : "";
    const availabilityBadge = availability === "ready"
      ? ""
      : `<span class="pill pill--availability" data-state="${availability}">${availabilityLabel(availability)}</span>`;
    const availableModels = new Set();
    if (modelState.loaded && Array.isArray(modelState.config?.providers)) {
      for (const provider of modelState.config.providers) {
        if (!provider?.enabled || !provider?.configured) continue;
        const models = Array.isArray(provider.enabledModels) ? provider.enabledModels : provider.models;
        for (const model of Array.isArray(models) ? models : []) availableModels.add(model);
      }
    }
    const modelRecommendation = project.modelRecommendation && availableModels.has(project.modelRecommendation.model)
      ? project.modelRecommendation
      : null;
    const routingStrengths = modelRecommendation
      ? (providerRoutingStrengths[modelRecommendation.provider] || [])
          .map((strength) => `<span>${escapeHtml(strength)}</span>`)
          .join("")
      : "";
    const recommendation = modelRecommendation
      ? `<details class="project-card__recommendation" data-recommendation-details data-provider="${escapeHtml(modelRecommendation.provider.toLowerCase())}">
          <summary>
            <span class="project-card__recommendation-label">模型方案</span>
            <span class="project-card__recommendation-candidate">
              <strong><code>${escapeHtml(modelRecommendation.model)}</code></strong>
            </span>
            <span class="project-card__recommendation-toggle" aria-hidden="true"></span>
          </summary>
          <span class="project-card__recommendation-reason">
            <strong>为什么它是主要候选</strong>
            <span>${escapeHtml(modelRecommendation.reason)}</span>
            <span class="project-card__routing-strengths" aria-label="模型优势">${routingStrengths}</span>
          </span>
        </details>`
      : "";

    return `
      <article class="project-card" data-project-card data-project-id="${escapeHtml(project.id)}" data-project-url="${escapeHtml(project.url)}" data-availability="${availability}"${gateAttrs}${featuredAttr}>
        <a class="project-card__link" href="${href}" aria-label="打开 ${escapeHtml(project.displayName)}"${linkDisabledAttr}></a>
        ${image}
        <span class="project-card__top">
          <span class="project-meta">
            ${featuredBadge}
            <span class="pill">${escapeHtml(project.category)}</span>
            ${availabilityBadge}
            ${trustBadge}
          </span>
          <span>
            <h3>${escapeHtml(project.displayName)}</h3>
            <p>${description}</p>
          </span>
        </span>
        ${recommendation}
        <span class="project-card__footer">
          <span class="open-indicator" aria-hidden="true">打开 <span>↗</span></span>
        </span>
      </article>
    `;
  }

  function renderRecentProject(project, entry) {
    const requiresCapabilities = project.requiredCapabilities.length > 0;
    const availability = getProjectAvailability(project);
    const gateAttrs = requiresCapabilities
      ? ` data-required-capabilities="${escapeHtml(project.requiredCapabilities.join(" "))}"`
      : "";
    const linkDisabledAttr = availability === "unavailable" || availability === "unknown"
      ? ` aria-disabled="true"`
      : "";
    const usedAt = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(
      new Date(entry.lastOpenedAt),
    );
    const image = project.image
      ? `<span class="recent-item__media"><img src="${escapeHtml(project.image)}" alt="" loading="lazy" decoding="async" /></span>`
      : `<span class="recent-item__media recent-item__media--empty" aria-hidden="true">AI</span>`;

    return `
      <article class="recent-item" data-project-card data-project-id="${escapeHtml(project.id)}" data-project-url="${escapeHtml(project.url)}" data-availability="${availability}"${gateAttrs}>
        <a class="recent-item__link" href="${escapeHtml(project.url)}" aria-label="继续使用 ${escapeHtml(project.displayName)}"${linkDisabledAttr}></a>
        ${image}
        <span class="recent-item__copy">
          <span class="recent-item__category">${escapeHtml(project.category)}</span>
          <strong>${escapeHtml(project.displayName)}</strong>
          <small>使用 ${Math.max(1, Number(entry.visitCount || 1))} 次 · ${usedAt}</small>
        </span>
        <span class="recent-item__arrow" aria-hidden="true">↗</span>
      </article>
    `;
  }

  function renderProjectImage(project) {
    if (!project.image) return "";
    const cover = project.cover;
    const sizes = "(max-width: 560px) calc(100vw - 52px), (max-width: 900px) calc((100vw - 80px) / 2), (max-width: 1200px) calc((100vw - 120px) / 3), 320px";
    if (!cover || !Array.isArray(cover.avif) || !Array.isArray(cover.webp)) {
      return `<span class="project-card__media"><img src="${escapeHtml(project.image)}" alt="" loading="lazy" decoding="async" /></span>`;
    }
    const avifSrcset = cover.avif
      .map((variant) => `${escapeHtml(variant.src)} ${Number(variant.width)}w`)
      .join(", ");
    const webpSrcset = cover.webp
      .map((variant) => `${escapeHtml(variant.src)} ${Number(variant.width)}w`)
      .join(", ");
    const width = Math.max(1, Number(cover.width) || 1);
    const height = Math.max(1, Number(cover.height) || 1);
    return `<span class="project-card__media"><picture>
      <source type="image/avif" srcset="${avifSrcset}" sizes="${sizes}" />
      <source type="image/webp" srcset="${webpSrcset}" sizes="${sizes}" />
      <img src="${escapeHtml(project.image)}" alt="" width="${width}" height="${height}" sizes="${sizes}" loading="lazy" decoding="async" />
    </picture></span>`;
  }

  function showCapabilityGate(project, missing, detail) {
    const missingLabel = capabilityGate.describeMissingCapabilities(missing);
    const message = detail
      ? `「${project.name}」暂不可用：${detail}`
      : `「${project.name}」暂不可用，缺少：${missingLabel}。`;

    if (!elements.modelConfigStatus) {
      if (elements.projectLaunchStatus) {
        elements.projectLaunchStatus.textContent = `${message} 请联系管理员完成配置。`;
      }
      return;
    }

    elements.modelConfigStatus.textContent = message;

    if (window.location.hash !== "#models") {
      window.location.hash = "#models";
    } else {
      setPage("models");
    }
  }

  async function openProjectAfterCapabilityGate(project) {
    try {
      const config = modelState.loaded ? modelState.config : await loadModelConfig({ silent: true });
      const missing = capabilityGate.missingCapabilities(project.requiredCapabilities, config);

      if (missing.length > 0) {
        showCapabilityGate(project, missing);
        return;
      }

      trackHubEvent({
        eventType: "page_visit",
        projectId: project.id,
        projectPath: projectPathFromUrl(project.url),
      });
      recordRecentProject(project);
      window.location.assign(project.url);
    } catch (error) {
      showCapabilityGate(project, project.requiredCapabilities, error.message);
    }
  }

  function renderProjects(projects) {
    const filteredProjects = getFilteredProjects(projects);
    renderStatus(projects, filteredProjects);

    if (filteredProjects.length === 0) {
      elements.grid.innerHTML = "";
      if (projects.length === 0) {
        elements.emptyTitle.textContent = "还没有收录项目";
        elements.emptyMessage.textContent = "把项目加入数据文件后，这里会出现可点击跳转的项目入口。";
      } else {
        elements.emptyTitle.textContent = "没有匹配项目";
        elements.emptyMessage.textContent = "换个关键词或筛选条件，再查看项目入口。";
      }
      elements.empty.hidden = false;
      return;
    }

    elements.empty.hidden = true;
    elements.grid.innerHTML = filteredProjects
      .map((project) => renderProjectCard(project, { featured: featuredProjectOrder.has(project.id) }))
      .join("");
  }

  function renderRecentProjects(projects) {
    if (!elements.recentSection || !elements.recentGrid) {
      return;
    }

    const recentProjects = readRecentProjects()
      .map((entry) => ({
        entry,
        project: projects.find(
          (project) =>
            project.id === entry.projectId || projectPathFromUrl(project.url) === entry.path,
        ),
      }))
      .filter((item) => item.project)
      .slice(0, 4);
    elements.recentSection.hidden = recentProjects.length === 0;
    elements.recentGrid.innerHTML = recentProjects
      .map(({ project, entry }) => renderRecentProject(project, entry))
      .join("");
  }

  function refreshProjectViews() {
    if (modelState.projects.length === 0) {
      return;
    }
    renderProjects(modelState.projects);
    renderRecentProjects(modelState.projects);
  }

  async function requestJson(path, options) {
    const init = options || {};
    const headers = {
      accept: "application/json",
      ...(init.headers || {}),
    };

    if (init.body) {
      headers["content-type"] = "application/json";
    }

    if (init.admin && modelState.adminToken) {
      headers["x-hub-admin-token"] = modelState.adminToken;
    }

    const response = await fetch(apiUrl(path), {
      method: init.method || "GET",
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof body.error === "string"
          ? body.error
          : body.error && typeof body.error.message === "string"
            ? body.error.message
            : "请求失败";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return body;
  }

  async function verifyAdminAccess() {
    const token = elements.adminToken?.value.trim() || "";
    if (!token) {
      elements.adminAccessStatus.textContent = "请输入管理员口令。";
      elements.adminToken?.focus();
      return;
    }

    modelState.adminToken = token;
    elements.adminUnlock.disabled = true;
    elements.adminAccessStatus.textContent = "正在验证…";
    try {
      await requestJson("/api/admin/verify", { method: "POST", admin: true });
      modelState.adminVerified = true;
      elements.adminAccessGate.hidden = true;
      elements.adminNav.hidden = false;
      setPage("models");
      await loadModelConfig();
    } catch {
      modelState.adminToken = "";
      elements.adminAccessStatus.textContent = "口令不正确，未显示管理内容。";
      elements.adminToken?.select();
    } finally {
      elements.adminUnlock.disabled = false;
    }
  }

  function bindAdminAccessEvents() {
    if (!elements.adminUnlock) {
      return;
    }

    elements.adminUnlock.addEventListener("click", verifyAdminAccess);
    elements.adminToken?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        verifyAdminAccess();
      }
    });
  }

  function providerStatusMeta(provider) {
    if (provider.enabled && provider.configured) {
      return { label: "可用", state: "active" };
    }
    if (provider.configured) {
      return { label: "已保存 Key", state: "saved" };
    }
    return { label: "未配置", state: "empty" };
  }

  function statusBadge(label, state) {
    return `<span class="provider-state provider-state--${escapeHtml(state)}">${escapeHtml(label)}</span>`;
  }

  function renderModelCatalog(models) {
    if (!Array.isArray(models) || models.length === 0) {
      return '<p class="action-status">输入 API Key 后点击“获取模型列表”。</p>';
    }

    return models
      .map(
        (model) => `<span class="model-choice" data-provider-model-name="${escapeHtml(model)}">${escapeHtml(model)}</span>`,
      )
      .join("");
  }

  function renderProviderRow(provider) {
    const status = providerStatusMeta(provider);
    const keyPlaceholder = provider.configured ? "留空使用已保存的 Key" : "粘贴 AI Routing API Key";
    const modelCatalog = renderModelCatalog(provider.models);
    return `
      <div class="provider-row" data-provider="${escapeHtml(provider.id)}" data-provider-state="${escapeHtml(status.state)}">
        <div class="provider-row__head">
          <div class="provider-row__title">
            <label class="toggle-field provider-toggle">
              <input type="checkbox" data-provider-enabled ${provider.enabled ? "checked" : ""} />
              <span class="provider-name">${escapeHtml(provider.label)}</span>
            </label>
            <p>${escapeHtml(provider.adapter)} · ${provider.models.length} 个模型可供各项目独立选择</p>
          </div>
          ${statusBadge(status.label, status.state)}
        </div>
        <div class="provider-row__fields">
          <label class="text-field text-field--key">
            <span>API Key</span>
            <input data-provider-key type="password" autocomplete="off" placeholder="${escapeHtml(keyPlaceholder)}" />
            <small>Key 只保存到 Hub 后端；请仅通过 HTTPS 或 SSH 隧道输入。</small>
          </label>
          <div class="text-field">
            <button class="inline-button" data-provider-refresh-models type="button">获取模型列表</button>
            <small data-provider-model-status>${provider.models.length > 0 ? `已载入 ${provider.models.length} 个模型` : "尚未获取模型"}</small>
          </div>
          <label class="text-field text-field--wide">
            <span>Base URL</span>
            <input data-provider-base-url value="${escapeHtml(provider.baseUrl)}" readonly aria-readonly="true" />
          </label>
          <fieldset class="model-multi-field">
            <legend>API Key 可用模型（在具体项目中选择）</legend>
            <div class="model-choice-list" data-provider-model-catalog>${modelCatalog}</div>
          </fieldset>
          <button class="inline-button" data-provider-clear type="button">移除密钥</button>
        </div>
      </div>
    `;
  }

  function renderCozeIntegration(coze) {
    const config = coze || {};
    const state = config.enabled && config.configured ? "active" : config.configured ? "saved" : "empty";
    const stateLabel = config.enabled && config.configured ? "可用" : config.configured ? "已保存 PAT" : "未配置";
    return `
      <div class="provider-row provider-row--workflow" data-integration="coze" data-provider-state="${escapeHtml(state)}">
        <div class="provider-row__head">
          <div>
            <label class="toggle-field">
              <input type="checkbox" data-coze-enabled ${config.enabled ? "checked" : ""} />
              <span>Coze Resume Workflow</span>
            </label>
            <p>用于简历优化项目的工作流令牌和文件参数。</p>
          </div>
          ${statusBadge(stateLabel, state)}
        </div>
        <div class="provider-row__fields">
          <label class="text-field">
            <span>Coze PAT</span>
            <input data-coze-token type="password" autocomplete="off" placeholder="${config.configured ? "留空保持原 PAT" : "粘贴 Coze PAT"}" />
          </label>
          <label class="text-field">
            <span>Workflow ID</span>
            <input data-coze-workflow-id value="${escapeHtml(config.workflowId || "")}" />
          </label>
          <label class="text-field">
            <span>工作流名称</span>
            <input data-coze-workflow-name value="${escapeHtml(config.workflowName || "")}" />
          </label>
          <label class="text-field">
            <span>Coze 用户</span>
            <input data-coze-user-id value="${escapeHtml(config.userId || "")}" />
          </label>
          <label class="text-field">
            <span>Base URL</span>
            <select data-coze-base-url>
              <option value="https://api.coze.cn" ${config.baseUrl === "https://api.coze.cn" ? "selected" : ""}>api.coze.cn</option>
              <option value="https://api.coze.com" ${config.baseUrl === "https://api.coze.com" ? "selected" : ""}>api.coze.com</option>
            </select>
          </label>
          <label class="text-field">
            <span>文件参数</span>
            <select data-coze-file-shape>
              <option value="file_id_object" ${config.fileParameterShape === "file_id_object" ? "selected" : ""}>file_id_object</option>
              <option value="object" ${config.fileParameterShape === "object" ? "selected" : ""}>object</option>
              <option value="string" ${config.fileParameterShape === "string" ? "selected" : ""}>string</option>
            </select>
          </label>
          <button class="inline-button" data-coze-clear type="button">移除 PAT</button>
        </div>
      </div>
    `;
  }

  function renderModelConfig(config) {
    modelState.config = config;
    modelState.loaded = true;
    elements.defaultProvider.innerHTML = config.providers
      .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`)
      .join("");
    elements.defaultProvider.value = config.defaultProvider;
    elements.providerList.innerHTML = config.providers.map(renderProviderRow).join("");
    elements.cozeIntegration.innerHTML = renderCozeIntegration(config.integrations?.coze);
    elements.chatEndpoint.textContent = config.endpoints.chat;
    elements.compatibleEndpoint.textContent = config.endpoints.openAiCompatible;

    const enabledCount = config.providers.filter((provider) => provider.enabled && provider.configured).length;
    const configuredCount = config.providers.filter((provider) => provider.configured).length;
    const coze = config.integrations && config.integrations.coze;
    const hasCoze = Boolean(coze && coze.enabled && coze.configured);
    const unlockCount = enabledCount + (hasCoze ? 1 : 0);

    elements.modelConfigStatus.textContent =
      unlockCount > 0
        ? `${unlockCount} 个入口可用`
        : configuredCount > 0
          ? "已保存密钥，尚未启用"
          : "没有可用入口";
    elements.projectGateStatus.textContent =
      unlockCount > 0 ? "AI 项目可进入" : "AI 项目会停留在配置页";
    elements.gatewayHealth.textContent = config.projectAuthRequired ? "项目口令已启用" : "项目口令未启用";
    elements.gatewayHealth.dataset.state = config.projectAuthRequired ? "secure" : "open";
  }

  async function loadModelConfig(options) {
    const silent = Boolean(options && options.silent);

    if (modelState.loading) {
      return modelState.loading;
    }

    modelState.loading = (async () => {
      try {
        if (!silent) {
      elements.modelConfigStatus.textContent = "正在读取配置";
      elements.projectGateStatus.textContent = "正在检查项目门禁";
        }
      const config = await requestJson("/api/model-config");
      modelState.config = config;
      modelState.loaded = true;
      modelState.loadFailed = false;
      if (elements.providerList) {
        renderModelConfig(config);
      }
      refreshProjectViews();
      return config;
      } catch (error) {
        modelState.loadFailed = true;
        refreshProjectViews();
        if (!silent) {
      elements.modelConfigStatus.textContent = `配置读取失败：${error.message}`;
      elements.projectGateStatus.textContent = "无法判断项目门禁";
      elements.gatewayHealth.textContent = "网关未连接";
      elements.gatewayHealth.dataset.state = "error";
        }
        throw error;
      } finally {
        modelState.loading = null;
      }
    })();

    return modelState.loading;
  }

  function collectModelConfig() {
    const providers = {};
    const rows = Array.from(elements.providerList.querySelectorAll("[data-provider]"));

    for (const row of rows) {
      const id = row.getAttribute("data-provider");
      const models = Array.from(row.querySelectorAll("[data-provider-model-name]"))
        .map((item) => item.getAttribute("data-provider-model-name").trim())
        .filter(Boolean);
      providers[id] = {
        enabled: Boolean(row.querySelector("[data-provider-enabled]").checked),
        apiKey: row.querySelector("[data-provider-key]").value.trim(),
        models,
        enabledModels: models,
        baseUrl: row.querySelector("[data-provider-base-url]").value.trim(),
        clearKey: row.getAttribute("data-clear-key") === "true",
      };
    }

    const cozeRow = elements.cozeIntegration.querySelector("[data-integration='coze']");
    const coze = cozeRow
      ? {
          enabled: Boolean(cozeRow.querySelector("[data-coze-enabled]").checked),
          apiToken: cozeRow.querySelector("[data-coze-token]").value.trim(),
          workflowId: cozeRow.querySelector("[data-coze-workflow-id]").value.trim(),
          workflowName: cozeRow.querySelector("[data-coze-workflow-name]").value.trim(),
          userId: cozeRow.querySelector("[data-coze-user-id]").value.trim(),
          baseUrl: cozeRow.querySelector("[data-coze-base-url]").value.trim(),
          fileParameterShape: cozeRow.querySelector("[data-coze-file-shape]").value.trim(),
          clearToken: cozeRow.getAttribute("data-clear-token") === "true",
        }
      : {};

    return {
      defaultProvider: elements.defaultProvider.value,
      providers,
      integrations: {
        coze,
      },
    };
  }

  async function refreshProviderModels(row, button) {
    const apiKeyInput = row.querySelector("[data-provider-key]");
    const catalog = row.querySelector("[data-provider-model-catalog]");
    const status = row.querySelector("[data-provider-model-status]");
    const apiKey = apiKeyInput.value.trim();

    button.disabled = true;
    status.textContent = "正在从 AI Routing 获取模型…";
    try {
      const result = await requestJson("/api/provider-models", {
        method: "POST",
        admin: true,
        body: apiKey ? { apiKey } : {},
      });
      const models = Array.isArray(result.models) ? result.models : [];
      catalog.innerHTML = renderModelCatalog(models);
      row.removeAttribute("data-clear-key");
      row.querySelector("[data-provider-enabled]").checked = models.length > 0;
      row.querySelector(".provider-state").textContent = apiKey ? "保存后启用" : "模型已刷新";
      status.textContent = `已获取 ${models.length} 个模型。保存后由每个项目独立选择。`;
    } catch (error) {
      status.textContent = `获取失败：${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  async function saveModelConfig() {
    modelState.adminToken = elements.adminToken?.value.trim() || "";
    if (!modelState.adminToken) {
      elements.modelConfigStatus.textContent = "请输入管理员保存口令";
      elements.projectGateStatus.textContent = "配置未保存";
      return;
    }

    const nextConfig = collectModelConfig();
    const routing = nextConfig.providers.routing;
    if (routing?.enabled && routing.models.length === 0) {
      elements.modelConfigStatus.textContent = "请先获取 API Key 可用模型列表";
      elements.projectGateStatus.textContent = "配置未保存";
      return;
    }

    try {
      elements.modelConfigStatus.textContent = "正在保存配置";
      elements.projectGateStatus.textContent = "保存后重新计算可用入口";
      const config = await requestJson("/api/model-config", {
        method: "PUT",
        admin: true,
        body: nextConfig,
      });
      renderModelConfig(config);
      elements.modelConfigStatus.textContent = "配置已保存";
    } catch (error) {
      elements.modelConfigStatus.textContent = `保存失败：${error.message}`;
      elements.projectGateStatus.textContent = "配置未生效";
    }
  }

  function bindPageEvents() {
    for (const tab of elements.pageTabs) {
      tab.addEventListener("click", () => {
        const page = tab.dataset.pageTarget === "models" ? "models" : "projects";
        const nextHash = page === "models" ? "#models" : "#projects";
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash;
        } else {
          setPage(page);
        }
      });
    }

    window.addEventListener("hashchange", () => setPage(getPageFromHash()));
  }

  function bindModelEvents() {
    if (!elements.providerList) {
      return;
    }

    elements.reloadModelConfig.addEventListener("click", () => {
      modelState.loaded = false;
      loadModelConfig();
    });
    elements.adminToken?.addEventListener("input", () => {
      modelState.adminToken = elements.adminToken.value.trim();
    });
    elements.saveModelConfig.addEventListener("click", saveModelConfig);
    elements.providerList.addEventListener("input", (event) => {
      if (!event.target.matches("[data-provider-key]")) {
        return;
      }

      const row = event.target.closest("[data-provider]");
      if (!row || !event.target.value.trim()) {
        return;
      }

      row.removeAttribute("data-clear-key");
      row.querySelector("[data-provider-enabled]").checked = true;
      row.querySelector(".provider-state").textContent = "保存后启用";
    });
    elements.providerList.addEventListener("click", (event) => {
      const refreshButton = event.target.closest("[data-provider-refresh-models]");
      if (refreshButton) {
        refreshProviderModels(refreshButton.closest("[data-provider]"), refreshButton);
        return;
      }

      const clearButton = event.target.closest("[data-provider-clear]");
      if (!clearButton) {
        return;
      }
      const row = clearButton.closest("[data-provider]");
      row.setAttribute("data-clear-key", "true");
      row.querySelector("[data-provider-key]").value = "";
      row.querySelector("[data-provider-enabled]").checked = false;
      row.querySelector(".provider-state").textContent = "保存后清除";
    });
  }

  function bindCozeIntegrationEvents() {
    if (!elements.cozeIntegration) {
      return;
    }

    elements.cozeIntegration.addEventListener("click", (event) => {
      const clearButton = event.target.closest("[data-coze-clear]");
      if (!clearButton) {
        return;
      }
      const row = clearButton.closest("[data-integration='coze']");
      row.setAttribute("data-clear-token", "true");
      row.querySelector("[data-coze-token]").value = "";
      row.querySelector("[data-coze-enabled]").checked = false;
      row.querySelector(".provider-state").textContent = "保存后清除";
    });
  }

  function bindProjectCards(container, projects) {
    if (!container) {
      return;
    }

    container.addEventListener("click", (event) => {
      if (event.target.closest("[data-recommendation-details]")) {
        return;
      }

      const card = event.target.closest("[data-project-card]");
      if (!card || !container.contains(card)) {
        return;
      }

      const project = projects.find((item) => item.id === card.dataset.projectId);
      if (!project) {
        return;
      }

      if (card.dataset.requiredCapabilities) {
        event.preventDefault();
        openProjectAfterCapabilityGate(project);
        return;
      }

      trackHubEvent({
        eventType: "page_visit",
        projectId: project.id,
        projectPath: projectPathFromUrl(project.url),
      });
      recordRecentProject(project);
    });
  }

  function bindEvents(projects) {
    bindPageEvents();

    elements.purposeNav?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-purpose]");
      if (!button || !elements.purposeNav.contains(button)) {
        return;
      }

      state.purpose = purposeCategories[button.dataset.purpose] ? button.dataset.purpose : "all";
      state.category = "all";
      elements.category.value = "all";
      for (const item of elements.purposeNav.querySelectorAll("[data-purpose]")) {
        item.setAttribute("aria-pressed", String(item === button));
      }
      renderProjects(projects);
      elements.allProjectsDisclosure.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    bindProjectCards(elements.grid, projects);
    bindProjectCards(elements.recentGrid, projects);

    elements.search.addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      renderProjects(projects);
    });

    elements.category.addEventListener("change", (event) => {
      state.category = event.target.value;
      renderProjects(projects);
    });

    elements.sort.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderProjects(projects);
    });

    if (elements.resetFilters) {
      elements.resetFilters.addEventListener("click", () => {
        state.query = "";
        state.category = "all";
        state.purpose = "all";
        state.sort = "updated";
        elements.search.value = "";
        elements.category.value = "all";
        elements.sort.value = "updated";
        for (const item of elements.purposeNav?.querySelectorAll("[data-purpose]") || []) {
          item.setAttribute("aria-pressed", String(item.dataset.purpose === "all"));
        }
        renderProjects(projects);
        elements.search.focus();
      });
    }

    elements.reload.addEventListener("click", () => {
      window.location.reload();
    });

    elements.copyTemplate.addEventListener("click", async () => {
      const copied = await copyText(projectTemplate);
      elements.actionStatus.textContent = copied
        ? "项目模板已复制。"
        : "复制失败，可以打开 README 查看模板。";
    });
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through to the textarea method for local file usage.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function init() {
    const projects = Array.isArray(window.AI_PROJECTS)
      ? window.AI_PROJECTS.map(normalizeProject).filter((project) => isSafeUrl(project.url))
      : [];

    modelState.projects = projects;

    renderFilters(projects);
    bindEvents(projects);
    bindModelEvents();
    bindCozeIntegrationEvents();
    bindAdminAccessEvents();
    renderProjects(projects);
    renderRecentProjects(projects);
    if (!elements.adminAccessGate) {
      setPage(getPageFromHash());
      loadModelConfig({ silent: true }).catch(() => {});
    }
  }

  init();
})();
