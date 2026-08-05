import {
  AlertCircle,
  BadgeCheck,
  Check,
  Clipboard,
  ImagePlus,
  Loader2,
  Sparkles,
  ShieldCheck,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeAesthetic, fetchProviderHealth, type ProviderHealth } from "./lib/api";
import { fileToImageInput, maxImageCount, validateImageFile } from "./lib/files";
import type { AnalyzeResponse, ImageInput, ModelProvider } from "./shared/schema";

export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [provider, setProvider] = useState<ModelProvider>("demo");
  const [projectGoal, setProjectGoal] = useState("为个人主页生成下一版 UI 方向");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);

  useEffect(() => {
    fetchProviderHealth()
      .then((nextProviders) => {
        setProviders(nextProviders);
        const configured = nextProviders.find(isConfiguredVisionProvider);
        if (configured) {
          setProvider(configured.provider as ModelProvider);
        }
      })
      .catch(() => setProviders([]));
  }, []);

  const totalSize = useMemo(() => images.reduce((sum, image) => sum + image.size, 0), [images]);
  const selectedProvider = providers.find((item) => item.provider === provider);
  const providerReady = provider === "demo" || Boolean(selectedProvider?.configured);
  const configuredVisionCount = providers.filter(isConfiguredVisionProvider).length;
  const providerStatusText = provider === "demo"
    ? "AI Hub 暂未就绪，当前使用本地像素分析演示"
    : `${selectedProvider?.model || "GPT"} 已通过 AI Hub 就绪`;

  async function addFiles(fileList: FileList | File[]) {
    setError("");
    const files = Array.from(fileList);
    if (images.length + files.length > maxImageCount) {
      setError(`最多上传 ${maxImageCount} 张参考图。`);
      return;
    }

    const next: ImageInput[] = [];
    for (const file of files) {
      const validation = validateImageFile(file);
      if (validation) {
        setError(`${file.name}: ${validation}`);
        return;
      }
      next.push(await fileToImageInput(file));
    }
    setImages((current) => [...current, ...next]);
  }

  async function handleAnalyze() {
    setError("");
    setCopied(false);
    if (images.length === 0) {
      setError("请先上传至少 1 张参考图。");
      return;
    }
    setIsAnalyzing(true);
    try {
      const response = await analyzeAesthetic({ provider: providerReady ? provider : "demo", projectGoal, images });
      setReport(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function copyPrompt() {
    if (!report) return;
    await navigator.clipboard.writeText(report.report.uiPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="input-pane" aria-label="审美分析输入">
          <div className="brand-row">
            <div className="mark" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="eyebrow">Aesthetic Fingerprint</p>
              <h1>AI 审美指纹</h1>
            </div>
          </div>

          <div className="field-stack">
            <label className="field-label" htmlFor="goal">
              下一版目标
            </label>
            <textarea
              id="goal"
              value={projectGoal}
              onChange={(event) => setProjectGoal(event.target.value)}
              maxLength={600}
              rows={3}
            />
          </div>

          <div className="field-stack">
            <span className="field-label">AI Hub 模型</span>
            <div className={provider !== "demo" ? "model-status ready" : "model-status"}>
              {provider !== "demo" ? <BadgeCheck size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              <span>{providerStatusText}</span>
            </div>
            <p className="fine-print">GPT 型号由页面顶部的统一选择器管理，本项目不单独配置供应商或 API Key。</p>
          </div>

          <button
            type="button"
            className={isDragging ? "drop-zone dragging" : "drop-zone"}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void addFiles(event.dataTransfer.files);
            }}
          >
            <Upload size={22} />
            <span>上传网页、海报或截图</span>
            <small>JPEG / PNG / WebP，最多 10 张</small>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            aria-label="选择参考图片"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />

          <div className="image-list" aria-live="polite">
            <div className="list-header">
              <span>{images.length} 张参考图</span>
              <span>{formatSize(totalSize)}</span>
            </div>
            {images.length === 0 ? (
              <div className="empty-state">
                <ImagePlus size={18} />
                <span>等待参考图</span>
              </div>
            ) : (
              images.map((image, index) => (
                <div className="image-row" key={`${image.name}-${index}`}>
                  <img src={image.data} alt="" />
                  <div>
                    <strong>{image.name}</strong>
                    <span>{formatSize(image.size)}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`移除 ${image.name}`}
                    onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          {error ? (
            <div className="message error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="primary-action" type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{isAnalyzing ? "分析中" : providerReady && provider !== "demo" ? "生成审美报告" : "生成演示报告"}</span>
          </button>

          <p className="fine-print">
            {provider !== "demo"
              ? `图片先在本地提取像素指标，再由 AI Hub 生成报告；已连接 ${configuredVisionCount} 个统一模型入口，不持久化原图。`
              : "AI Hub 暂不可用，已切换为本地像素分析演示；项目内无需填写 API Key。"}
          </p>
        </aside>

        <section className="report-pane" aria-label="审美报告">
          {report ? (
            <ReportView response={report} copied={copied} onCopyPrompt={copyPrompt} />
          ) : (
            <div className="report-empty">
              <p className="eyebrow">Report</p>
              <h2>上传参考图后，这里会生成你的审美 DNA。</h2>
              <div className="preview-grid" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function ReportView({
  response,
  copied,
  onCopyPrompt
}: {
  response: AnalyzeResponse;
  copied: boolean;
  onCopyPrompt: () => void;
}) {
  const report = response.report;
  return (
    <article className="report">
      <header className="report-header">
        <div>
          <p className="eyebrow">
            {response.provider} / {response.model}
          </p>
          <h2>{report.dnaName}</h2>
          <p>{report.summary}</p>
        </div>
        <time>{new Date(response.generatedAt).toLocaleString("zh-CN")}</time>
      </header>

      <section className="section-grid">
        <div className="metric-block">
          <h3>色彩指纹</h3>
          <div className="swatches">
            {report.color.palette.map((color) => (
              <span key={color} title={color} style={{ backgroundColor: color }} />
            ))}
          </div>
          <p>{report.color.guidance}</p>
          <dl>
            <div>
              <dt>温度</dt>
              <dd>{report.color.temperature}</dd>
            </div>
            <div>
              <dt>对比</dt>
              <dd>{report.color.contrast}</dd>
            </div>
          </dl>
        </div>

        <div className="metric-block">
          <h3>排版</h3>
          <p>{report.typography.direction}</p>
          <dl>
            <div>
              <dt>层级</dt>
              <dd>{report.typography.hierarchy}</dd>
            </div>
            <div>
              <dt>留白</dt>
              <dd>{report.typography.spacing}</dd>
            </div>
          </dl>
        </div>

        <div className="metric-block">
          <h3>布局</h3>
          <p>{report.layout.composition}</p>
          <dl>
            <div>
              <dt>密度</dt>
              <dd>{report.layout.density}</dd>
            </div>
            <div>
              <dt>节奏</dt>
              <dd>{report.layout.rhythm}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="report-section">
        <h3>气质关键词</h3>
        <div className="mood-list">
          {report.mood.map((item) => (
            <div key={item.label} className="mood-item">
              <div>
                <strong>{item.label}</strong>
                <span>{Math.round(item.confidence * 100)}%</span>
              </div>
              <p>{item.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="split-section">
        <div className="report-section">
          <h3>禁忌</h3>
          <ul className="plain-list">
            {report.taboos.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="report-section">
          <h3>下一版方向</h3>
          <div className="direction-list">
            {report.nextDirections.map((item) => (
              <div key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <small>{item.whenToUse}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="prompt-panel">
        <div>
          <p className="eyebrow">UI Prompt</p>
          <h3>下一版设计提示词</h3>
        </div>
        <button type="button" className="copy-button" onClick={onCopyPrompt}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
        <pre>{report.uiPrompt}</pre>
      </section>

      <section className="split-section">
        <div className="report-section">
          <h3>逐图观察</h3>
          <div className="image-notes">
            {report.imageNotes.map((item) => (
              <details key={item.imageName}>
                <summary>{item.imageName}</summary>
                <ul>
                  {item.observations.map((observation) => (
                    <li key={observation}>{observation}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
        <div className="report-section">
          <h3>边界</h3>
          <ul className="plain-list">
            {report.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </article>
  );
}

function isConfiguredVisionProvider(provider: ProviderHealth) {
  return provider.provider === "openai" && provider.configured;
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}
