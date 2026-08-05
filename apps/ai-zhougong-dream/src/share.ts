import type { DreamHistoryEntry } from "../shared/types";

const cardWidth = 1080;
const cardHeight = 1440;

export function downloadShareCard(entry: DreamHistoryEntry) {
  const canvas = document.createElement("canvas");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = cardWidth * ratio;
  canvas.height = cardHeight * ratio;
  canvas.style.width = `${cardWidth}px`;
  canvas.style.height = `${cardHeight}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持分享图生成。");
  }

  context.scale(ratio, ratio);
  drawShareCard(context, entry);

  const link = document.createElement("a");
  link.download = `dream-${entry.id.slice(0, 8)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function wrapTextLines(
  context: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number
) {
  const lines: string[] = [];
  let current = "";

  for (const character of text) {
    const next = current + character;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawShareCard(context: CanvasRenderingContext2D, entry: DreamHistoryEntry) {
  context.fillStyle = "#f7f8f4";
  context.fillRect(0, 0, cardWidth, cardHeight);

  context.fillStyle = "#1f2623";
  context.fillRect(0, 0, cardWidth, 18);
  context.fillStyle = "#b83b2d";
  context.fillRect(0, 18, cardWidth, 8);

  context.fillStyle = "#1f2623";
  context.font = "700 56px system-ui, sans-serif";
  context.fillText("AI 周公解梦", 72, 116);

  context.fillStyle = "#526059";
  context.font = "28px system-ui, sans-serif";
  context.fillText(new Date(entry.createdAt).toLocaleString("zh-CN"), 72, 162);

  let y = 245;
  y = drawBlock(context, "梦境摘要", entry.result.summary, 72, y, 936, 38, 8);
  y = drawBlock(context, "传统意象", entry.result.traditionalReading, 72, y + 22, 936, 32, 7);
  y = drawBlock(context, "心理视角", entry.result.psychologicalReading, 72, y + 22, 936, 32, 7);
  y = drawBlock(context, "今日建议", entry.result.advice, 72, y + 22, 936, 32, 5);

  context.fillStyle = "#1f6f5b";
  context.font = "700 30px system-ui, sans-serif";
  context.fillText("幸运关键词", 72, 1210);

  context.fillStyle = "#1f2623";
  context.font = "32px system-ui, sans-serif";
  context.fillText(entry.result.luckyKeywords.join("  /  "), 72, 1262);

  context.fillStyle = "#6b746f";
  context.font = "24px system-ui, sans-serif";
  context.fillText("仅供娱乐和自我反思", 72, 1364);
}

function drawBlock(
  context: CanvasRenderingContext2D,
  title: string,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  context.fillStyle = "#b83b2d";
  context.font = "700 30px system-ui, sans-serif";
  context.fillText(title, x, y);

  context.fillStyle = "#1f2623";
  context.font = `${Math.max(24, lineHeight - 4)}px system-ui, sans-serif`;

  const lines = wrapTextLines(context, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + 52 + index * lineHeight);
  });

  return y + 52 + lines.length * lineHeight;
}
