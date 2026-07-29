import JSZip from "jszip";
import mammoth from "mammoth";
import { extname } from "node:path";
import pdfParse from "pdf-parse";
const MAX_TEXT_LENGTH = 120_000;
export async function parseSourceFile(file) {
    const extension = extname(file.originalname).toLowerCase();
    let text = "";
    switch (extension) {
        case ".txt":
        case ".md":
        case ".csv":
            text = file.buffer.toString("utf8");
            break;
        case ".docx":
            text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
            break;
        case ".pdf":
            text = (await pdfParse(file.buffer)).text;
            break;
        case ".pptx":
            text = await parsePptxText(file.buffer);
            break;
        default:
            throw new UnsupportedFileError("仅支持 PDF、DOCX、PPTX、TXT、Markdown 和 CSV 文件。");
    }
    const normalized = normalizeText(text);
    if (!normalized) {
        throw new UnsupportedFileError("没有从文件中读取到文字。扫描版 PDF 请先做 OCR 后再上传。");
    }
    const truncated = normalized.length > MAX_TEXT_LENGTH;
    const clipped = normalized.slice(0, MAX_TEXT_LENGTH);
    return {
        text: clipped,
        name: file.originalname,
        kind: extension.slice(1).toUpperCase(),
        characters: clipped.length,
        truncated
    };
}
export class UnsupportedFileError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnsupportedFileError";
    }
}
async function parsePptxText(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => slideNumber(a) - slideNumber(b));
    const pages = [];
    for (const name of slideNames) {
        const xml = await zip.file(name)?.async("string");
        if (!xml)
            continue;
        const texts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)).map((match) => decodeXml(match[1]));
        pages.push(`第 ${slideNumber(name)} 页\n${texts.join("\n")}`);
    }
    return pages.join("\n\n");
}
function slideNumber(name) {
    return Number(name.match(/slide(\d+)\.xml/i)?.[1] || 0);
}
function decodeXml(value) {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
function normalizeText(value) {
    return value
        .replace(/\u0000/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/[\t ]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
