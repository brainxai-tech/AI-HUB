import {
  AlertCircle,
  Clipboard,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Sparkles,
  Upload,
  WandSparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  defaultModels,
  defaultSystemPrompt,
  GenerateRealityResponseSchema,
  isGptModel,
  type GenerateRealityResponse,
  type PhotoInput,
  type World
} from "./shared/contracts";
import { worldOrder, worldPresets } from "./shared/worlds";

type UploadedPhoto = PhotoInput & {
  previewUrl: string;
};

const basePath = normalizeBasePath(import.meta.env.BASE_URL || "/");

type HubProvider = {
  id: "openai";
  name: string;
  defaultModel: string;
  models: string[];
  enabledModels: string[];
  enabled: boolean;
  configured: boolean;
};

type ProvidersResponse = {
  providers?: HubProvider[];
  configured?: boolean;
  hubUrl?: string;
  error?: string | { message?: string };
  message?: string;
};

const fallbackProvider: HubProvider = {
  id: "openai",
  name: "GPT · AI Routing",
  defaultModel: defaultModels.openai,
  models: [defaultModels.openai],
  enabledModels: [],
  enabled: false,
  configured: false
};

export default function App() {
  const [world, setWorld] = useState<World>("cyber_city");
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [creativity, setCreativity] = useState(3);
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt);
  const [photoNote, setPhotoNote] = useState("");
  const [lockedElements, setLockedElements] = useState("");
  const [result, setResult] = useState<GenerateRealityResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<HubProvider>(fallbackProvider);
  const [model, setModel] = useState(defaultModels.openai);
  const [hubUrl, setHubUrl] = useState("/hub/#models");
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">("loading");
  const [configMessage, setConfigMessage] = useState("正在读取 Hub 模型配置...");

  useEffect(() => {
    let cancelled = false;

    async function loadProvider() {
      try {
        const response = await fetch(apiPath("/api/providers"), { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as ProvidersResponse;
        if (!response.ok) {
          throw new Error(readResponseMessage(payload) || "读取 Hub 模型配置失败。");
        }

        const nextProvider = normalizeProvider(payload.providers);
        const selectedModel = pickModel(nextProvider);
        if (cancelled) return;
        setSelectedProvider(nextProvider);
        setModel(selectedModel);
        setHubUrl(payload.hubUrl || "/hub/#models");
        setConfigStatus(nextProvider.enabled && nextProvider.configured ? "ready" : "error");
        setConfigMessage(
          nextProvider.enabled && nextProvider.configured
            ? `Hub 当前项目型号：${selectedModel}`
            : "请先在 AI Hub 配置 AI Routing Key，并在页面顶部为本项目选择 GPT 型号。"
        );
      } catch (caught) {
        if (cancelled) return;
        setConfigStatus("error");
        setConfigMessage(caught instanceof Error ? caught.message : "读取 Hub 模型配置失败。");
      }
    }

    loadProvider();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentWorld = worldPresets[world];
  const activeModel = model || pickModel(selectedProvider);
  const hubReady = configStatus === "ready" && selectedProvider.enabled && selectedProvider.configured && isGptModel(activeModel);
  const canGenerate = Boolean(photo) && hubReady && !isLoading;

  const inputStatus = useMemo(() => {
    if (configStatus === "loading") return "读取 Hub 配置中";
    if (!hubReady) return "Hub GPT 未就绪";
    return `Hub · ${activeModel}`;
  }, [activeModel, configStatus, hubReady]);

  async function onFileChange(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件。");
      return;
    }
    if (file.size > 8_500_000) {
      setError("图片需要小于 8.5MB。");
      return;
    }

    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setResult(null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取图片失败。");
    }
  }

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    if (!photo) {
      setError("请先上传照片。");
      return;
    }

    setIsLoading(true);
    setError("");
    setCopiedField("");

    try {
      const response = await fetch(apiPath("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          model: activeModel,
          world,
          language,
          creativity,
          photo: {
            dataUrl: photo.dataUrl,
            mimeType: photo.mimeType,
            name: photo.name,
            size: photo.size
          },
          systemPrompt: systemPrompt.trim() || undefined,
          photoNote: photoNote.trim() || undefined,
          lockedElements: lockedElements.trim() || undefined
        })
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message || "生成失败。");
      }

      const parsed = GenerateRealityResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("服务端返回结构不完整。");
      }
      setResult(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField(""), 1200);
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <div className="topbar">
          <div>
            <p className="eyebrow">AI reality filter</p>
            <h1 id="app-title">AI · 现实滤镜翻译器</h1>
          </div>
          <div className="status-pill" aria-live="polite">
            <Sparkles size={16} aria-hidden="true" />
            <span>{inputStatus}</span>
          </div>
        </div>

        <form className="tool-grid" onSubmit={generate}>
          <section className="panel input-panel" aria-labelledby="photo-title">
            <div className="panel-heading">
              <ImageIcon size={18} aria-hidden="true" />
              <h2 id="photo-title">照片</h2>
            </div>

            <label className={`drop-zone ${photo ? "has-photo" : ""}`}>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onFileChange(event.target.files?.[0])}
              />
              {photo ? (
                <img src={photo.previewUrl} alt="上传照片预览" />
              ) : (
                <span className="drop-empty">
                  <Upload size={28} aria-hidden="true" />
                  <strong>上传一张日常照片</strong>
                  <small>JPG, PNG, WebP · 8.5MB 内</small>
                </span>
              )}
            </label>

            <label className="field">
              <span>原图补充</span>
              <textarea
                value={photoNote}
                onChange={(event) => setPhotoNote(event.target.value)}
                placeholder="例：夜晚便利店门口，有玻璃门、白色灯牌、几辆电动车"
                rows={4}
              />
            </label>

            <label className="field">
              <span>必须保留</span>
              <input
                value={lockedElements}
                onChange={(event) => setLockedElements(event.target.value)}
                placeholder="例：红色招牌、窗边的人、桌上的杯子"
              />
            </label>
          </section>

          <section className="panel controls-panel" aria-labelledby="controls-title">
            <div className="panel-heading">
              <WandSparkles size={18} aria-hidden="true" />
              <h2 id="controls-title">世界观</h2>
            </div>

            <div className="world-list" role="radiogroup" aria-label="世界观">
              {worldOrder.map((worldId) => {
                const item = worldPresets[worldId];
                const selected = world === worldId;
                return (
                  <button
                    className={`world-button ${selected ? "selected" : ""}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    key={worldId}
                    onClick={() => setWorld(worldId)}
                  >
                    <span>{item.label}</span>
                    <small>{item.shortLabel}</small>
                  </button>
                );
              })}
            </div>

            <div className="provider-section">
              <div className="panel-heading compact">
                <Sparkles size={17} aria-hidden="true" />
                <h3>生成规则</h3>
              </div>
              <p className={`notice hub-notice ${configStatus}`}>
                {configMessage} 切换 GPT 型号请使用页面顶部统一模型选择器；项目内不再配置厂商、模型或 API Key。
                {!hubReady ? <a href={hubUrl}>前往 Hub 配置</a> : null}
              </p>
              <label className="field system-prompt-field">
                <span>系统提示词</span>
                <textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={7}
                  placeholder="告诉 AI 如何读图、如何保留事实、如何写故事和 prompt"
                />
              </label>
            </div>

            <div className="inline-fields">
              <label className="field">
                <span>语言</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as "zh-CN" | "en")}>
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="field">
                <span>改写强度 {creativity}</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={creativity}
                  onChange={(event) => setCreativity(Number(event.target.value))}
                />
              </label>
            </div>

            <button className="primary-action" type="submit" disabled={!canGenerate}>
              {isLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <WandSparkles size={18} aria-hidden="true" />}
              <span>{isLoading ? "生成中" : "发送给 Hub 当前选择的 GPT 型号"}</span>
            </button>

            {error ? (
              <div className="error-box" role="alert">
                <AlertCircle size={17} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
          </section>

          <section className="panel result-panel" aria-labelledby="result-title">
            <div className="panel-heading">
              <FileText size={18} aria-hidden="true" />
              <h2 id="result-title">结果</h2>
            </div>

            {result ? (
              <article className="result-stack">
                <header className="result-header">
                  <p>{currentWorld.label}</p>
                  <h3>{result.data.title}</h3>
                  <small>Hub · {result.meta.model}</small>
                </header>

                <section className="result-block">
                  <div className="block-title">
                    <span>故事说明</span>
                    <button type="button" onClick={() => copyText("story", result.data.story)} aria-label="复制故事说明">
                      <Clipboard size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <p>{result.data.story}</p>
                </section>

                <section className="result-block">
                  <div className="block-title">
                    <span>画面 prompt</span>
                    <button type="button" onClick={() => copyText("prompt", result.data.scenePrompt)} aria-label="复制画面 prompt">
                      <Clipboard size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <pre>{result.data.scenePrompt}</pre>
                </section>

                <section className="result-block compact-block">
                  <div className="block-title">
                    <span>negative prompt</span>
                    <button
                      type="button"
                      onClick={() => copyText("negative", result.data.negativePrompt)}
                      aria-label="复制 negative prompt"
                    >
                      <Clipboard size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <pre>{result.data.negativePrompt}</pre>
                </section>

                <section className="facts-grid" aria-label="源照片事实和视觉指令">
                  <div>
                    <h4>源照片事实</h4>
                    <ul>
                      {result.data.sourcePhotoFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>视觉指令</h4>
                    <dl>
                      <dt>镜头</dt>
                      <dd>{result.data.visualDirectives.camera}</dd>
                      <dt>光线</dt>
                      <dd>{result.data.visualDirectives.lighting}</dd>
                      <dt>色板</dt>
                      <dd>{result.data.visualDirectives.palette.join(" / ")}</dd>
                    </dl>
                  </div>
                </section>

                {result.data.safetyNotes.length ? (
                  <section className="safety-notes">
                    {result.data.safetyNotes.map((note) => (
                      <span key={note}>{note}</span>
                    ))}
                  </section>
                ) : null}

                <div className="result-actions">
                  <button type="button" onClick={() => copyText("all", buildShareText(result))}>
                    <Clipboard size={16} aria-hidden="true" />
                    <span>{copiedField ? "已复制" : "复制结果"}</span>
                  </button>
                  <button type="button" onClick={() => generate()}>
                    <RefreshCcw size={16} aria-hidden="true" />
                    <span>重新生成</span>
                  </button>
                </div>
              </article>
            ) : (
              <div className="empty-result">
                <Sparkles size={30} aria-hidden="true" />
                <h3>{currentWorld.label}</h3>
                <p>{currentWorld.premise}</p>
              </div>
            )}
          </section>
        </form>
      </section>
    </main>
  );
}

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}

async function preparePhoto(file: File): Promise<UploadedPhoto> {
  const image = await createImageBitmap(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("当前浏览器无法压缩图片。");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  let quality = 0.8;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > 320_000 && quality > 0.42) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > 360_000) {
    throw new Error("图片压缩后仍然过大，请换一张尺寸更小的图片。");
  }

  const dataUrl = await readFileAsDataUrl(blob);
  return {
    dataUrl,
    previewUrl: dataUrl,
    mimeType: "image/jpeg",
    name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    size: blob.size
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("图片压缩失败。"))), "image/jpeg", quality);
  });
}

function apiPath(path: string) {
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function normalizeProvider(providers?: HubProvider[]) {
  const provider = Array.isArray(providers) ? providers.find((item) => item.id === "openai") : undefined;
  if (!provider) return fallbackProvider;

  const enabledModels = uniqueStrings(provider.enabledModels || []).filter(isGptModel);
  const models = uniqueStrings([...enabledModels, ...(provider.models || []), provider.defaultModel]).filter(isGptModel);
  const defaultModel = isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : enabledModels[0] || models[0] || defaultModels.openai;
  const ready = Boolean(provider.enabled && provider.configured && models.length);

  return {
    id: "openai" as const,
    name: provider.name || fallbackProvider.name,
    defaultModel,
    models: models.length ? models : [...fallbackProvider.models],
    enabledModels,
    enabled: ready,
    configured: ready
  };
}

function pickModel(provider: HubProvider) {
  return isGptModel(provider.defaultModel)
    ? provider.defaultModel.trim()
    : provider.enabledModels.find(isGptModel) || provider.models.find(isGptModel) || defaultModels.openai;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function readResponseMessage(payload: ProvidersResponse) {
  if (typeof payload.error === "object" && payload.error?.message) return payload.error.message;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
  return "";
}

function buildShareText(result: GenerateRealityResponse) {
  return [
    result.data.title,
    "",
    result.data.story,
    "",
    "Prompt:",
    result.data.scenePrompt,
    "",
    "Negative prompt:",
    result.data.negativePrompt
  ].join("\n");
}
