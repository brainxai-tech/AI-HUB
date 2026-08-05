import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:5247";
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(8000);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "AI 冷启动品牌实验室" }).waitFor();
    await page.getByRole("button", { name: /生成品牌包/ }).click();
    await page.getByRole("heading", { name: "品牌名", exact: true }).waitFor();
    await page.screenshot({ path: `outputs/smoke-${viewport.width}.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
