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
    providerRelayQuery: "",
    providerRelayStatus: "all",
    providerRelayModel: "",
    providerRelayId: "",
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
  const sidebarCollapsedStorageKey = "aiHub.sidebarCollapsed.v1";
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
  const modelAtlasState = {
    loaded: false,
    loading: null,
  };
  const providerRelayState = {
    loaded: false,
    loading: null,
    error: null,
    providers: [],
    priceCatalog: { models: [], offers: [] },
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
    modelAtlas: document.querySelector("#modelAtlas"),
    providerRelayListView: document.querySelector("#providerRelayListView"),
    providerRelayDetailView: document.querySelector("#providerRelayDetailView"),
    providerRelayGrid: document.querySelector("#providerRelayGrid"),
    providerRelayListStatus: document.querySelector("#providerRelayListStatus"),
    providerRelaySearch: document.querySelector("#providerRelaySearch"),
    providerRelayStatusFilter: document.querySelector("#providerRelayStatusFilter"),
    providerRelayModelFilter: document.querySelector("#providerRelayModelFilter"),
    providerRelayComparisonStatus: document.querySelector("#providerRelayComparisonStatus"),
    providerRelayPriceTableBody: document.querySelector("#providerRelayPriceTableBody"),
    providerRelayBack: document.querySelector("#providerRelayBack"),
    providerRelayDetailKind: document.querySelector("#providerRelayDetailKind"),
    providerRelayDetailTitle: document.querySelector("#providerRelayDetailTitle"),
    providerRelayDetailSummary: document.querySelector("#providerRelayDetailSummary"),
    providerRelayDetailStatus: document.querySelector("#providerRelayDetailStatus"),
    providerRelayDetailModels: document.querySelector("#providerRelayDetailModels"),
    providerRelayDetailPricing: document.querySelector("#providerRelayDetailPricing"),
    providerRelayDetailOffers: document.querySelector("#providerRelayDetailOffers"),
    providerRelayDetailApi: document.querySelector("#providerRelayDetailApi"),
    providerRelayDetailExample: document.querySelector("#providerRelayDetailExample"),
    providerRelayDetailConcurrency: document.querySelector("#providerRelayDetailConcurrency"),
    providerRelayDetailUsage: document.querySelector("#providerRelayDetailUsage"),
    providerRelayDetailVerified: document.querySelector("#providerRelayDetailVerified"),
    providerRelayDetailCta: document.querySelector("#providerRelayDetailCta"),
    sidebar: document.querySelector("#hubTaskSidebar"),
    sidebarToggle: document.querySelector("#hubSidebarToggle"),
    mobileMenuToggle: document.querySelector("#hubMobileMenuToggle"),
    sidebarMask: document.querySelector("#hubSidebarMask"),
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
    const hasModelIntro = elements.pagePanels.some((panel) => panel.dataset.pagePanel === "model-intro");
    const providerRelayHash = window.location.hash.match(/^#provider-service\/([a-z0-9][a-z0-9-]{1,79})$/i);
    state.providerRelayId = providerRelayHash ? providerRelayHash[1].toLowerCase() : "";
    const hashPages = {
      "#models": hasModelIntro ? "model-intro" : "models",
      "#projects": "projects",
      "#provider-service": "provider-service",
    };

    return providerRelayHash
      ? "provider-service"
      : hashPages[window.location.hash] || (isAdminPage && !window.location.hash ? "models" : "projects");
  }

  function isMobileSidebarViewport() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
  }

  function setSidebarCollapsed(collapsed, options = {}) {
    const nextValue = Boolean(collapsed) && !isMobileSidebarViewport();
    document.body.classList.toggle("hub-sidebar-collapsed", nextValue);
    if (elements.sidebarToggle) {
      elements.sidebarToggle.setAttribute("aria-expanded", String(!nextValue));
      elements.sidebarToggle.setAttribute("aria-label", nextValue ? "展开菜单" : "收起菜单");
      elements.sidebarToggle.title = nextValue ? "展开菜单" : "收起菜单";
      const icon = elements.sidebarToggle.querySelector("[aria-hidden='true']");
      if (icon) {
        icon.textContent = nextValue ? "›" : "‹";
      }
    }
    if (options.persist !== false && !isMobileSidebarViewport()) {
      try {
        window.localStorage.setItem(sidebarCollapsedStorageKey, String(nextValue));
      } catch {
        // Sidebar preference is optional and should never block navigation.
      }
    }
  }

  function setMobileSidebarOpen(open) {
    const nextValue = Boolean(open) && isMobileSidebarViewport();
    document.body.classList.toggle("hub-sidebar-mobile-open", nextValue);
    if (elements.sidebarMask) {
      elements.sidebarMask.hidden = !nextValue;
    }
    if (elements.mobileMenuToggle) {
      elements.mobileMenuToggle.setAttribute("aria-expanded", String(nextValue));
      elements.mobileMenuToggle.setAttribute("aria-label", nextValue ? "关闭 AI HUB 菜单" : "打开 AI HUB 菜单");
    }
  }

  function initSidebarState() {
    let collapsed = false;
    try {
      collapsed = window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
    } catch {
      collapsed = false;
    }
    setSidebarCollapsed(collapsed, { persist: false });
    setMobileSidebarOpen(false);
  }

  function setPage(page) {
    if (elements.adminAccessGate && !modelState.adminVerified) {
      for (const panel of elements.pagePanels) {
        panel.hidden = true;
      }
      return;
    }

    const supportsPage = elements.pagePanels.some((panel) => panel.dataset.pagePanel === page);
    state.page = supportsPage ? page : "projects";

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

    if (state.page === "model-intro") {
      loadModelAtlas();
    }

    if (state.page === "models" && !modelState.loaded) {
      loadModelConfig();
    }

    if (state.page === "provider-service") {
      loadProviderRelays();
    }
  }

  function loadAtlasScript(src, id) {
    if (document.querySelector(`[data-model-atlas-script="${id}"]`)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.modelAtlasScript = id;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.body.appendChild(script);
    });
  }

  function loadModelAtlas() {
    if (!elements.modelAtlas || modelAtlasState.loaded) {
      return Promise.resolve();
    }
    if (modelAtlasState.loading) {
      return modelAtlasState.loading;
    }

    modelAtlasState.loading = (async () => {
      try {
        const response = await fetch("/hub/models.html", { credentials: "same-origin" });
        if (!response.ok) {
          throw new Error("Model atlas could not be loaded.");
        }

        const sourceDocument = new DOMParser().parseFromString(await response.text(), "text/html");
        const source = sourceDocument.querySelector(".model-guide-shell");
        if (!source) {
          throw new Error("Model atlas content is unavailable.");
        }

        elements.modelAtlas.innerHTML = source.innerHTML;
        await loadAtlasScript("/hub/model-guide-data.js?v=20260728-gpt-only1", "data");
        await loadAtlasScript("/hub/model-guide.js?v=20260730-comparison1", "app");
        elements.modelAtlas.removeAttribute("aria-busy");
        modelAtlasState.loaded = true;
      } catch {
        elements.modelAtlas.removeAttribute("aria-busy");
        elements.modelAtlas.innerHTML = `
          <div class="hub-model-atlas__error" role="status">
            <span class="eyebrow">模型图鉴</span>
            <h2 id="compareTitle">模型图鉴暂时无法加载</h2>
            <p>请刷新页面后重试，或在独立页面查看模型资料。</p>
            <a class="action-button" href="/hub/models.html">打开模型图鉴</a>
          </div>
        `;
      } finally {
        modelAtlasState.loading = null;
      }
    })();

    return modelAtlasState.loading;
  }

  const providerRelayKindLabels = {
    internal: "当前通道",
    aggregator: "聚合代理",
    relay: "代理商服务",
  };

  const providerRelayStatusMeta = {
    connected: { label: "已接入", tone: "connected" },
    trial: { label: "可试用", tone: "trial" },
    maintenance: { label: "维护中", tone: "maintenance" },
    pending: { label: "待核验", tone: "pending" },
  };

  function providerRelayStatus(status) {
    return providerRelayStatusMeta[status] || providerRelayStatusMeta.pending;
  }

  function providerRelayVerifiedLabel(value) {
    if (!value) return "最后核验时间：尚未核验";
    return `最后核验时间：${formatDate(value)}`;
  }

  const providerRelayPriceStatusMeta = {
    verified: { label: "已核验", tone: "verified" },
    estimated: { label: "估算", tone: "estimated" },
    pending: { label: "待核验", tone: "pending" },
  };

  function providerRelayPriceStatus(status) {
    return providerRelayPriceStatusMeta[status] || providerRelayPriceStatusMeta.pending;
  }

  function formatPriceNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "待核验";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(value);
  }

  function formatOfferPrice(offer, field) {
    if (typeof offer[field] !== "number" || !Number.isFinite(offer[field])) return "待核验";
    const prefix = offer.currency ? `${offer.currency} ` : "";
    return `${prefix}${formatPriceNumber(offer[field])}`;
  }

  function formatOfferMultiplier(offer) {
    return typeof offer.multiplier === "number" && Number.isFinite(offer.multiplier)
      ? `${formatPriceNumber(offer.multiplier)}×`
      : "待核验";
  }

  function providerRelayPriceSummary(provider) {
    const verified = (provider.modelOffers || [])
      .filter((offer) => typeof offer.multiplier === "number" && offer.status === "verified")
      .map((offer) => offer.multiplier);
    if (verified.length === 0) return provider.pricing.summary;
    return `最低 ${formatPriceNumber(Math.min(...verified))}× · ${provider.pricing.summary}`;
  }

  function renderProviderRelayModelOptions() {
    if (!elements.providerRelayModelFilter) return;
    const models = providerRelayState.priceCatalog.models || [];
    const selected = models.includes(state.providerRelayModel) ? state.providerRelayModel : "";
    state.providerRelayModel = selected;
    elements.providerRelayModelFilter.innerHTML = [
      '<option value="" disabled>请选择模型</option>',
      ...models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`),
    ].join("");
    elements.providerRelayModelFilter.value = selected;
  }

  function renderProviderRelayComparison() {
    if (!elements.providerRelayPriceTableBody) return;
    const selectedModel = state.providerRelayModel.toLowerCase();
    if (!selectedModel) {
      elements.providerRelayPriceTableBody.innerHTML = `
        <tr><td colspan="6" class="provider-relay-price-table__empty">先选择一个模型，系统会列出提供该模型的代理商。</td></tr>
      `;
      if (elements.providerRelayComparisonStatus) {
        elements.providerRelayComparisonStatus.textContent = "请选择模型后查看代理商报价。";
      }
      return;
    }
    const offers = (providerRelayState.priceCatalog.offers || []).filter((offer) =>
      offer.model.toLowerCase() === selectedModel,
    );
    if (!offers.length) {
      elements.providerRelayPriceTableBody.innerHTML = `
        <tr><td colspan="6" class="provider-relay-price-table__empty">暂无公开价格倍率。请先选择其他模型，或等待管理员完成平台价格核验。</td></tr>
      `;
    } else {
      elements.providerRelayPriceTableBody.innerHTML = offers.map((offer) => {
        const priceStatus = providerRelayPriceStatus(offer.status);
        const providerStatus = providerRelayStatus(offer.providerStatus);
        return `
          <tr>
            <th scope="row"><strong>${escapeHtml(offer.label || offer.model)}</strong><small>${escapeHtml(offer.model)}</small></th>
            <td><strong>${escapeHtml(offer.providerName)}</strong><small>${escapeHtml(providerStatus.label)} · ${escapeHtml(offer.speed.label)}</small></td>
            <td><strong class="provider-relay-multiplier provider-relay-multiplier--${priceStatus.tone}">${escapeHtml(formatOfferMultiplier(offer))}</strong><small>${escapeHtml(priceStatus.label)}</small></td>
            <td><span>入 ${escapeHtml(formatOfferPrice(offer, "inputPrice"))}</span><small>出 ${escapeHtml(formatOfferPrice(offer, "outputPrice"))} · ${escapeHtml(offer.unit)}</small></td>
            <td><span class="provider-relay-status-badge provider-relay-status-badge--${providerStatus.tone}">${escapeHtml(providerStatus.label)}</span><small>${escapeHtml(priceStatus.label)}</small></td>
            <td><a class="action-button action-button--secondary" href="#provider-service/${encodeURIComponent(offer.providerId)}">查看</a></td>
          </tr>
        `;
      }).join("");
    }
    if (elements.providerRelayComparisonStatus) {
      const label = state.providerRelayModel || "当前模型";
      elements.providerRelayComparisonStatus.textContent = `${label} · ${offers.length} 条代理商报价 · 倍率和价格仅展示已公开或待核验资料`;
    }
  }

  function renderProviderRelayDetailOffers(provider) {
    if (!elements.providerRelayDetailOffers) return;
    const offers = provider.modelOffers || [];
    if (!offers.length) {
      elements.providerRelayDetailOffers.innerHTML = '<p class="provider-relay-muted">该平台尚未提交具体模型倍率或价格资料。</p>';
      return;
    }
    elements.providerRelayDetailOffers.innerHTML = `
      <div class="provider-relay-detail-offer-list">
        ${offers.map((offer) => {
          const status = providerRelayPriceStatus(offer.status);
          return `
            <article class="provider-relay-detail-offer">
              <div><strong>${escapeHtml(offer.label || offer.model)}</strong><small>${escapeHtml(offer.model)}</small></div>
              <div><span class="provider-relay-detail-offer__label">倍率</span><strong class="provider-relay-multiplier provider-relay-multiplier--${status.tone}">${escapeHtml(formatOfferMultiplier(offer))}</strong></div>
              <div><span class="provider-relay-detail-offer__label">输入 / 输出</span><span>${escapeHtml(formatOfferPrice(offer, "inputPrice"))} / ${escapeHtml(formatOfferPrice(offer, "outputPrice"))}</span></div>
              <div><span class="provider-relay-detail-offer__label">核验</span><span>${escapeHtml(status.label)} · ${escapeHtml(providerRelayVerifiedLabel(offer.lastVerifiedAt).replace("最后核验时间：", ""))}</span></div>
            </article>
          `;
        }).join("")}
      </div>
      <p class="provider-relay-muted">倍率参考平台公开价格或管理员核验记录；实际扣费以平台账单和计费单位为准。</p>
    `;
  }

  function renderProviderRelayAction(provider, compact = false) {
    const active = ["connected", "trial"].includes(provider.status);
    const detailHref = `#provider-service/${encodeURIComponent(provider.id)}`;
    const detail = `<a class="action-button action-button--secondary" href="${detailHref}" data-provider-relay-open>${compact ? "查看" : "查看详情"}</a>`;
    if (provider.kind === "internal") {
      return `${detail}<a class="action-button" href="/hub/key-config/">配置当前 Hub API</a>`;
    }
    if (!active) {
      return `${detail}<button class="action-button provider-relay-action--disabled" type="button" disabled>${compact ? "待接入" : "暂未开放"}</button>`;
    }
    if (provider.docsUrl) {
      return `${detail}<a class="action-button" href="${escapeHtml(provider.docsUrl)}">立即获取 API</a>`;
    }
    return `${detail}<button class="action-button provider-relay-action--disabled" type="button" disabled>开通链接待补充</button>`;
  }

  function renderProviderRelayCard(provider) {
    const status = providerRelayStatus(provider.status);
    const modelSummary = provider.models.slice(0, 4).map((model) => `<span>${escapeHtml(model)}</span>`).join("");
    return `
      <article class="provider-relay-card" data-provider-relay-id="${escapeHtml(provider.id)}">
        <div class="provider-relay-card__topline">
          <span class="provider-relay-kind">${escapeHtml(providerRelayKindLabels[provider.kind] || "中转站")}</span>
          <span class="provider-relay-status-badge provider-relay-status-badge--${status.tone}">${escapeHtml(status.label)}</span>
        </div>
        <h3>${escapeHtml(provider.name)}</h3>
        <p class="provider-relay-card__summary">${escapeHtml(provider.summary)}</p>
        <div class="provider-relay-card__models" aria-label="支持的模型">${modelSummary || "<span>模型资料待补充</span>"}</div>
        <dl class="provider-relay-card__metrics">
          <div><dt>价格倍率</dt><dd>${escapeHtml(providerRelayPriceSummary(provider))}</dd></div>
          <div><dt>速度</dt><dd>${escapeHtml(provider.speed.label)}</dd></div>
          <div><dt>稳定性</dt><dd>${escapeHtml(provider.stability.label)}</dd></div>
          <div><dt>充值</dt><dd>${provider.supportsRecharge ? "支持" : "待确认"}</dd></div>
        </dl>
        <div class="provider-relay-card__footer">
          <span>${escapeHtml(providerRelayVerifiedLabel(provider.lastVerifiedAt))}</span>
          <div class="provider-relay-card__actions">${renderProviderRelayAction(provider, true)}</div>
        </div>
      </article>
    `;
  }

  function renderProviderRelayGrid() {
    if (!elements.providerRelayGrid) return;
    const filterToolbar = elements.providerRelaySearch?.closest(".provider-relay-toolbar");
    if (!state.providerRelayModel) {
      if (filterToolbar) filterToolbar.hidden = true;
      elements.providerRelayGrid.innerHTML = `
        <div class="provider-relay-empty" role="status">
          <strong>先选择模型</strong>
          <p>选择模型后，这里只会展示支持该模型的代理商服务。</p>
        </div>
      `;
      if (elements.providerRelayListStatus) {
        elements.providerRelayListStatus.textContent = "请选择模型后查看支持它的代理商。";
      }
      return;
    }
    if (filterToolbar) filterToolbar.hidden = false;
    const query = state.providerRelayQuery.toLowerCase();
    const selectedModel = state.providerRelayModel.toLowerCase();
    const filtered = providerRelayState.providers.filter((provider) => {
      const matchesStatus = state.providerRelayStatus === "all" || provider.status === state.providerRelayStatus;
      const matchesModel = provider.models.some((item) => item.toLowerCase() === selectedModel) ||
        provider.modelOffers.some((offer) => offer.model.toLowerCase() === selectedModel);
      const searchable = [provider.name, provider.summary, ...provider.models].join(" ").toLowerCase();
      return matchesModel && matchesStatus && (!query || searchable.includes(query));
    });
    elements.providerRelayGrid.innerHTML = filtered.length
      ? filtered.map(renderProviderRelayCard).join("")
      : `
        <div class="provider-relay-empty" role="status">
          <strong>没有符合条件的中转站</strong>
          <p>可以清空筛选，或等待更多平台资料完成核验。</p>
          <button class="action-button action-button--secondary" type="button" data-provider-relay-reset>清空筛选</button>
        </div>
      `;
    if (elements.providerRelayListStatus) {
      elements.providerRelayListStatus.textContent = `${state.providerRelayModel} · 找到 ${filtered.length} 个支持该模型的代理商`;
    }
  }

  function renderProviderRelayPricing(provider) {
    const plans = provider.pricing.plans || [];
    if (plans.length === 0) {
      return `<p class="provider-relay-muted">${escapeHtml(provider.pricing.summary)}。${escapeHtml(provider.pricing.unit)}。</p>`;
    }
    return `
      <p class="provider-relay-pricing-summary">${escapeHtml(provider.pricing.summary)}</p>
      <div class="provider-relay-plan-list">
        ${plans.map((plan) => `
          <div class="provider-relay-plan">
            <strong>${escapeHtml(plan.name)}</strong>
            <span>${escapeHtml(plan.price)}</span>
            <small>${escapeHtml(plan.included || provider.pricing.unit)}</small>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderProviderRelayDetail(provider) {
    if (!elements.providerRelayDetailView) return;
    if (!provider) {
      elements.providerRelayDetailKind.textContent = "中转站详情";
      elements.providerRelayDetailTitle.textContent = "没有找到这个中转站";
      elements.providerRelayDetailSummary.textContent = "平台可能已下线，或资料尚未公开。";
      elements.providerRelayDetailStatus.textContent = "未找到";
      elements.providerRelayDetailStatus.dataset.state = "pending";
      elements.providerRelayDetailModels.innerHTML = "";
      elements.providerRelayDetailPricing.innerHTML = "<p class=\"provider-relay-muted\">暂无公开资料。</p>";
      if (elements.providerRelayDetailOffers) elements.providerRelayDetailOffers.innerHTML = "";
      elements.providerRelayDetailApi.textContent = "";
      elements.providerRelayDetailExample.querySelector("code").textContent = "暂未开放 API 调用。";
      elements.providerRelayDetailConcurrency.textContent = "暂无资料";
      elements.providerRelayDetailUsage.textContent = "请返回目录选择已公开的平台。";
      elements.providerRelayDetailVerified.textContent = "资料未找到";
      elements.providerRelayDetailCta.innerHTML = "";
      return;
    }

    const status = providerRelayStatus(provider.status);
    elements.providerRelayDetailKind.textContent = providerRelayKindLabels[provider.kind] || "中转站详情";
    elements.providerRelayDetailTitle.textContent = provider.name;
    elements.providerRelayDetailSummary.textContent = provider.summary;
    elements.providerRelayDetailStatus.textContent = status.label;
    elements.providerRelayDetailStatus.dataset.state = status.tone;
    elements.providerRelayDetailModels.innerHTML = provider.models.length
      ? provider.models.map((model) => `<span>${escapeHtml(model)}</span>`).join("")
      : "<span>模型资料待补充</span>";
    elements.providerRelayDetailPricing.innerHTML = renderProviderRelayPricing(provider);
    renderProviderRelayDetailOffers(provider);
    elements.providerRelayDetailApi.textContent = provider.apiBaseUrl || "待平台资料核验";
    const apiBase = provider.apiBaseUrl || "/api/v1";
    const exampleModel = provider.modelOffers?.[0]?.model || provider.models.find((model) => !/^(GPT 系列|待补充平台资料)$/i.test(model)) || "model-id";
    const example = provider.apiBaseUrl
      ? `curl ${window.location.origin}${apiBase}/chat/completions -H "Authorization: Bearer \${PROVIDER_API_KEY}" -H "Content-Type: application/json" -d '{"model":"${exampleModel}","messages":[{"role":"user","content":"Hello"}]}'`
      : "平台公开 API 地址待补充，暂不提供可复制调用示例。";
    elements.providerRelayDetailExample.querySelector("code").textContent = example;
    elements.providerRelayDetailConcurrency.textContent = provider.concurrency;
    elements.providerRelayDetailUsage.textContent = `${provider.usage} ${provider.docs}`;
    elements.providerRelayDetailVerified.textContent = providerRelayVerifiedLabel(provider.lastVerifiedAt);
    elements.providerRelayDetailCta.innerHTML = renderProviderRelayAction(provider);
  }

  function renderProviderRelayView() {
    if (!elements.providerRelayListView || !elements.providerRelayDetailView) return;
    const detail = state.providerRelayId
      ? providerRelayState.providers.find((provider) => provider.id === state.providerRelayId)
      : null;
    const showDetail = Boolean(state.providerRelayId);
    elements.providerRelayListView.hidden = showDetail;
    elements.providerRelayDetailView.hidden = !showDetail;
    if (showDetail && providerRelayState.loaded) {
      renderProviderRelayDetail(detail);
    }
    if (!showDetail && providerRelayState.loaded) {
      renderProviderRelayModelOptions();
      renderProviderRelayComparison();
      renderProviderRelayGrid();
    }
  }

  function buildLocalProviderModelPrices(providers) {
    const models = Array.from(new Set(providers.flatMap((provider) => provider.modelOffers?.map((offer) => offer.model) || [])))
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    const offers = providers.flatMap((provider) => (provider.modelOffers || []).map((offer) => ({
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.kind,
      providerStatus: provider.status,
      providerStatusLabel: provider.statusLabel,
      model: offer.model,
      label: offer.label,
      status: offer.status,
      statusLabel: offer.statusLabel,
      multiplier: offer.multiplier,
      inputPrice: offer.inputPrice,
      outputPrice: offer.outputPrice,
      currency: offer.currency,
      unit: offer.unit,
      billing: offer.billing,
      notes: offer.notes,
      sourceUrl: offer.sourceUrl,
      lastVerifiedAt: offer.lastVerifiedAt,
      speed: provider.speed,
      stability: provider.stability,
    })));
    return { models, offers };
  }

  async function loadProviderRelays() {
    if (!elements.providerRelayGrid) return;
    renderProviderRelayView();
    if (providerRelayState.loaded) return providerRelayState.providers;
    if (providerRelayState.loading) return providerRelayState.loading;

    providerRelayState.loading = (async () => {
      try {
        const response = await requestJson("/api/provider-relays?pageSize=50");
        const providers = Array.isArray(response.data) ? response.data : [];
        providerRelayState.providers = providers;
        try {
          const priceResponse = await requestJson("/api/provider-model-prices");
          providerRelayState.priceCatalog = priceResponse.data && typeof priceResponse.data === "object"
            ? priceResponse.data
            : buildLocalProviderModelPrices(providers);
        } catch {
          providerRelayState.priceCatalog = buildLocalProviderModelPrices(providers);
        }
        providerRelayState.loaded = true;
        providerRelayState.error = null;
        renderProviderRelayView();
        return providers;
      } catch (error) {
        providerRelayState.error = error;
        if (elements.providerRelayListStatus) {
          elements.providerRelayListStatus.innerHTML = `目录读取失败：${escapeHtml(error.message)} <button class="inline-button" type="button" data-provider-relay-retry>重试</button>`;
        }
        return [];
      } finally {
        providerRelayState.loading = null;
      }
    })();
    return providerRelayState.loading;
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
    return missing.length > 0 ? "setup" : "ready";
  }

  function availabilityLabel(availability) {
    return {
      ready: "可使用",
      checking: "检查中",
      setup: "需配置模型",
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
      const setupCount = projects.filter((project) => getProjectAvailability(project) === "setup").length;
      const unknownCount = projects.filter((project) => getProjectAvailability(project) === "unknown").length;
      const liveCount = projects.filter((project) => project.stage === "live").length;
      elements.count.textContent = setupCount > 0
        ? `${liveCount} 已上线 · ${setupCount} 需配置模型`
        : unknownCount > 0
          ? `${liveCount} 已上线 · 状态待确认`
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
    const linkDisabledAttr = availability === "setup" || availability === "unknown"
      ? ` aria-disabled="true"`
      : "";
    const trustBadge = project.trust
      ? `<span class="pill pill--trust" title="将处理：${escapeHtml(project.trust.data)}；${escapeHtml(project.trust.boundary)}">隐私提醒</span>`
      : "";
    const featuredBadge = isFeatured ? `<span class="pill pill--featured">精选</span>` : "";
    const stageBadge = `<span class="pill pill--stage" data-stage="${escapeHtml(project.stage)}">${escapeHtml(fieldLabel(project.stage))}</span>`;
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
            ${stageBadge}
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
    const linkDisabledAttr = availability === "setup" || availability === "unknown"
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
        const page = tab.dataset.pageTarget || "projects";
        const nextHash =
          page === "model-intro"
            ? "#models"
            : page === "provider-service"
              ? "#provider-service"
              : page === "models"
                ? "#models"
                : "#projects";
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash;
        } else {
          setPage(page);
        }
        setMobileSidebarOpen(false);
      });
    }

    window.addEventListener("hashchange", () => setPage(getPageFromHash()));
  }

  function bindSidebarEvents() {
    initSidebarState();

    elements.sidebarToggle?.addEventListener("click", () => {
      if (isMobileSidebarViewport()) {
        setMobileSidebarOpen(false);
        return;
      }
      setSidebarCollapsed(!document.body.classList.contains("hub-sidebar-collapsed"));
    });

    elements.mobileMenuToggle?.addEventListener("click", () => {
      setMobileSidebarOpen(!document.body.classList.contains("hub-sidebar-mobile-open"));
    });

    elements.sidebarMask?.addEventListener("click", () => setMobileSidebarOpen(false));
    elements.sidebar?.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setMobileSidebarOpen(false);
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    });
    window.addEventListener("resize", () => {
      if (!isMobileSidebarViewport()) {
        setMobileSidebarOpen(false);
      }
    });
  }

  function bindProviderRelayEvents() {
    if (!elements.providerRelayGrid) {
      return;
    }

    elements.providerRelaySearch?.addEventListener("input", (event) => {
      state.providerRelayQuery = event.target.value.trim();
      renderProviderRelayGrid();
    });

    elements.providerRelayStatusFilter?.addEventListener("change", (event) => {
      state.providerRelayStatus = event.target.value || "all";
      renderProviderRelayGrid();
    });

    elements.providerRelayModelFilter?.addEventListener("change", (event) => {
      state.providerRelayModel = event.target.value || "";
      renderProviderRelayComparison();
      renderProviderRelayGrid();
    });

    elements.providerRelayBack?.addEventListener("click", () => {
      window.location.hash = "#provider-service";
    });

    elements.providerRelayGrid.addEventListener("click", (event) => {
      const reset = event.target.closest("[data-provider-relay-reset]");
      if (reset) {
        state.providerRelayQuery = "";
        state.providerRelayStatus = "all";
        state.providerRelayModel = "";
        if (elements.providerRelaySearch) elements.providerRelaySearch.value = "";
        if (elements.providerRelayStatusFilter) elements.providerRelayStatusFilter.value = "all";
        if (elements.providerRelayModelFilter) elements.providerRelayModelFilter.value = "";
        renderProviderRelayComparison();
        renderProviderRelayGrid();
        elements.providerRelaySearch?.focus();
        return;
      }

      const retry = event.target.closest("[data-provider-relay-retry]");
      if (retry) {
        providerRelayState.loaded = false;
        loadProviderRelays();
      }
    });
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
    bindSidebarEvents();
    bindProviderRelayEvents();

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
