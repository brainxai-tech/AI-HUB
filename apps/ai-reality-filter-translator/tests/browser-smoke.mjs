import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = "outputs/codex-smoke-check";
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5186";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const issues = [];

page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    issues.push(`${msg.type()}: ${msg.text()}`);
  }
});
page.on("pageerror", (error) => {
  issues.push(`pageerror: ${error.message}`);
});

page.setDefaultTimeout(10_000);
await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

const h1 = await page.locator("h1").textContent();
if (!h1?.includes("现实滤镜")) {
  throw new Error("Missing app title");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620">
  <rect width="900" height="620" fill="#f3efe2"/>
  <rect x="85" y="130" width="730" height="360" rx="18" fill="#24352e"/>
  <rect x="125" y="180" width="230" height="230" rx="12" fill="#f9fbf4"/>
  <rect x="400" y="195" width="330" height="54" fill="#ffffff"/>
  <rect x="400" y="276" width="330" height="36" fill="#1f7a68"/>
  <circle cx="710" cy="390" r="44" fill="#d7c777"/>
  <text x="126" y="96" font-family="Arial, sans-serif" font-size="38" fill="#202724">corner store</text>
</svg>`;

await page.setInputFiles("input[type=file]", {
  name: "corner-store.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(svg)
});
await page.fill("textarea", "夜晚便利店门口，有玻璃门、白色灯牌和几辆电动车");
await page.fill('input[placeholder^="例：红色"]', "白色灯牌、玻璃门");
await page.click('button:has-text("Hub 当前选择的 GPT 型号")');
await page.waitForSelector("text=故事说明");

const promptHeading = await page.locator("text=画面 prompt").textContent();
if (!promptHeading) {
  throw new Error("Missing prompt section");
}

await page.screenshot({ path: `${out}/desktop-smoke.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${out}/mobile-smoke.png`, fullPage: true });
await browser.close();

if (issues.length) {
  throw new Error(issues.join("\n"));
}

console.log(
  JSON.stringify({
    ok: true,
    title: h1,
    screenshots: [`${out}/desktop-smoke.png`, `${out}/mobile-smoke.png`]
  })
);
