const VALID_LEVELS = {
  stop: { label: "先别动", severity: "high" },
  suspicious: { label: "很可疑", severity: "medium" },
  check: { label: "基本正常但要确认", severity: "low" }
};

const HUB_CHAT_COMPLETIONS_URL = process.env.HUB_CHAT_COMPLETIONS_URL || "http://127.0.0.1:4194/hub/api/v1/chat/completions";
const HUB_PROJECT_TOKEN = process.env.HUB_PROJECT_TOKEN || "";

export function buildModelPrompt({ message, localResult }) {
  return {
    system: [
      "你是给老人和子女使用的防骗助手。",
      "你的任务是判断短信、电话话术、微信群或投资群消息是否存在诈骗风险。",
      "用大白话输出，不要制造恐慌，也不要给投资、法律或执法结论。",
      "只返回 JSON，不要 Markdown，不要解释 JSON 之外的内容。",
      "JSON 字段必须是：level, summary, matchedRules, actions, childMessage, childReply。",
      "level.key 只能是 stop、suspicious、check。",
      "matchedRules 每项包含 id、label、plain、advice、evidence。",
      "actions 是老人现在应该做的短句列表。",
      "childMessage 是老人可直接发给子女确认的话。",
      "childReply 是子女可直接回复老人的话。"
    ].join("\n"),
    user: [
      "请分析下面这段可疑内容。",
      "",
      "原文：",
      message,
      "",
      "本地规则初判：",
      JSON.stringify(localResult, null, 2),
      "",
      "输出要求：",
      "1. 如果涉及转账、验证码、共享屏幕、下载陌生软件、公检法、安全账户、高收益投资，优先判为 stop。",
      "2. summary 必须是一句老人能听懂的话。",
      "3. childMessage 里必须包含“我现在先不转账、不点链接、不下载软件，也不把验证码告诉别人”。",
      "4. childReply 必须能让子女直接复制发送。"
    ].join("\n")
  };
}

export function parseModelJson(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("模型没有返回内容");
  }

  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractFirstJsonObject(raw);
    if (!extracted) {
      throw new Error("模型返回的不是 JSON");
    }
    return JSON.parse(extracted);
  }
}

export function normalizeModelResult(value) {
  if (!value || typeof value !== "object") {
    throw new Error("模型 JSON 结构无效");
  }

  const levelKey = String(value.level?.key || "").trim();
  const levelTemplate = VALID_LEVELS[levelKey] || VALID_LEVELS.check;
  const score = Number(value.level?.score);

  return {
    level: {
      key: levelKey in VALID_LEVELS ? levelKey : "check",
      label: levelTemplate.label,
      severity: levelTemplate.severity,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50
    },
    summary: cleanText(value.summary) || "模型没有给出明确结论，建议先让家人确认。",
    matchedRules: normalizeRules(value.matchedRules),
    actions: normalizeStringArray(value.actions, [
      "先不要转账、付款或充值。",
      "不要点链接，不要扫陌生二维码。",
      "把原消息发给子女或可信家人确认。"
    ]),
    childMessage:
      cleanText(value.childMessage) ||
      "我收到一段可疑消息，想让你帮我确认一下是不是诈骗。我现在先不转账、不点链接、不下载软件，也不把验证码告诉别人。",
    childReply:
      cleanText(value.childReply) ||
      "先别操作。把完整截图发我，我帮你一起看；涉及钱、验证码、下载软件都先停。"
  };
}

export async function callModelProvider({ message, localResult, fetchImpl = fetch }) {
  const prompt = buildModelPrompt({ message, localResult });
  const rawText = await callHubChat({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    fetchImpl
  });
  const parsed = parseModelJson(rawText);
  return normalizeModelResult(parsed);
}

async function callHubChat({ messages, fetchImpl }) {
  const response = await fetchImpl(HUB_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: hubHeaders(),
    body: JSON.stringify({
      messages,
      temperature: 0.2,
      max_tokens: 1600,
      response_format: { type: "json_object" }
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.error?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(`Hub model review failed: ${String(message).slice(0, 240)}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Hub model returned no usable content");
  }
  return content;
}

function hubHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  if (HUB_PROJECT_TOKEN) {
    headers["x-hub-project-token"] = HUB_PROJECT_TOKEN;
  }
  return headers;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeStringArray(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value.map(cleanText).filter(Boolean).slice(0, 8);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeRules(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 8).map((rule, index) => ({
    id: cleanText(rule.id) || `model_rule_${index + 1}`,
    label: cleanText(rule.label) || "模型识别的可疑点",
    weight: Number.isFinite(Number(rule.weight)) ? Number(rule.weight) : 3,
    plain: cleanText(rule.plain) || cleanText(rule.advice) || "模型认为这里需要谨慎确认。",
    advice: cleanText(rule.advice) || "先不要操作，发给家人确认。",
    evidence: normalizeStringArray(rule.evidence, [])
  }));
}

function extractFirstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}
