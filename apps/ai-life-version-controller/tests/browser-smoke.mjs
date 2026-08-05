import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5207";
const outputDir = new URL("../outputs/smoke/", import.meta.url);

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await desktop.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  await desktop.getByRole("heading", { name: "AI 人生版本控制器" }).waitFor({ timeout: 5000 });
  await desktop.getByRole("button", { name: /life init && analyze/ }).click({ timeout: 5000 });
  await desktop.getByRole("button", { name: /feature\/14-day-validation/ }).waitFor({ timeout: 8000 });
  await desktop.screenshot({ path: fileURLToPath(new URL("desktop.png", outputDir)), fullPage: true });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
  await mobile.getByRole("heading", { name: "AI 人生版本控制器" }).waitFor({ timeout: 5000 });
  await mobile.screenshot({ path: fileURLToPath(new URL("mobile.png", outputDir)), fullPage: true });
  await mobile.close();
} finally {
  await browser.close();
}

console.log(`Browser smoke passed at ${baseUrl}`);
