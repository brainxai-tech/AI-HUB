import { analyzeMessage, sampleMessages } from "./fraudAnalyzer.mjs";

function appUrl(path) {
  const basePath = location.pathname === "/elder" || location.pathname.startsWith("/elder/")
    ? "/elder"
    : "";
  return `${basePath}${path}`;
}

const elements = {
  messageText: document.querySelector("#messageText"),
  analyzeButton: document.querySelector("#analyzeButton"),
  modelAnalyzeButton: document.querySelector("#modelAnalyzeButton"),
  clearButton: document.querySelector("#clearButton"),
  imageInput: document.querySelector("#imageInput"),
  imagePreview: document.querySelector("#imagePreview"),
  uploadNote: document.querySelector("#uploadNote"),
  analysisModeNote: document.querySelector("#analysisModeNote"),
  resultHint: document.querySelector("#resultHint"),
  riskBanner: document.querySelector("#riskBanner"),
  riskLabel: document.querySelector("#riskLabel"),
  riskScore: document.querySelector("#riskScore"),
  plainSummary: document.querySelector("#plainSummary"),
  signalList: document.querySelector("#signalList"),
  actionList: document.querySelector("#actionList"),
  childMessage: document.querySelector("#childMessage"),
  childReply: document.querySelector("#childReply"),
  copyChildButton: document.querySelector("#copyChildButton"),
  copyReplyButton: document.querySelector("#copyReplyButton"),
  toast: document.querySelector("#toast")
};

let latestResult = analyzeMessage("");

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
}

function renderSignals(signals) {
  elements.signalList.innerHTML = "";

  if (signals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "没有明显可疑点。只要涉及钱、验证码、下载软件，还是先问家人。";
    elements.signalList.append(empty);
    return;
  }

  for (const signal of signals) {
    const item = document.createElement("article");
    item.className = "signal-item";

    const title = document.createElement("strong");
    title.textContent = signal.label;

    const plain = document.createElement("p");
    plain.textContent = signal.plain;

    item.append(title, plain);

    if (signal.evidence?.length > 0) {
      const evidence = document.createElement("span");
      evidence.className = "evidence";
      evidence.textContent = `原文：${signal.evidence[0]}`;
      item.append(evidence);
    }

    elements.signalList.append(item);
  }
}

function renderActions(actions) {
  elements.actionList.innerHTML = "";
  for (const action of actions) {
    const item = document.createElement("li");
    item.textContent = action;
    elements.actionList.append(item);
  }
}

function renderResult(result, hint = "判断完成") {
  latestResult = result;
  elements.resultHint.textContent = hint;
  elements.riskBanner.className = `risk-banner risk-${result.level.severity}`;
  elements.riskLabel.textContent = result.level.label;
  elements.riskScore.textContent = String(result.level.score);
  elements.plainSummary.textContent = result.summary;
  elements.childMessage.value = result.childMessage;
  elements.childReply.textContent = result.childReply;
  renderSignals(result.matchedRules);
  renderActions(result.actions);
}

function getMessageTextOrFocus() {
  const text = elements.messageText.value.trim();
  if (!text) {
    showToast("先放入一段消息文字");
    elements.messageText.focus();
    return "";
  }
  return text;
}

function analyzeCurrentText() {
  const text = getMessageTextOrFocus();
  if (!text) return;

  renderResult(analyzeMessage(text), "本地判断完成");
  elements.analysisModeNote.textContent = "当前结果来自本地规则。";
}

async function analyzeWithModel() {
  const text = getMessageTextOrFocus();
  if (!text) return;

  const localResult = analyzeMessage(text);
  setModelLoading(true);
  renderResult(localResult, "本地初判完成，正在智能复核");
  elements.analysisModeNote.textContent = "正在智能复核，请稍等。";

  try {
    const response = await fetch(appUrl("/api/model-analyze"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "智能复核失败");
    }

    renderResult(payload.result, "智能复核完成");
    elements.analysisModeNote.textContent = "当前结果已完成智能复核。";
  } catch (error) {
    renderResult(localResult, "智能复核暂时不可用，已保留本地判断");
    elements.analysisModeNote.textContent = "智能复核暂时不可用；当前显示本地规则结果。";
    showToast(publicServiceError(error));
  } finally {
    setModelLoading(false);
  }
}

function setModelLoading(isLoading) {
  elements.modelAnalyzeButton.disabled = isLoading;
  elements.analyzeButton.disabled = isLoading;
  elements.modelAnalyzeButton.textContent = isLoading ? "分析中..." : "智能复核";
}

function fillSample(sampleId) {
  const sample = sampleMessages.find((item) => item.id === sampleId);
  if (!sample) return;
  elements.messageText.value = sample.text;
  renderResult(analyzeMessage(sample.text), "本地判断完成");
  elements.analysisModeNote.textContent = "已填入示例，可继续点“智能复核”。";
}

async function copyText(text, emptyMessage) {
  if (!text.trim()) {
    showToast(emptyMessage);
    return;
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }

    await navigator.clipboard.writeText(text);
    showToast("已复制");
    return;
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.top = "-1000px";
    fallback.style.left = "-1000px";
    document.body.append(fallback);
    fallback.focus();
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    showToast(copied ? "已复制" : "复制失败，请长按文字复制");
  }
}

function clearAll() {
  elements.messageText.value = "";
  elements.imageInput.value = "";
  elements.imagePreview.className = "image-preview empty";
  elements.imagePreview.textContent = "还没有截图";
  elements.uploadNote.textContent = "选择图片";
  renderResult(analyzeMessage(""));
  elements.resultHint.textContent = "先放入一段可疑内容";
  elements.riskBanner.className = "risk-banner risk-empty";
  elements.riskLabel.textContent = "未开始";
  elements.riskScore.textContent = "0";
  elements.plainSummary.textContent = "这里会用大白话说明哪里可疑。";
  elements.analysisModeNote.textContent = "默认先做本地判断；需要时可使用智能复核。";
}

function publicServiceError(error) {
  const message = typeof error === "string" ? error : error?.message;
  if (!message) return "智能复核暂时不可用";
  if (/hub|api|key|token|model|模型|供应商|密钥|openai|deepseek|gemini|claude/i.test(message)) {
    return "智能复核暂时不可用";
  }
  return message;
}

function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const image = document.createElement("img");
  image.alt = "已上传的可疑截图";
  image.src = url;
  image.onload = () => URL.revokeObjectURL(url);

  elements.imagePreview.className = "image-preview";
  elements.imagePreview.replaceChildren(image);
  elements.uploadNote.textContent = file.name;
  showToast("截图已放入");
}

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => fillSample(button.dataset.sample));
});

elements.analyzeButton.addEventListener("click", analyzeCurrentText);
elements.modelAnalyzeButton.addEventListener("click", analyzeWithModel);
elements.clearButton.addEventListener("click", clearAll);
elements.imageInput.addEventListener("change", handleImageUpload);
elements.copyChildButton.addEventListener("click", () => {
  copyText(elements.childMessage.value, "还没有可复制的内容");
});
elements.copyReplyButton.addEventListener("click", () => {
  copyText(elements.childReply.textContent, "还没有可复制的回复");
});

elements.messageText.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    analyzeCurrentText();
  }
});

renderResult(latestResult);
clearAll();
