const allowedBaseUrls = new Set(["https://api.coze.cn", "https://api.coze.com"]);
const allowedFileShapes = new Set(["file_id_object", "object", "string"]);
const defaultMaximumFileBytes = 5 * 1024 * 1024;

export class CozeIntegrationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "CozeIntegrationError";
    this.code = code;
    this.statusCode = statusCode;
    this.body = { error: { code, message } };
  }
}

function safeFileName(value, fallback = "resume.txt") {
  const name = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return name || fallback;
}

function cozeConfig(rawConfig) {
  const baseUrl = String(rawConfig?.baseUrl || "").replace(/\/+$/, "");
  const apiToken = String(rawConfig?.apiToken || "");
  const workflowId = String(rawConfig?.workflowId || "");
  const fileParameterShape = allowedFileShapes.has(rawConfig?.fileParameterShape)
    ? rawConfig.fileParameterShape
    : "file_id_object";

  if (!rawConfig?.enabled || !allowedBaseUrls.has(baseUrl) || !apiToken || !workflowId) {
    throw new CozeIntegrationError(
      "COZE_CONFIG_INVALID",
      "The Coze workflow is not fully configured in AI Project Hub.",
    );
  }

  return {
    baseUrl,
    apiToken,
    workflowId,
    workflowName: String(rawConfig.workflowName || "Coze workflow").slice(0, 100),
    userId: String(rawConfig.userId || "").slice(0, 100),
    fileParameterShape,
  };
}

function decodeResumeFile(resumeFile, maximumFileBytes) {
  if (!resumeFile || typeof resumeFile !== "object" || Array.isArray(resumeFile)) {
    return null;
  }
  const encoded = typeof resumeFile.base64 === "string" ? resumeFile.base64.trim() : "";
  if (!encoded || encoded.length > Math.ceil((maximumFileBytes * 4) / 3) + 8) {
    throw new CozeIntegrationError("COZE_FILE_INVALID", "The resume file is missing or too large.", 413);
  }
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 1 || buffer.length > maximumFileBytes) {
    throw new CozeIntegrationError("COZE_FILE_INVALID", "The resume file is missing or too large.", 413);
  }
  return {
    buffer,
    fileName: safeFileName(resumeFile.fileName, "resume.bin"),
    contentType: String(resumeFile.contentType || "application/octet-stream").slice(0, 100),
  };
}

export function validateCozeRunPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CozeIntegrationError("COZE_INPUT_INVALID", "The request body must be a JSON object.");
  }

  const maximumFileBytes = Number.isInteger(options.maximumFileBytes)
    ? Math.min(Math.max(options.maximumFileBytes, 1024), defaultMaximumFileBytes)
    : defaultMaximumFileBytes;
  const resumeFile = decodeResumeFile(payload.resumeFile, maximumFileBytes);
  const resumeText = typeof payload.resumeText === "string" ? payload.resumeText.trim() : "";
  if (!resumeFile && !resumeText) {
    throw new CozeIntegrationError("COZE_INPUT_INVALID", "Provide resumeText or resumeFile.");
  }
  if (Buffer.byteLength(resumeText, "utf8") > 200 * 1024) {
    throw new CozeIntegrationError("COZE_INPUT_TOO_LARGE", "resumeText exceeds the 200 KiB limit.", 413);
  }

  const jobDescription = typeof payload.jobDescription === "string" ? payload.jobDescription.trim() : "";
  if (Buffer.byteLength(jobDescription, "utf8") > 50 * 1024) {
    throw new CozeIntegrationError(
      "COZE_INPUT_TOO_LARGE",
      "jobDescription exceeds the 50 KiB limit.",
      413,
    );
  }

  return {
    resumeFile,
    resumeText,
    resumeSourceName: safeFileName(payload.resumeSourceName, "resume.txt"),
    jobDescription,
  };
}

function fileParameter(fileId, shape) {
  if (shape === "object") return { id: fileId };
  if (shape === "string") return fileId;
  return { file_id: fileId };
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function ensureProviderSuccess(response, payload, operation) {
  if (!response.ok || (payload.code !== undefined && Number(payload.code) !== 0)) {
    throw new CozeIntegrationError(
      "COZE_UPSTREAM_ERROR",
      `The Coze ${operation} request failed.`,
      502,
    );
  }
}

function hasWorkflowOutput(payload) {
  if (payload?.data == null) return false;
  if (typeof payload.data === "string") return payload.data.trim() !== "";
  if (Array.isArray(payload.data)) return payload.data.length > 0;
  if (typeof payload.data === "object") return Object.keys(payload.data).length > 0;
  return true;
}

async function guardedFetch(fetchImpl, url, init) {
  try {
    return await fetchImpl(url, init);
  } catch (cause) {
    const timedOut = cause?.name === "TimeoutError" || cause?.name === "AbortError";
    throw new CozeIntegrationError(
      timedOut ? "COZE_UPSTREAM_TIMEOUT" : "COZE_UPSTREAM_UNAVAILABLE",
      timedOut ? "The Coze request timed out." : "The Coze service could not be reached.",
      timedOut ? 504 : 502,
    );
  }
}

export async function runCozeWorkflow(rawConfig, rawPayload, options = {}) {
  const payload = validateCozeRunPayload(rawPayload, options);
  const config = cozeConfig(rawConfig);
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : fetch;
  const timeoutMs = Number.isInteger(options.timeoutMs)
    ? Math.min(Math.max(options.timeoutMs, 1000), 300000)
    : 60000;
  const signal = AbortSignal.timeout(timeoutMs);
  const form = new FormData();

  if (payload.resumeFile) {
    form.append(
      "file",
      new Blob([payload.resumeFile.buffer], { type: payload.resumeFile.contentType }),
      payload.resumeFile.fileName,
    );
  } else {
    form.append("file", new Blob([payload.resumeText], { type: "text/plain" }), payload.resumeSourceName);
  }

  const uploadResponse = await guardedFetch(fetchImpl, `${config.baseUrl}/v1/files/upload`, {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${config.apiToken}` },
    body: form,
  });
  const uploadPayload = await parseJson(uploadResponse);
  ensureProviderSuccess(uploadResponse, uploadPayload, "file upload");
  const fileId = uploadPayload.data?.id || uploadPayload.data?.file_id || uploadPayload.data?.file?.id;
  if (!fileId) {
    throw new CozeIntegrationError(
      "COZE_UPSTREAM_INVALID_RESPONSE",
      "The Coze upload response did not include a file identifier.",
      502,
    );
  }

  const parameters = {
    file: fileParameter(String(fileId), config.fileParameterShape),
    jd: payload.jobDescription,
    jobDescription: payload.jobDescription,
  };
  if (!payload.resumeFile) {
    parameters.resumeText = payload.resumeText;
  }
  const workflowRequest = {
    method: "POST",
    signal,
    headers: {
      authorization: `Bearer ${config.apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflow_id: config.workflowId, parameters }),
  };
  const workflowResponse = await guardedFetch(
    fetchImpl,
    `${config.baseUrl}/v1/workflow/run`,
    workflowRequest,
  );
  let workflowPayload = await parseJson(workflowResponse);
  ensureProviderSuccess(workflowResponse, workflowPayload, "workflow");

  if (!hasWorkflowOutput(workflowPayload)) {
    const streamResponse = await guardedFetch(
      fetchImpl,
      `${config.baseUrl}/v1/workflow/stream_run`,
      workflowRequest,
    );
    if (!streamResponse.ok) {
      throw new CozeIntegrationError("COZE_UPSTREAM_ERROR", "The Coze workflow request failed.", 502);
    }
    workflowPayload = { streamText: await streamResponse.text() };
  }

  return {
    workflowId: config.workflowId,
    workflowName: config.workflowName,
    userId: config.userId,
    fileId: String(fileId),
    result: workflowPayload,
  };
}
