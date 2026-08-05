import pdfParse from "pdf-parse";
import { parsePaperText } from "./paperParser.js";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_REMOTE_BYTES = 28 * 1024 * 1024;

export async function parsePdfBuffer(buffer: Buffer, options: { sourceName?: string; sourceUrl?: string } = {}) {
  const parsed = await pdfParse(buffer);
  if (!parsed.text || parsed.text.trim().length < 80) {
    throw new ImportError("PDF_TEXT_EMPTY", "这个 PDF 没有可解析的文本层，OCR 版本会放到 V2。", 422);
  }
  return parsePaperText(parsed.text, {
    sourceName: options.sourceName,
    sourceUrl: options.sourceUrl,
    pages: parsed.numpages
  });
}

export async function importPaperFromLink(rawUrl: string, fetchImpl: typeof fetch = fetch) {
  const normalized = normalizeInputUrl(rawUrl);
  const arxivId = extractArxivId(normalized);

  if (arxivId) {
    return importArxiv(arxivId, fetchImpl);
  }

  const doi = extractDoi(normalized);
  if (doi) {
    return importDoi(doi, fetchImpl);
  }

  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ImportError("UNSUPPORTED_LINK", "只支持 http/https、DOI 或 arXiv 链接。", 422);
  }

  const response = await fetchWithTimeout(url.toString(), fetchImpl);
  const contentType = response.headers.get("content-type") || "";
  const buffer = await readBoundedBuffer(response);

  if (contentType.includes("pdf") || url.pathname.toLowerCase().endsWith(".pdf")) {
    return parsePdfBuffer(buffer, {
      sourceName: fileNameFromUrl(url) || "remote.pdf",
      sourceUrl: url.toString()
    });
  }

  const text = buffer.toString("utf8");
  return parsePaperText(stripHtml(text), {
    sourceName: fileNameFromUrl(url) || url.hostname,
    sourceUrl: url.toString()
  });
}

export class ImportError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.status = status;
  }
}

async function importArxiv(arxivId: string, fetchImpl: typeof fetch) {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  try {
    const response = await fetchWithTimeout(pdfUrl, fetchImpl);
    const buffer = await readBoundedBuffer(response);
    return parsePdfBuffer(buffer, {
      sourceName: `arXiv-${arxivId}.pdf`,
      sourceUrl: pdfUrl
    });
  } catch {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    const response = await fetchWithTimeout(apiUrl, fetchImpl);
    const xml = (await readBoundedBuffer(response)).toString("utf8");
    const title = decodeXml(readXmlTag(xml, "title") || `arXiv ${arxivId}`);
    const summary = decodeXml(readXmlTag(xml, "summary") || "");
    const authors = Array.from(xml.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g))
      .map((match) => decodeXml(match[1]))
      .filter(Boolean);

    return parsePaperText(`${title}\n${authors.join(", ")}\n\nAbstract\n${summary}`, {
      sourceName: `arXiv ${arxivId}`,
      sourceUrl: `https://arxiv.org/abs/${arxivId}`,
      authors
    });
  }
}

async function importDoi(doi: string, fetchImpl: typeof fetch) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const response = await fetchWithTimeout(url, fetchImpl, {
    headers: {
      accept: "application/json",
      "user-agent": "ai-paper-reading-coach/0.1 (mailto:local@example.invalid)"
    }
  });
  const payload = (await response.json()) as {
    message?: {
      title?: string[];
      abstract?: string;
      author?: Array<{ given?: string; family?: string }>;
      "container-title"?: string[];
    };
  };
  const message = payload.message || {};
  const title = message.title?.[0] || doi;
  const authors =
    message.author?.map((author) => [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean) || [];
  const abstract = stripHtml(message.abstract || "");
  const venue = message["container-title"]?.[0] || "";

  return parsePaperText(`${title}\n${authors.join(", ")}\n\nAbstract\n${abstract || "Crossref did not provide an abstract."}`, {
    sourceName: venue || doi,
    sourceUrl: `https://doi.org/${doi}`,
    authors
  });
}

async function fetchWithTimeout(url: string, fetchImpl: typeof fetch, init: RequestInit = {}) {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new ImportError("REMOTE_FETCH_FAILED", `远程导入失败：HTTP ${response.status}`, response.status >= 500 ? 502 : 422);
  }
  return response;
}

async function readBoundedBuffer(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_REMOTE_BYTES) {
    throw new ImportError("REMOTE_FILE_TOO_LARGE", "远程文件超过 28MB，首版请改为粘贴文本或上传较小 PDF。", 413);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_REMOTE_BYTES) {
    throw new ImportError("REMOTE_FILE_TOO_LARGE", "远程文件超过 28MB，首版请改为粘贴文本或上传较小 PDF。", 413);
  }
  return Buffer.from(arrayBuffer);
}

function normalizeInputUrl(input: string) {
  const trimmed = input.trim();
  if (/^10\.\S+\/\S+/i.test(trimmed)) return `doi:${trimmed}`;
  if (/^arxiv:\S+/i.test(trimmed)) return trimmed;
  if (/^\d{4}\.\d{4,5}(v\d+)?$/i.test(trimmed)) return `arxiv:${trimmed}`;
  return trimmed;
}

function extractArxivId(value: string) {
  const direct = value.match(/^arxiv:(\S+)$/i)?.[1];
  if (direct) return cleanArxivId(direct);

  const urlMatch = value.match(/arxiv\.org\/(?:abs|pdf)\/([^?#\s]+?)(?:\.pdf)?(?:[?#].*)?$/i)?.[1];
  return urlMatch ? cleanArxivId(urlMatch) : "";
}

function cleanArxivId(value: string) {
  return value.replace(/\.pdf$/i, "").replace(/[?#].*$/, "");
}

function extractDoi(value: string) {
  const direct = value.match(/^doi:(10\.\S+\/\S+)$/i)?.[1];
  if (direct) return direct;
  const doiUrl = value.match(/doi\.org\/(10\.\S+\/\S+)$/i)?.[1];
  return doiUrl ? decodeURIComponent(doiUrl) : "";
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readXmlTag(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim() || "";
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function fileNameFromUrl(url: URL) {
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
}
