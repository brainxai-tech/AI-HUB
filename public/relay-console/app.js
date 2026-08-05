(() => {
  const state = { register: false, account: null, wallet: null, keys: [], pricing: [] };
  const $ = (selector) => document.querySelector(selector);
  const apiUrl = (path) => `/hub${path}`;

  const elements = {
    authSection: $("#authSection"),
    authTitle: $("#authTitle"),
    authHint: $("#authHint"),
    authForm: $("#authForm"),
    authEmail: $("#authEmail"),
    authPassword: $("#authPassword"),
    authSubmit: $("#authSubmit"),
    authModeToggle: $("#authModeToggle"),
    authStatus: $("#authStatus"),
    dashboard: $("#dashboard"),
    accountSummary: $("#accountSummary"),
    accountEmail: $("#accountEmail"),
    balanceValue: $("#balanceValue"),
    walletBalance: $("#walletBalance"),
    logoutButton: $("#logoutButton"),
    topupButton: $("#topupButton"),
    createKeyButton: $("#createKeyButton"),
    keyReveal: $("#keyReveal"),
    newKeyValue: $("#newKeyValue"),
    copyKeyButton: $("#copyKeyButton"),
    keyList: $("#keyList"),
    pricingBody: $("#pricingBody"),
    usageList: $("#usageList"),
    docsNotice: $("#docsNotice"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatCny(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? `¥${number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
      : "待配置";
  }

  function formatDate(value) {
    if (!value) return "尚未使用";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }) : "—";
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      credentials: "same-origin",
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || "请求失败，请稍后重试。");
      error.code = body?.error?.code || "REQUEST_FAILED";
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function setAuthStatus(message = "") {
    elements.authStatus.textContent = message;
  }

  function renderAuthMode() {
    elements.authTitle.textContent = state.register ? "注册 API 控制台" : "登录 API 控制台";
    elements.authHint.textContent = state.register
      ? "注册后可以创建自己的 API Key；当前充值仍需等待支付通道配置。"
      : "登录后管理余额、API Key 和调用记录。";
    elements.authSubmit.textContent = state.register ? "注册并登录" : "登录";
    elements.authModeToggle.textContent = state.register ? "已有账户？登录" : "没有账户？注册";
    elements.authPassword.autocomplete = state.register ? "new-password" : "current-password";
  }

  function renderPricing() {
    const rows = state.pricing || [];
    elements.pricingBody.innerHTML = rows.length
      ? rows.map((item) => {
        const enabled = item.enabled && item.status === "verified";
        const input = item.sellInputPrice === null ? "待核验" : formatCny(item.sellInputPrice);
        const output = item.sellOutputPrice === null ? "待核验" : formatCny(item.sellOutputPrice);
        const multiplier = item.multiplierInput === null ? "待核验" : `${item.multiplierInput.toFixed(2)}×`;
        return `<tr><th scope="row">${escapeHtml(item.label || item.model)}<br><small>${escapeHtml(item.model)}</small></th><td>${escapeHtml(input)}</td><td>${escapeHtml(output)}</td><td>${escapeHtml(multiplier)}</td><td class="${enabled ? "" : "relay-status-pending"}">${enabled ? "已开放" : "待配置"}</td></tr>`;
      }).join("")
      : '<tr><td colspan="5" class="relay-status-pending">管理员尚未配置可销售的模型价格。</td></tr>';
  }

  function renderKeys() {
    elements.keyList.innerHTML = state.keys.length
      ? state.keys.map((key) => `<div class="relay-key-row"><div><strong>${escapeHtml(key.name)}</strong><small>${escapeHtml(key.prefix)}•••• · 创建于 ${escapeHtml(formatDate(key.createdAt))} · ${key.lastUsedAt ? `最近使用 ${escapeHtml(formatDate(key.lastUsedAt))}` : "尚未使用"}</small></div><button type="button" data-revoke-key="${escapeHtml(key.id)}">撤销</button></div>`).join("")
      : '<p class="relay-console-status">还没有 API Key，创建一枚后即可按控制台示例调用。</p>';
  }

  function renderWallet() {
    const balance = state.wallet?.balanceCny ?? 0;
    elements.balanceValue.textContent = formatCny(balance);
    elements.walletBalance.textContent = formatCny(balance);
    const entries = state.wallet?.entries || [];
    elements.usageList.innerHTML = entries.length
      ? entries.map((entry) => {
        const sign = entry.amountCny >= 0 ? "+" : "";
        const label = entry.type === "usage" ? `${entry.model || "模型调用"} · ${entry.inputTokens || 0}/${entry.outputTokens || 0} tokens` : entry.note || entry.type;
        return `<div class="relay-usage-row"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(formatDate(entry.createdAt))}</small></div><strong>${escapeHtml(sign + formatCny(entry.amountCny))}</strong></div>`;
      }).join("")
      : '<p class="relay-console-status">暂无消费记录。</p>';
  }

  function renderDashboard() {
    const loggedIn = Boolean(state.account);
    elements.authSection.hidden = loggedIn;
    elements.dashboard.hidden = !loggedIn;
    elements.logoutButton.hidden = !loggedIn;
    elements.accountSummary.hidden = !loggedIn;
    if (!loggedIn) return;
    elements.accountEmail.textContent = state.account.email;
    renderWallet();
    renderKeys();
    renderPricing();
  }

  async function loadDashboard() {
    try {
      const account = await requestJson("/api/relay-auth/me");
      if (account.authenticated === false) {
        state.account = null;
        renderDashboard();
        return;
      }
      const [wallet, keys, pricing] = await Promise.all([
        requestJson("/api/relay-wallet"),
        requestJson("/api/relay-keys"),
        requestJson("/api/relay-pricing"),
      ]);
      state.account = account.account;
      state.wallet = wallet;
      state.keys = keys.data || [];
      state.pricing = pricing.data || [];
      renderDashboard();
    } catch (error) {
      state.account = null;
      renderDashboard();
      if (error.status !== 401) setAuthStatus(error.message);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthStatus("正在处理…");
    try {
      const body = await requestJson(state.register ? "/api/relay-auth/register" : "/api/relay-auth/login", {
        method: "POST",
        body: JSON.stringify({ email: elements.authEmail.value, password: elements.authPassword.value }),
      });
      state.account = body.account;
      state.wallet = body.wallet;
      state.keys = body.keys || [];
      const pricing = await requestJson("/api/relay-pricing");
      state.pricing = pricing.data || [];
      setAuthStatus("");
      elements.authForm.reset();
      renderDashboard();
    } catch (error) {
      setAuthStatus(error.message);
    }
  }

  async function createKey() {
    const name = window.prompt("给这枚 Key 起个名字", "我的应用");
    if (name === null) return;
    try {
      const body = await requestJson("/api/relay-keys", { method: "POST", body: JSON.stringify({ name }) });
      elements.newKeyValue.textContent = body.key;
      elements.keyReveal.hidden = false;
      state.keys = [...state.keys, body.data];
      renderKeys();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function revokeKey(id) {
    if (!window.confirm("撤销后这枚 Key 将不能继续调用，确定吗？")) return;
    try {
      await requestJson(`/api/relay-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.keys = state.keys.filter((key) => key.id !== id);
      renderKeys();
    } catch (error) {
      window.alert(error.message);
    }
  }

  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.authModeToggle.addEventListener("click", () => { state.register = !state.register; setAuthStatus(""); renderAuthMode(); });
  elements.logoutButton.addEventListener("click", async () => { await requestJson("/api/relay-auth/logout", { method: "POST" }).catch(() => {}); state.account = null; state.wallet = null; state.keys = []; renderDashboard(); renderAuthMode(); });
  elements.createKeyButton.addEventListener("click", createKey);
  elements.keyList.addEventListener("click", (event) => { const button = event.target.closest("[data-revoke-key]"); if (button) revokeKey(button.dataset.revokeKey); });
  elements.copyKeyButton.addEventListener("click", async () => { await navigator.clipboard?.writeText(elements.newKeyValue.textContent || ""); elements.copyKeyButton.textContent = "已复制"; window.setTimeout(() => { elements.copyKeyButton.textContent = "复制"; }, 1200); });
  elements.topupButton.addEventListener("click", () => { window.alert("在线充值通道尚未配置，当前不会扣款。请联系管理员发放测试额度。"); });
  renderAuthMode();
  renderPricing();
  loadDashboard();
})();
