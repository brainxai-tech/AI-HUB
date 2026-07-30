(function () {
  const data = window.AI_MODEL_GUIDE_DATA || { models: [], sources: [] };
  const models = Array.isArray(data.models)
    ? data.models.filter(function (model) { return model.provider === "OpenAI"; })
    : [];
  const sources = Array.isArray(data.sources)
    ? data.sources.filter(function (source) { return source.id === "OpenAI"; })
    : [];
  const providers = Array.isArray(data.providers)
    ? data.providers.filter(function (provider) { return provider.id === "OpenAI"; })
    : [];
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
  const presetCatalog = [
    {
      id: "balanced",
      label: "日常均衡",
      metric: "overall",
      recommendation: "gpt-5.6-terra",
      reason: "综合能力只比旗舰低一档，80/20 示例成本约为旗舰的一半，适合作为多数项目的稳定主力。",
    },
    {
      id: "quality",
      label: "质量优先",
      metric: "overall",
      recommendation: "gpt-5.6-sol",
      reason: "LiveBench 综合、推理、数学和语言均处于当前对比组前列，适合高价值、长链路任务。",
    },
    {
      id: "coding",
      label: "编程与 Agent",
      metric: "coding",
      recommendation: "gpt-5.6-sol",
      reason: "编程分数领先，并保持较强的 Agent 编程与推理能力，适合生产级工程和多工具工作流。",
    },
    {
      id: "speed",
      label: "速度优先",
      metric: "speed",
      recommendation: "gpt-5.6-luna",
      reason: "Artificial Analysis 的完全匹配记录中输出速度最高，同时成本明显低于 Sol 与 Terra。",
    },
    {
      id: "budget",
      label: "成本优先",
      metric: "overall",
      recommendation: "gpt-5.4-nano",
      reason: "80/20 示例成本最低，适合分类、抽取、排序和大量简单自动化；复杂任务应升级型号。",
    },
  ];
  const providerOrder = ["OpenAI"];
  const providerMarks = {
    OpenAI: "GPT",
  };
  const elements = {
    presets: document.getElementById("comparisonPresets"),
    landscape: document.getElementById("modelLandscape"),
    landscapeAxisLabel: document.getElementById("landscapeAxisLabel"),
    recommendation: document.getElementById("comparisonRecommendation"),
    comparePicker: document.getElementById("comparePicker"),
    compareStatus: document.getElementById("compareStatus"),
    comparisonTable: document.getElementById("modelComparisonTable"),
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
  const state = {
    metric: "overall",
    provider: "all",
    query: "",
    sort: "overall",
    preset: "balanced",
    compared: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4-nano"],
    compareMessage: "已预选旗舰、均衡、高频和低成本四个代表型号。",
  };

  if (!models.length || !elements.grid) {
    if (elements.grid) {
      elements.grid.innerHTML = '<div class="empty-state"><h3>模型资料暂时无法加载</h3><p>请稍后刷新页面。</p></div>';
    }
    return;
  }

  renderComparison();
  renderProviderProfiles();
  renderTabs();
  renderProviderFilters();
  renderSources();
  renderLeaderboard();
  renderModels();
  bindEvents();

  function renderComparison() {
    if (!elements.presets || !elements.landscape || !elements.comparisonTable) return;
    renderPresetTabs();
    renderLandscape();
    renderRecommendation();
    renderComparePicker();
    renderComparisonTable();
  }

  function renderPresetTabs() {
    elements.presets.innerHTML = presetCatalog.map(function (preset) {
      const recommendation = modelById(preset.recommendation);
      return '<button type="button" data-preset="' + escapeHtml(preset.id) + '" aria-pressed="' +
        (preset.id === state.preset) + '"><span>' + escapeHtml(preset.label) + '</span><small>' +
        escapeHtml(recommendation ? recommendation.name : "资料待确认") + '</small></button>';
    }).join("");
  }

  function renderLandscape() {
    const preset = currentPreset();
    const plotted = models.map(function (model) {
      return { model: model, value: presetValue(model, preset) };
    }).filter(function (item) { return item.value !== null; });
    const missing = models.filter(function (model) { return presetValue(model, preset) === null; });
    const values = plotted.map(function (item) { return item.value; });
    const costs = plotted.map(function (item) { return sampleCostOf(item.model); });
    const minValue = values.length ? Math.min.apply(Math, values) : 0;
    const maxValue = values.length ? Math.max.apply(Math, values) : 100;
    const minCost = costs.length ? Math.min.apply(Math, costs) : 0;
    const maxCost = costs.length ? Math.max.apply(Math, costs) : 1;
    const metricLabel = preset.metric === "speed" ? "AA 输出速度" : metricLabelOf(preset.metric);
    elements.landscapeAxisLabel.textContent = "纵轴：" + metricLabel + " · 同组相对位置";

    const points = plotted.map(function (item) {
      const model = item.model;
      const selected = state.compared.indexOf(model.id) >= 0;
      const recommended = model.id === preset.recommendation;
      const x = normalizedLogPosition(sampleCostOf(model), minCost, maxCost, 8, 92);
      const y = normalizedPosition(item.value, minValue, maxValue, 11, 88);
      const valueLabel = preset.metric === "speed" ? formatScore(item.value) + " tok/s" : formatScore(item.value);
      return '<button type="button" class="model-landscape__point' + (recommended ? ' is-recommended' : '') +
        (selected ? ' is-selected' : '') + (x >= 72 ? ' is-near-right' : '') +
        '" data-compare-id="' + escapeHtml(model.id) + '" aria-pressed="' + selected +
        '" style="--point-x:' + x + '%;--point-y:' + y + '%" title="' + escapeHtml(model.name + " · " + metricLabel + " " + valueLabel) + '">' +
        '<span aria-hidden="true"></span><strong>' + escapeHtml(shortModelName(model.name)) + '</strong><small>' +
        escapeHtml(valueLabel) + '</small></button>';
    }).join("");

    const missingCopy = missing.length
      ? '<div class="model-landscape__missing"><strong>暂无完全匹配数据</strong><span>' + missing.map(function (model) {
        return escapeHtml(shortModelName(model.name));
      }).join(" · ") + '</span></div>'
      : "";
    elements.landscape.innerHTML = '<div class="model-landscape__axis model-landscape__axis--y"><span>更强</span><span>更弱</span></div>' +
      '<div class="model-landscape__plot">' + points + '</div>' + missingCopy;
  }

  function renderRecommendation() {
    const preset = currentPreset();
    const model = modelById(preset.recommendation);
    if (!model) return;
    const metricValue = presetValue(model, preset);
    const metricLabel = preset.metric === "speed" ? "输出速度" : metricLabelOf(preset.metric);
    const metricDisplay = preset.metric === "speed" ? formatScore(metricValue) + " tok/s" : formatScore(metricValue);
    const selected = state.compared.indexOf(model.id) >= 0;
    const selectionFull = state.compared.length >= 4;
    elements.recommendation.innerHTML = '<span class="model-recommendation__eyebrow">' + escapeHtml(preset.label) + '推荐</span>' +
      '<div class="model-recommendation__identity"><span aria-hidden="true">GPT</span><div><small>' + escapeHtml(model.badge) +
      '</small><h3>' + escapeHtml(model.name) + '</h3></div></div><p>' + escapeHtml(preset.reason) + '</p>' +
      '<dl><div><dt>' + escapeHtml(metricLabel) + '</dt><dd>' + escapeHtml(metricDisplay) + '</dd></div>' +
      '<div><dt>80/20 成本</dt><dd>' + escapeHtml(formatMoney(sampleCostOf(model), model.currency)) + '</dd></div>' +
      '<div><dt>适合</dt><dd>' + escapeHtml(model.bestFor.slice(0, 2).join("、")) + '</dd></div></dl>' +
      '<button type="button" data-recommend-add="' + escapeHtml(model.id) + '"' +
      (selected || selectionFull ? ' disabled' : '') + '>' +
      (selected ? '已在同屏比较' : selectionFull ? '先移除一个型号' : '加入同屏比较') + '</button>';
  }

  function renderComparePicker() {
    const count = state.compared.length;
    elements.comparePicker.innerHTML = models.map(function (model) {
      const selected = state.compared.indexOf(model.id) >= 0;
      const disabled = !selected && count >= 4;
      return '<button type="button" data-compare-id="' + escapeHtml(model.id) + '" aria-pressed="' + selected + '"' +
        (disabled ? ' disabled' : '') + '><span aria-hidden="true"></span><strong>' + escapeHtml(shortModelName(model.name)) +
        '</strong><small>' + escapeHtml(model.badge) + '</small></button>';
    }).join("");
    elements.compareStatus.textContent = state.compareMessage + " 当前已选择 " + count + " / 4 个。";
  }

  function renderComparisonTable() {
    const selectedModels = state.compared.map(modelById).filter(Boolean);
    const rows = [
      { id: "position", label: "型号定位", type: "text", value: function (model) { return model.badge; } },
      { id: "overall", label: "LiveBench 综合", type: "score", better: "max", value: function (model) { return scoreOf(model, "overall"); } },
      { id: "reasoning", label: "推理", type: "score", better: "max", value: function (model) { return scoreOf(model, "reasoning"); } },
      { id: "coding", label: "编程", type: "score", better: "max", value: function (model) { return scoreOf(model, "coding"); } },
      { id: "agentic", label: "Agent 编程", type: "score", better: "max", value: function (model) { return scoreOf(model, "agentic"); } },
      { id: "speed", label: "输出速度", type: "speed", better: "max", value: outputSpeedOf },
      { id: "latency", label: "首段延迟", type: "latency", better: "min", value: latencyOf },
      { id: "cost", label: "80/20 成本", type: "cost", better: "min", value: sampleCostOf },
      { id: "context", label: "上下文", type: "text", value: function (model) { return model.context; } },
      { id: "fit", label: "更适合", type: "tags", value: function (model) { return model.bestFor; } },
    ];
    const header = '<caption>所选 GPT 型号能力、性能与成本对比</caption><thead><tr><th scope="col">比较项</th>' +
      selectedModels.map(function (model) {
        return '<th scope="col"><span>' + escapeHtml(model.badge) + '</span><strong>' + escapeHtml(shortModelName(model.name)) + '</strong></th>';
      }).join("") + '</tr></thead>';
    const body = rows.map(function (row) {
      const values = selectedModels.map(row.value);
      const best = bestNumericValue(values, row.better);
      return '<tr data-comparison-row="' + escapeHtml(row.id) + '"><th scope="row">' + escapeHtml(row.label) + '</th>' +
        selectedModels.map(function (model, index) {
          return renderComparisonCell(row, values[index], best, values);
        }).join("") + '</tr>';
    }).join("");
    elements.comparisonTable.innerHTML = header + '<tbody>' + body + '</tbody>';
  }

  function renderComparisonCell(row, value, best, rowValues) {
    if (row.type === "tags") {
      return '<td><div class="model-comparison-table__tags">' + (value || []).map(function (item) {
        return '<span>' + escapeHtml(item) + '</span>';
      }).join("") + '</div></td>';
    }
    if (row.type === "text") return '<td><strong class="model-comparison-table__text">' + escapeHtml(value || "以 API 为准") + '</strong></td>';
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '<td class="is-missing"><strong>暂无</strong><small>无完全匹配数据</small></td>';
    }
    const numeric = Number(value);
    const isBest = best !== null && Math.abs(numeric - best) < 0.0001;
    const max = Math.max.apply(Math, rowValues
      .filter(function (item) { return item !== null && item !== undefined && item !== ""; })
      .map(Number)
      .filter(Number.isFinite));
    const barWidth = row.type === "score" ? numeric : max > 0 ? numeric / max * 100 : 0;
    let display = formatScore(numeric);
    if (row.type === "speed") display += " tok/s";
    if (row.type === "latency") display += " s";
    if (row.type === "cost") display = "$" + Number(numeric).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
    return '<td class="model-comparison-table__metric' + (isBest ? ' is-best' : '') + '"><div><strong>' +
      escapeHtml(display) + '</strong>' + (isBest ? '<span>领先</span>' : '') + '</div><i style="--metric-width:' +
      Math.max(3, Math.min(100, barWidth)) + '%"></i></td>';
  }

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
    const buttons = [{ id: "all", label: "全部 GPT 型号" }].concat(
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
    elements.presets.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-preset]");
      if (!button || button.dataset.preset === state.preset) return;
      const preset = presetCatalog.find(function (item) { return item.id === button.dataset.preset; });
      if (!preset) return;
      state.preset = preset.id;
      state.compareMessage = "已切换到“" + preset.label + "”，图中推荐位置已更新。";
      renderComparison();
      const refreshedButton = elements.presets.querySelector('button[data-preset="' + preset.id + '"]');
      if (refreshedButton) refreshedButton.focus();
    });
    elements.landscape.addEventListener("click", handleCompareToggle);
    elements.comparePicker.addEventListener("click", handleCompareToggle);
    elements.recommendation.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-recommend-add]");
      if (!button) return;
      toggleComparedModel(button.dataset.recommendAdd);
    });
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

  function handleCompareToggle(event) {
    const button = event.target.closest("button[data-compare-id]");
    if (!button) return;
    toggleComparedModel(button.dataset.compareId);
  }

  function toggleComparedModel(modelId) {
    const index = state.compared.indexOf(modelId);
    const model = modelById(modelId);
    if (!model) return;
    if (index >= 0) {
      if (state.compared.length <= 2) {
        state.compareMessage = "至少保留两个型号，才能形成有效对比。";
      } else {
        state.compared.splice(index, 1);
        state.compareMessage = "已从同屏比较移除 " + model.name + "。";
      }
    } else if (state.compared.length >= 4) {
      state.compareMessage = "同屏最多比较四个型号，请先移除一个。";
    } else {
      state.compared.push(modelId);
      state.compareMessage = "已把 " + model.name + " 加入同屏比较。";
    }
    renderComparison();
  }

  function currentPreset() {
    return presetCatalog.find(function (preset) { return preset.id === state.preset; }) || presetCatalog[0];
  }

  function modelById(modelId) {
    return models.find(function (model) { return model.id === modelId; });
  }

  function shortModelName(name) {
    return String(name || "").replace(/^GPT-/i, "");
  }

  function metricLabelOf(metricId) {
    const metric = metricCatalog.find(function (item) { return item.id === metricId; });
    return metric ? metric.label : metricId;
  }

  function presetValue(model, preset) {
    return preset.metric === "speed" ? outputSpeedOf(model) : scoreOf(model, preset.metric);
  }

  function sampleCostOf(model) {
    const input = Number(model && model.input);
    const output = Number(model && model.output);
    if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
    return input * 0.8 + output * 0.2;
  }

  function outputSpeedOf(model) {
    const benchmark = model && model.benchmarks && model.benchmarks.artificialAnalysis;
    const value = benchmark && Number(benchmark.outputTokensPerSecond);
    return Number.isFinite(value) ? value : null;
  }

  function latencyOf(model) {
    const benchmark = model && model.benchmarks && model.benchmarks.artificialAnalysis;
    const value = benchmark && Number(benchmark.latencySeconds);
    return Number.isFinite(value) ? value : null;
  }

  function bestNumericValue(values, direction) {
    if (!direction) return null;
    const numeric = values
      .filter(function (value) { return value !== null && value !== undefined && value !== ""; })
      .map(Number)
      .filter(Number.isFinite);
    if (!numeric.length) return null;
    return direction === "min" ? Math.min.apply(Math, numeric) : Math.max.apply(Math, numeric);
  }

  function normalizedPosition(value, min, max, floor, ceiling) {
    if (max === min) return (floor + ceiling) / 2;
    return floor + (Number(value) - min) / (max - min) * (ceiling - floor);
  }

  function normalizedLogPosition(value, min, max, floor, ceiling) {
    const safeValue = Math.max(0.001, Number(value));
    const safeMin = Math.max(0.001, Number(min));
    const safeMax = Math.max(safeMin, Number(max));
    return normalizedPosition(Math.log(safeValue), Math.log(safeMin), Math.log(safeMax), floor, ceiling);
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
