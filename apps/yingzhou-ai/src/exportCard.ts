export interface PoemCardOptions {
  title: string;
  lines: string[];
  theme: string;
  author: string;
  place?: string;
}

export function sanitizeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*：／？＊｜＜＞\u0000-\u001f]/gu, "").replace(/\s+/gu, "").slice(0, 36) || "无题";
}

export function cardFilename(title: string, date = new Date()) {
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return `吟舟AI-${sanitizeFilename(title)}-${day}.png`;
}

export async function exportPoemCard(options: PoemCardOptions) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1440;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法创建诗笺画布。");

  drawBackground(context, canvas.width, canvas.height);
  drawMountains(context);
  drawFrame(context);

  context.fillStyle = "#17201d";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '38px STSong, SimSun, "Noto Serif SC", serif';
  drawVerticalText(context, options.title, 900, 210, 49);

  const lineX = [745, 600, 455, 310];
  context.font = '58px STSong, SimSun, "Noto Serif SC", serif';
  options.lines.slice(0, 4).forEach((line, index) => drawVerticalText(context, line, lineX[index], 300, 92));

  context.fillStyle = "#69716c";
  context.textAlign = "left";
  context.font = '25px "Microsoft YaHei", sans-serif';
  context.fillText(`诗引｜${truncate(options.theme, 30)}`, 116, 1134);
  context.fillText(`落款｜${truncate(options.author || "无名", 12)}`, 116, 1180);
  if (options.place?.trim()) context.fillText(`此地｜${truncate(options.place, 14)}`, 116, 1226);

  drawSeal(context, 820, 1125);
  context.fillStyle = "#69716c";
  context.font = '21px "Microsoft YaHei", sans-serif';
  context.fillText(`吟舟 AI · 人机共创内容 · ${new Date().toLocaleDateString("zh-CN")}`, 116, 1335);
  context.textAlign = "right";
  context.fillText("请核对、修改后使用", 964, 1335);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("诗笺生成失败，请稍后重试。")), "image/png", 0.96);
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = cardFilename(options.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f7f5ee");
  gradient.addColorStop(0.55, "#f0eee5");
  gradient.addColorStop(1, "#e8e3d7");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(23,32,29,.035)";
  for (let y = 34; y < height; y += 18) {
    for (let x = (y % 36) + 18; x < width; x += 36) context.fillRect(x, y, 1.2, 1.2);
  }
}

function drawMountains(context: CanvasRenderingContext2D) {
  context.save();
  context.globalAlpha = 0.11;
  context.fillStyle = "#55736a";
  context.beginPath();
  context.moveTo(0, 800);
  context.bezierCurveTo(170, 650, 245, 760, 395, 610);
  context.bezierCurveTo(520, 490, 635, 720, 780, 560);
  context.bezierCurveTo(900, 430, 1000, 530, 1080, 430);
  context.lineTo(1080, 980);
  context.lineTo(0, 980);
  context.closePath();
  context.fill();
  context.globalAlpha = 0.075;
  context.translate(0, 120);
  context.fill();
  context.restore();
}

function drawFrame(context: CanvasRenderingContext2D) {
  context.strokeStyle = "rgba(23,32,29,.32)";
  context.lineWidth = 2;
  context.strokeRect(68, 68, 944, 1304);
  context.strokeStyle = "rgba(180,71,46,.35)";
  context.strokeRect(82, 82, 916, 1276);
}

function drawSeal(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.rotate(-0.06);
  context.strokeStyle = "#b4472e";
  context.lineWidth = 5;
  context.strokeRect(0, 0, 130, 130);
  context.fillStyle = "#b4472e";
  context.font = '34px STSong, SimSun, serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("AI", 65, 43);
  context.fillText("共创", 65, 91);
  context.restore();
}

function drawVerticalText(context: CanvasRenderingContext2D, value: string, x: number, y: number, gap: number) {
  Array.from(value).forEach((character, index) => context.fillText(character, x, y + index * gap));
}

function truncate(value: string, limit: number) {
  const characters = Array.from(value.trim());
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : characters.join("");
}
