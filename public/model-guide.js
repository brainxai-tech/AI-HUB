(function () {
  const data = window.AI_MODEL_GUIDE_DATA || { models: [], sources: [] };
  const models = Array.isArray(data.models) ? data.models.slice() : [];
  const sources = Array.isArray(data.sources) ? data.sources.slice() : [];
  const providers = Array.isArray(data.providers) ? data.providers.slice() : [];
  const benchmarkSources = data.benchmarkSources || {};
  const metricCatalog = [
    { id: "overall", label: "LiveBench 综合" },
    { id: "reasoning", label: "推理" },
    { id: "coding", label: "编程" },
    { id: "agentic", label: "Agent 编程" },
    { id: "math", label: "数学" },
    { id: "data", label: "数据分析" },
    { id: "language", label: "语言" },
    { id: "instruction", label: "指令遵循" },
  ];
  const providerOrder = ["OpenAI", "Gemini", "Anthropic", "Kimi", "GLM", "DeepSeek", "Grok"];
  const providerMarks = {
    OpenAI: "GPT", Gemini: "Ge", Anthropic: "A", Kimi: "K",
    GLM: "GLM", DeepSeek: "DS", Grok: "xAI",
  };
  const elements = {
    rankingTabs: document.getElementById("rankingTabs"),
    leaderboard: document.getElementById("leaderboard"),
    providerProfiles: document.getElementById("providerProfiles"),
    search: document.getElementById("modelSearch"),
    sort: document.getElementById("modelSort"),
    providerFilters: document.getElementById("providerFilters"),
    resultCount: document.getElementById("modelResultCount"),
    grid: document.getElementById("modelGrid"),
    empty: document.getElementById("modelEmpty"),
    sourceList: document.getElementById("sourceList"),
  };
  const state = { metric: "overall", provider: "all", query: "", sort: "overall" };

  if (!models.length || !elements.grid) {
    if (elements.grid) {
      elements.grid.innerHTML = '<div class="empty-state"><h3>模型资料暂时无法加载</h3><p>请稍后刷新页面。</p></div>';
    }
    return;
  }

  renderProviderProfiles();
  renderTabs();
  renderProviderFilters();
  renderSources();
  renderLeaderboard();
  renderModels();
  bindEvents();

  function renderProviderProfiles() {
    if (!elements.providerProfiles) return;
    const capabilityMetrics = [
      { id: "reasoning", label: "推理" },
      { id: "coding", label: "编程" },
      { id: "agentic", label: "Agent 编程" },
      { id: "data", label: "数据分析" },
    ];
    const availableProfiles = providerOrder.map(function (providerId) {
      return providers.find(function (profile) { return profile.id === providerId; });
    }).filter(Boolean);

    elements.providerProfiles.innerHTML = availableProfiles.map(function (profile) {
      const providerModels = models.filter(function (model) { return model.provider === profile.id; });
      return '<details class="model-provider-card" data-provider="' + escapeHtml(profile.id) + '">' +
        '<summary><span class="model-provider-card__head"><span class="model-provider-card__mark" aria-hidden="true">' +
        escapeHtml(providerMarks[profile.id] || profile.id) + '</span><span><small>' + escapeHtml(profile.family) +
        ' · ' + providerModels.length + ' 个型号</small><strong>' + escapeHtml(profile.id) + '</strong></span></span>' +
        '<span class="model-provider-card__statement">' + escapeHtml(profile.statement) + '</span>' +
        '<span class="model-provider-card__chips">' + profile.strengths.map(function (item) {
          return '<span>' + escapeHtml(item) + '</span>';
        }).join("") + '</span><span class="model-provider-card__action">查看能力与型号路线</span></summary>' +
        '<div class="model-provider-card__body"><p class="model-provider-card__intro">' +
        escapeHtml(profile.introduction) + '</p>' + renderProviderSourceLinks(profile.id) +
        '<div class="model-provider-fingerprint" aria-label="' + escapeHtml(profile.id) + ' 能力指纹">' +
        capabilityMetrics.map(function (metric) {
          const score = averageScore(providerModels, metric.id);
          return '<div><span><small>' + escapeHtml(metric.label) + '</small><strong>' + formatScore(score) + '</strong></span>' +
            '<div class="model-score-track"><span style="--score-width:' + (score === null ? 0 : score) + '%"></span></div></div>';
        }).join("") + '</div>' +
        '<div class="model-provider-card__guidance"><div><strong>更适合</strong><ul>' + listItems(profile.bestFor) +
        '</ul></div><div><strong>使用提醒</strong><ul>' + listItems(profile.watchFor) + '</ul></div></div>' +
        '<div class="model-provider-lineup"><strong>型号路线</strong><ul>' + profile.lineup.map(function (item) {
          return '<li><span>' + escapeHtml(item.model) + '</span><small>' + escapeHtml(item.role) + '</small></li>';
        }).join("") + '</ul></div>' +
        '<div class="model-provider-reasoning"><strong>推理分层</strong><div>' +
        (Array.isArray(profile.reasoningTiers) ? profile.reasoningTiers : []).map(function (tier) {
          return '<article><span><b>' + escapeHtml(tier.level) + '</b><code>' + escapeHtml(tier.config) +
            '</code></span><small>' + escapeHtml(tier.use) + '</small></article>';
        }).join("") + '</div></div></div></details>';
    }).join("");
  }

  function renderTabs() {
    elements.rankingTabs.innerHTML = metricCatalog.map(function (metric) {
      const selected = metric.id === state.metric;
      return '<button type="button" role="tab" data-metric="' + escapeHtml(metric.id) +
        '" aria-selected="' + selected + '">' + escapeHtml(metric.label) + '</button>';
    }).join("");
  }

  function renderProviderFilters() {
    const availableProviders = providerOrder.filter(function (provider) {
      return models.some(function (model) { return model.provider === provider; });
    });
    const buttons = [{ id: "all", label: "全部提供商" }].concat(
      availableProviders.map(function (provider) { return { id: provider, label: provider }; }),
    );
    elements.providerFilters.innerHTML = buttons.map(function (provider) {
      return '<button type="button" data-provider="' + escapeHtml(provider.id) +
        '" aria-pressed="' + (provider.id === state.provider) + '">' +
        escapeHtml(provider.label) + '</button>';
    }).join("");
  }

  function renderSources() {
    const liveBench = benchmarkSources.liveBench || {};
    const artificialAnalysis = benchmarkSources.artificialAnalysis || {};
    const independentSources = '<article class="model-source-item" data-source-type="benchmark"><strong>LiveBench 独立能力测评</strong><span>' +
      sourceLink({ label: "交互榜单", url: liveBench.leaderboardUrl, type: "benchmark" }) +
      sourceLink({ label: "2026-06-25 原始 CSV", url: liveBench.dataUrl, type: "benchmark" }) +
      sourceLink({ label: "测评论文与方法", url: liveBench.methodologyUrl, type: "benchmark" }) + '</span></article>' +
      '<article class="model-source-item" data-source-type="benchmark"><strong>Artificial Analysis</strong><span>' +
      sourceLink({ label: "模型综合指数与性能榜", url: artificialAnalysis.leaderboardUrl, type: "benchmark" }) +
      sourceLink({ label: "测评方法", url: artificialAnalysis.methodologyUrl, type: "benchmark" }) + '</span></article>';
    elements.sourceList.innerHTML = independentSources + sources.map(function (source) {
      return '<article class="model-source-item"><strong>' + escapeHtml(source.label) +
        '</strong><span>' + sourceLink({ label: "型号与能力", url: source.modelUrl, type: "official" }) +
        sourceLink({ label: "Token 定价", url: source.pricingUrl, type: "official" }) + '</span></article>';
    }).join("") + '<article class="model-source-item" data-source-type="editorial"><strong>AI HUB 编辑口径</strong><span>' +
      sourceLink({ label: "测评映射、缺失数据与适配解读", url: "/hub/models.html#methodology", type: "editorial" }) +
      sourceLink({ label: "80/20 成本计算方法", url: "/hub/models.html#methodology", type: "derived" }) +
      '</span></article>';
  }

  function renderLeaderboard() {
    const metric = state.metric;
    const ranked = models.filter(function (model) { return scoreOf(model, metric) !== null; }).sort(function (left, right) {
      return compareScores(left, right, metric);
    }).slice(0, 5);
    elements.leaderboard.innerHTML = ranked.map(function (model, index) {
      const score = scoreOf(model, metric);
      return '<article class="model-leaderboard__row" data-provider="' + escapeHtml(model.provider) + '">' +
        '<span class="model-leaderboard__rank">#' + (index + 1) + '</span>' +
        '<div class="model-leaderboard__identity"><strong>' + escapeHtml(model.name) + '</strong>' +
        '<small>' + escapeHtml(model.provider) + ' · ' + escapeHtml(model.badge) + '</small></div>' +
        '<div class="model-score-track" aria-label="' + formatScore(score) + ' 分"><span style="--score-width:' + score + '%"></span></div>' +
        '<strong class="model-leaderboard__score">' + formatScore(score) + '</strong>' +
        '</article>';
    }).join("") + '<p class="model-leaderboard__source">' +
      sourceLink({ label: "榜单数据：LiveBench 2026-06-25 原始 CSV", url: benchmarkSources.liveBench.dataUrl, type: "benchmark" }) +
      ' · 仅排列该发布版中有完全匹配型号与档位的条目。</p>';
  }

  function renderModels() {
    const query = state.query.trim().toLocaleLowerCase("zh-CN");
    const visibleModels = models.filter(function (model) {
      if (state.provider !== "all" && model.provider !== state.provider) return false;
      if (!query) return true;
      const reasoningTerms = [];
      if (model.reasoningProfile) {
        reasoningTerms.push(model.reasoningProfile.label, model.reasoningProfile.defaultMode, model.reasoningProfile.note);
        (model.reasoningProfile.modes || []).forEach(function (mode) {
          reasoningTerms.push(mode.name, mode.use, mode.tradeoff);
        });
      }
      const haystack = [model.name, model.id, model.provider, model.summary, model.capabilityIntro,
        model.chooseWhen, model.switchWhen, model.benchmarks && model.benchmarks.liveBench && model.benchmarks.liveBench.variant]
        .concat(model.bestFor, model.strengths, model.weaknesses, model.capabilities, reasoningTerms)
        .join(" ").toLocaleLowerCase("zh-CN");
      return haystack.indexOf(query) >= 0;
    }).sort(function (left, right) {
      return compareScores(left, right, state.sort);
    });

    elements.grid.innerHTML = visibleModels.map(renderModelCard).join("");
    const benchmarkedCount = visibleModels.filter(function (model) { return model.benchmarks && model.benchmarks.liveBench; }).length;
    elements.resultCount.textContent = "当前显示 " + visibleModels.length + " / " + models.length + " 个型号，其中 " + benchmarkedCount + " 个有完全匹配的 LiveBench 测评";
    elements.empty.hidden = visibleModels.length > 0;
    elements.grid.hidden = visibleModels.length === 0;
  }

  function renderModelCard(model) {
    const sampleCost = model.input * 0.8 + model.output * 0.2;
    const reasoning = model.reasoningProfile || { label: "推理档位", defaultMode: "以 API 为准", note: "", modes: [] };
    const modelSource = model.sources && model.sources.model;
    const pricingSource = model.sources && model.sources.pricing;
    const editorialSource = model.sources && model.sources.editorial;
    const calculationSource = model.sources && model.sources.calculation;
    const benchmarkSource = model.sources && model.sources.benchmark;
    const benchmarkDataSource = model.sources && model.sources.benchmarkData;
    const artificialAnalysisSource = model.sources && model.sources.artificialAnalysis;
    const liveBench = model.benchmarks && model.benchmarks.liveBench;
    return '<article class="model-card" data-provider="' + escapeHtml(model.provider) + '">' +
      '<div class="model-card__head"><div class="model-card__identity">' +
      '<span class="model-card__mark" aria-hidden="true">' + escapeHtml(providerMarks[model.provider] || model.provider) + '</span>' +
      '<div><h3>' + escapeHtml(model.name) + '</h3><small>' + escapeHtml(model.id) + ' · ' + escapeHtml(model.provider) + '</small></div>' +
      '</div><span class="model-card__badge">' + escapeHtml(model.badge) + '</span></div>' +
      renderBenchmarkSummary(model) +
      '<p class="model-card__summary">' + escapeHtml(model.summary) + '</p>' +
      '<div class="model-card__source-row">' + sourceLink(modelSource, "型号定位与官方能力来源") + '</div>' +
      '<div class="model-card__fit" aria-label="适用场景">' + model.bestFor.map(function (item) {
        return '<span>' + escapeHtml(item) + '</span>';
      }).join("") + '</div><div class="model-card__source-row">' + sourceLink(editorialSource, "适用场景为第三方测评基础上的 AI HUB 解读") + '</div>' +
      '<div class="model-card__price" aria-label="每百万 Token 价格">' +
      priceCell("输入 / 1M", formatMoney(model.input, model.currency)) +
      priceCell("输出 / 1M", formatMoney(model.output, model.currency)) +
      priceCell("80/20 示例", formatMoney(sampleCost, model.currency)) + '</div>' +
      '<div class="model-card__source-row">' + sourceLink(pricingSource, "输入/输出价格来源") +
      sourceLink(calculationSource, "80/20 示例计算口径") + '</div>' +
      '<div class="model-card__tradeoffs"><div><strong>优势</strong><ul>' + listItems(model.strengths) +
      '</ul></div><div><strong>劣势</strong><ul>' + listItems(model.weaknesses) + '</ul></div></div>' +
      '<div class="model-card__source-row">' + sourceLink(editorialSource, "优劣势为第三方测评基础上的 AI HUB 解读") + '</div>' +
      '<details><summary>查看推理档位、完整能力档案与价格说明</summary><div class="model-card__details">' +
      '<p class="model-card__capability-intro">' + escapeHtml(model.capabilityIntro) + '</p>' +
      '<div class="model-card__capabilities" aria-label="能力组件">' + model.capabilities.map(function (item) {
        return '<span>' + escapeHtml(item) + '</span>';
      }).join("") + '</div><div class="model-card__source-row">' + sourceLink(modelSource, "官方型号、上下文与能力资料") + '</div>' +
      '<section class="model-card__reasoning" aria-label="' + escapeHtml(model.name) + ' 推理档位">' +
      '<div class="model-card__reasoning-head"><strong>推理档位</strong><span>' + escapeHtml(reasoning.label) +
      ' · 默认 ' + escapeHtml(reasoning.defaultMode) + '</span></div>' +
      '<div class="model-card__reasoning-grid">' + reasoning.modes.map(function (mode) {
        return '<article><strong>' + escapeHtml(mode.name) + '</strong><span>' + escapeHtml(mode.use) +
          '</span><small>' + escapeHtml(mode.tradeoff) + '</small></article>';
      }).join("") + '</div><p>' + escapeHtml(reasoning.note) + '</p><div class="model-card__source-row">' +
      sourceLink(modelSource, "官方推理参数") + sourceLink(editorialSource, "档位用途为编辑建议") + '</div></section>' +
      '<div class="model-card__decision"><div><strong>适合选它</strong><p>' + escapeHtml(model.chooseWhen) +
      '</p></div><div><strong>需要换型</strong><p>' + escapeHtml(model.switchWhen) + '</p></div></div>' +
      '<div class="model-card__source-row">' + sourceLink(benchmarkDataSource, "以下八项来自 LiveBench 2026-06-25") + '</div>' +
      (liveBench ? '<div class="model-card__metrics">' + metricCatalog.map(function (metric) {
        const score = scoreOf(model, metric.id);
        return '<div class="model-card__metric"><span><small>' + escapeHtml(metric.label) + '</small><strong>' + formatScore(score) +
          '</strong></span><div class="model-score-track"><span style="--score-width:' + score + '%"></span></div></div>';
      }).join("") + '</div>' : '<div class="model-card__benchmark-missing model-card__benchmark-missing--compact">该型号没有完全匹配的 LiveBench 分数，因此不展示或推算能力分。</div>') +
      '<p class="model-card__note"><strong>上下文：</strong>' + escapeHtml(model.context) + ' · ' +
      sourceLink(modelSource, "来源") + '。<br /><strong>价格说明：</strong>' + escapeHtml(model.priceNote) + ' · ' +
      sourceLink(pricingSource, "来源") + '。<br /><strong>测评匹配：</strong>' + escapeHtml(model.benchmarkStatus) + '</p>' +
      '<div class="model-card__sources" aria-label="' + escapeHtml(model.name) + ' 数据来源">' +
      sourceLink(modelSource) + sourceLink(pricingSource) + sourceLink(benchmarkSource) + sourceLink(benchmarkDataSource) +
      sourceLink(artificialAnalysisSource) + sourceLink(editorialSource) + sourceLink(calculationSource) + '</div>' +
      '</div></details></article>';
  }

  function renderBenchmarkSummary(model) {
    const liveBench = model.benchmarks && model.benchmarks.liveBench;
    const artificialAnalysis = model.benchmarks && model.benchmarks.artificialAnalysis;
    const benchmarkSource = model.sources && model.sources.benchmark;
    const benchmarkDataSource = model.sources && model.sources.benchmarkData;
    const artificialAnalysisSource = model.sources && model.sources.artificialAnalysis;
    if (!liveBench) {
      return '<div class="model-card__benchmark-missing"><strong>暂无完全匹配的第三方测评</strong><span>' +
        escapeHtml(model.benchmarkStatus) + '</span></div><div class="model-card__source-row">' +
        sourceLink(benchmarkSource, "查看 LiveBench 当前榜单") +
        sourceLink(artificialAnalysisSource, "查看 Artificial Analysis 当前榜单") + '</div>';
    }
    const aaIndex = artificialAnalysis ? formatScore(artificialAnalysis.intelligence) + (artificialAnalysis.estimated ? "*" : "") : "—";
    const aaSpeed = artificialAnalysis ? formatScore(artificialAnalysis.outputTokensPerSecond) + " tok/s" : "—";
    const aaLatency = artificialAnalysis ? formatScore(artificialAnalysis.latencySeconds) + " s" : "—";
    return '<div class="model-card__scoreline model-card__scoreline--benchmark"><div><small>LiveBench 综合</small><strong>' +
      formatScore(liveBench.overall) + '</strong></div><div><small>AA Intelligence Index</small><strong>' + aaIndex +
      '</strong></div><div><small>AA 输出速度</small><strong>' + aaSpeed +
      '</strong></div><div><small>AA 首段延迟</small><strong>' + aaLatency + '</strong></div></div>' +
      '<p class="model-card__benchmark-variant"><strong>测评档位：</strong>LiveBench <code>' + escapeHtml(liveBench.variant) +
      '</code>' + (artificialAnalysis ? '；Artificial Analysis <code>' + escapeHtml(artificialAnalysis.variant) + '</code>' : '；Artificial Analysis 暂无完全匹配记录') + '</p>' +
      '<div class="model-card__source-row">' + sourceLink(benchmarkSource, "LiveBench 榜单") +
      sourceLink(benchmarkDataSource, "LiveBench 原始 CSV") +
      sourceLink(artificialAnalysisSource, "Artificial Analysis 榜单") + '</div>';
  }

  function bindEvents() {
    elements.rankingTabs.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-metric]");
      if (!button) return;
      state.metric = button.dataset.metric;
      renderTabs();
      renderLeaderboard();
    });
    elements.providerFilters.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-provider]");
      if (!button) return;
      state.provider = button.dataset.provider;
      renderProviderFilters();
      renderModels();
    });
    elements.search.addEventListener("input", function () {
      state.query = elements.search.value;
      renderModels();
    });
    elements.sort.addEventListener("change", function () {
      state.sort = elements.sort.value;
      renderModels();
    });
  }

  function scoreOf(model, metric) {
    const rawScore = model.scores && model.scores[metric];
    if (rawScore === null || rawScore === undefined || rawScore === "") return null;
    const score = Number(rawScore);
    return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  }

  function averageScore(providerModels, metric) {
    const availableScores = providerModels.map(function (model) { return scoreOf(model, metric); }).filter(function (score) {
      return score !== null;
    });
    if (!availableScores.length) return null;
    const total = availableScores.reduce(function (sum, score) { return sum + score; }, 0);
    return Number((total / availableScores.length).toFixed(2));
  }

  function compareScores(left, right, metric) {
    const leftScore = scoreOf(left, metric);
    const rightScore = scoreOf(right, metric);
    if (leftScore === null && rightScore === null) return left.name.localeCompare(right.name, "zh-CN");
    if (leftScore === null) return 1;
    if (rightScore === null) return -1;
    const scoreDifference = rightScore - leftScore;
    if (scoreDifference) return scoreDifference;
    const leftOverall = scoreOf(left, "overall");
    const rightOverall = scoreOf(right, "overall");
    if (leftOverall !== null && rightOverall !== null && rightOverall !== leftOverall) return rightOverall - leftOverall;
    return left.name.localeCompare(right.name, "zh-CN");
  }

  function formatScore(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function renderProviderSourceLinks(provider) {
    const source = sources.find(function (item) { return item.id === provider; });
    if (!source) return "";
    return '<div class="model-provider-card__sources">' +
      sourceLink({ label: "厂商型号与能力资料", url: source.modelUrl, type: "official" }) +
      sourceLink({ label: "厂商 Token 定价", url: source.pricingUrl, type: "official" }) +
      sourceLink({ label: "能力指纹来自 LiveBench 收录型号均值", url: benchmarkSources.liveBench.dataUrl, type: "benchmark" }) +
      sourceLink({ label: "适配与提醒为 AI HUB 编辑解读", url: "/hub/models.html#methodology", type: "editorial" }) +
      '</div>';
  }

  function sourceLink(source, label) {
    const fallback = { label: "来源待核对", url: "/hub/models.html#methodology", type: "editorial" };
    const item = source || fallback;
    const external = /^https:\/\//.test(item.url);
    return '<a class="model-data-citation" data-source-type="' + escapeHtml(item.type || "official") +
      '" href="' + escapeHtml(item.url) + '"' + (external ? ' target="_blank" rel="noreferrer"' : "") +
      '>' + escapeHtml(label || item.label) + (external ? ' ↗' : '') + '</a>';
  }

  function priceCell(label, value) {
    return '<div><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(value) + '</strong></div>';
  }

  function listItems(items) {
    return items.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join("");
  }

  function formatMoney(value, currency) {
    const amount = Number(value);
    const symbol = currency === "CNY" ? "¥" : "$";
    if (!Number.isFinite(amount)) return "待确认";
    if (amount === 0) return "免费";
    return symbol + amount.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }
})();
