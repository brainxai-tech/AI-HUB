(function () {
  "use strict";

  const state = {
    adminToken: "",
    adminVerified: false,
    publicConfig: null,
    models: [],
    modelsVerified: false,
  };

  const elements = {
    connectionBadge: document.querySelector("#connectionBadge"),
    connectionText: document.querySelector("#connectionText"),
    providerState: document.querySelector("#providerState"),
    adminToken: document.querySelector("#adminTokenInput"),
    verifyAdmin: document.querySelector("#verifyAdminButton"),
    credentialStage: document.querySelector("#credentialStage"),
    routingKey: document.querySelector("#routingKeyInput"),
    toggleKey: document.querySelector("#toggleKeyButton"),
    fetchModels: document.querySelector("#fetchModelsButton"),
    keyGuidance: document.querySelector("#keyGuidance"),
    modelStage: document.querySelector("#modelStage"),
    modelCatalog: document.querySelector("#modelCatalog"),
    modelCount: document.querySelector("#modelCount"),
    saveConfig: document.querySelector("#saveConfigButton"),
    clearSession: document.querySelector("#clearSessionButton"),
    notice: document.querySelector("#actionNotice"),
    noticeTitle: document.querySelector("#noticeTitle"),
    noticeBody: document.querySelector("#noticeBody"),
    stepAuth: document.querySelector("#stepAuth"),
    stepAuthStatus: document.querySelector("#stepAuthStatus"),
    stepKey: document.querySelector("#stepKey"),
    stepKeyStatus: document.querySelector("#stepKeyStatus"),
    stepModel: document.querySelector("#stepModel"),
    stepModelStatus: document.querySelector("#stepModelStatus"),
  };

  function providerFromConfig(config) {
    return Array.isArray(config?.providers)
      ? config.providers.find((provider) => provider.id === "routing") || null
      : null;
  }

  function setNotice(status, title, body) {
    elements.notice.dataset.state = status;
    elements.noticeTitle.textContent = title;
    elements.noticeBody.textContent = body;
  }

  function setStep(step, statusElement, status, message) {
    step.dataset.state = status;
    statusElement.textContent = message;
  }

  function setBusy(button, busy, busyLabel, idleLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  function resetModels() {
    state.models = [];
    state.modelsVerified = false;
    elements.modelCatalog.textContent = "请先获取模型列表";
    elements.modelCount.textContent = "尚未获取模型";
    elements.modelStage.disabled = true;
    elements.saveConfig.disabled = true;
    setStep(elements.stepModel, elements.stepModelStatus, "waiting", "等待模型列表");
  }

  function resetAuthorization(message) {
    state.adminToken = "";
    state.adminVerified = false;
    elements.credentialStage.disabled = true;
    elements.routingKey.value = "";
    elements.routingKey.type = "password";
    elements.toggleKey.textContent = "显示";
    elements.toggleKey.setAttribute("aria-pressed", "false");
    resetModels();
    setStep(elements.stepAuth, elements.stepAuthStatus, "current", message || "等待输入管理员口令");
    setStep(elements.stepKey, elements.stepKeyStatus, "waiting", "验证后开放");
  }

  function renderProviderState(config) {
    const provider = providerFromConfig(config);
    const statusBox = elements.providerState.closest(".provider-state");

    if (provider?.enabled && provider?.configured) {
      elements.providerState.textContent = `已接通 · ${provider.models.length} 个可选模型`;
      statusBox.dataset.state = "online";
      elements.keyGuidance.textContent = "已保存 Routing Key。输入新 Key 可替换，留空可使用已保存 Key 刷新模型。";
      return;
    }

    if (provider?.configured) {
      elements.providerState.textContent = "密钥已保存，尚未启用";
      statusBox.dataset.state = "offline";
      elements.keyGuidance.textContent = "已保存 Routing Key。留空可使用已保存 Key 获取模型并启用。";
      return;
    }

    elements.providerState.textContent = "尚未配置";
    statusBox.dataset.state = "offline";
    elements.keyGuidance.textContent = "粘贴新的 API Key。检测成功前不会保存。";
  }

  async function requestJson(path, options) {
    const init = options || {};
    const headers = {
      accept: "application/json",
      ...(init.headers || {}),
    };

    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (init.admin) {
      headers["x-hub-admin-token"] = state.adminToken;
    }

    const response = await fetch(`/hub${path}`, {
      method: init.method || "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof body.error === "string"
          ? body.error
          : body.error && typeof body.error.message === "string"
            ? body.error.message
            : `请求失败（HTTP ${response.status}）`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return body;
  }

  async function loadPublicConfig() {
    elements.connectionBadge.dataset.state = "checking";
    elements.connectionText.textContent = "正在检查网关";

    try {
      const config = await requestJson("/api/model-config");
      state.publicConfig = config;
      renderProviderState(config);
      if (config.localMode) {
        state.adminVerified = true;
        elements.adminToken.closest("fieldset").style.display = "none";
        elements.stepAuth.hidden = true;
        elements.credentialStage.disabled = false;
        elements.clearSession.disabled = true;
        setStep(elements.stepKey, elements.stepKeyStatus, "current", "等待检测 Routing Key");
        setNotice("neutral", "本地模式已就绪", "粘贴自己的 AI Routing API Key，然后检测并保存即可。");
      }
      elements.connectionBadge.dataset.state = "online";
      elements.connectionText.textContent = "网关在线";
    } catch (error) {
      elements.connectionBadge.dataset.state = "offline";
      elements.connectionText.textContent = "网关不可用";
      elements.providerState.textContent = "无法读取";
      elements.providerState.closest(".provider-state").dataset.state = "offline";
      setNotice("error", "无法连接 HUB 网关", error.message);
    }
  }

  async function verifyAdmin() {
    const token = elements.adminToken.value.trim();
    if (!token) {
      setNotice("error", "需要管理员口令", "输入 HUB_ADMIN_TOKEN 后再继续。 ");
      elements.adminToken.focus();
      return;
    }

    state.adminToken = token;
    setBusy(elements.verifyAdmin, true, "正在验证…", "验证并继续");
    setNotice("working", "正在验证管理员", "只验证本次页面会话，不会在浏览器中保存口令。 ");

    try {
      await requestJson("/api/admin/verify", { method: "POST", admin: true });
      state.adminVerified = true;
      elements.credentialStage.disabled = false;
      setStep(elements.stepAuth, elements.stepAuthStatus, "done", "管理员验证通过");
      setStep(elements.stepKey, elements.stepKeyStatus, "current", "等待检测 Routing Key");
      setNotice("success", "管理员验证通过", "下一步检测 AI Routing Key 并获取模型列表。 ");
      elements.routingKey.focus();
    } catch (error) {
      state.adminToken = "";
      state.adminVerified = false;
      setStep(elements.stepAuth, elements.stepAuthStatus, "error", "管理员口令不正确");
      setNotice("error", "管理员验证失败", error.status === 401 ? "管理员口令不正确。" : error.message);
      elements.adminToken.select();
    } finally {
      setBusy(elements.verifyAdmin, false, "正在验证…", state.adminVerified ? "已验证" : "验证并继续");
      elements.verifyAdmin.disabled = state.adminVerified;
    }
  }

  function renderModels(models) {
    elements.modelCatalog.replaceChildren();
    for (const model of models) {
      const item = document.createElement("span");
      item.className = "model-choice";
      item.textContent = model;
      elements.modelCatalog.append(item);
    }

    elements.modelCount.textContent = `已验证并载入 ${models.length} 个模型`;
  }

  async function fetchModels() {
    if (!state.adminVerified) {
      resetAuthorization("请重新验证管理员口令");
      setNotice("error", "需要管理员验证", "先完成第一步再检测 Key。 ");
      return;
    }

    const provider = providerFromConfig(state.publicConfig);
    const apiKey = elements.routingKey.value.trim();
    if (!apiKey && !provider?.configured) {
      setNotice("error", "需要 AI Routing Key", "粘贴 API Key 后再检测。 ");
      elements.routingKey.focus();
      return;
    }

    resetModels();
    setBusy(elements.fetchModels, true, "正在连接…", "检测并获取模型");
    setNotice("working", "正在连接 AI Routing", "验证密钥并读取可用模型列表。 ");

    try {
      const result = await requestJson("/api/provider-models", {
        method: "POST",
        admin: true,
        body: apiKey ? { apiKey } : {},
      });
      const models = Array.isArray(result.models)
        ? Array.from(new Set(result.models.filter((model) =>
            typeof model === "string" && /^gpt-/i.test(model.trim()),
          )))
        : [];

      if (models.length === 0) {
        throw new Error("密钥通过验证，但接口没有返回可用模型。");
      }

      state.models = models;
      state.modelsVerified = true;
      renderModels(models);
      elements.modelStage.disabled = false;
      elements.saveConfig.disabled = false;
      setStep(elements.stepKey, elements.stepKeyStatus, "done", `密钥有效 · ${models.length} 个可调用模型`);
      setStep(elements.stepModel, elements.stepModelStatus, "current", "等待保存模型目录");
      setNotice(
        "success",
        "密钥有效",
        `已真实验证 ${models.length} 个当前 Key 可调用的具体 GPT 文本模型。保存后，各项目会立即获得可用型号，也可在项目顶部单独调整。`,
      );
      elements.saveConfig.focus();
    } catch (error) {
      setStep(elements.stepKey, elements.stepKeyStatus, "error", "Routing Key 检测失败");
      setNotice("error", "无法获取模型", error.status === 401 ? "管理员口令已失效，请清空后重新验证。" : error.message);
    } finally {
      setBusy(elements.fetchModels, false, "正在连接…", "检测并获取模型");
    }
  }

  async function saveConfig() {
    if (!state.adminVerified || !state.modelsVerified || state.models.length === 0) {
      setNotice("error", "配置尚未就绪", "重新检测 Key，确认已读取可调用模型列表。 ");
      return;
    }

    const apiKey = elements.routingKey.value.trim();
    setBusy(elements.saveConfig, true, "正在保存…", "保存并启用");
    setNotice("working", "正在保存配置", "写入服务器并检查模型入口状态。 ");

    try {
      const config = await requestJson("/api/model-config", {
        method: "PUT",
        admin: true,
        body: {
          defaultProvider: "routing",
          providers: {
            routing: {
              enabled: true,
              apiKey,
              models: state.models,
              enabledModels: state.models,
            },
          },
        },
      });
      const provider = providerFromConfig(config);
      if (!provider?.enabled || !provider?.configured) {
        throw new Error("服务器已响应，但模型入口仍未启用。");
      }

      state.publicConfig = config;
      elements.routingKey.value = "";
      elements.routingKey.type = "password";
      elements.toggleKey.textContent = "显示";
      elements.toggleKey.setAttribute("aria-pressed", "false");
      renderProviderState(config);
      setStep(elements.stepModel, elements.stepModelStatus, "done", `已保存 ${state.models.length} 个可选模型`);
        setNotice("success", "Key 与模型目录已保存", "密钥输入框已清空。所有 AI 项目已可使用；进入具体项目后，可在顶部自由切换要调用的模型。 ");
    } catch (error) {
      setStep(elements.stepModel, elements.stepModelStatus, "error", "配置保存失败");
      setNotice("error", "无法保存配置", error.status === 401 ? "管理员口令已失效，请重新验证。" : error.message);
    } finally {
      setBusy(elements.saveConfig, false, "正在保存…", "保存并启用");
    }
  }

  function clearSession() {
    if (state.publicConfig?.localMode) return;
    elements.adminToken.value = "";
    resetAuthorization();
    elements.verifyAdmin.disabled = false;
    elements.verifyAdmin.textContent = "验证并继续";
    setNotice("neutral", "本页凭证已清空", "服务器中已保存的配置没有改变。 ");
    elements.adminToken.focus();
  }

  elements.verifyAdmin.addEventListener("click", verifyAdmin);
  elements.adminToken.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyAdmin();
    }
  });
  elements.adminToken.addEventListener("input", () => {
    if (state.adminVerified && elements.adminToken.value.trim() !== state.adminToken) {
      resetAuthorization("管理员口令已更改，请重新验证");
      elements.verifyAdmin.disabled = false;
      elements.verifyAdmin.textContent = "验证并继续";
    }
  });
  elements.routingKey.addEventListener("input", () => {
    if (state.modelsVerified) {
      resetModels();
      setStep(elements.stepKey, elements.stepKeyStatus, "current", "Key 已更改，请重新检测");
    }
  });
  elements.toggleKey.addEventListener("click", () => {
    const revealing = elements.routingKey.type === "password";
    elements.routingKey.type = revealing ? "text" : "password";
    elements.toggleKey.textContent = revealing ? "隐藏" : "显示";
    elements.toggleKey.setAttribute("aria-pressed", String(revealing));
    elements.routingKey.focus();
  });
  elements.fetchModels.addEventListener("click", fetchModels);
  elements.saveConfig.addEventListener("click", saveConfig);
  elements.clearSession.addEventListener("click", clearSession);
  window.addEventListener("pagehide", () => {
    state.adminToken = "";
    elements.adminToken.value = "";
    elements.routingKey.value = "";
  });

  loadPublicConfig();
})();
