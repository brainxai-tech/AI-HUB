import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.BROWSER_SMOKE_URL || "http://127.0.0.1:5216";
const outputDirectory = new URL("../outputs/smoke/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /把题目贴进来/ }).waitFor();
  await page.getByRole("button", { name: "使用示例题" }).click();
  await page.getByRole("button", { name: /先帮我审题/ }).click();
  await page.getByRole("heading", { name: /把这篇作文变成你的/ }).waitFor();
  await page.locator('[data-material="experience"]').fill("放学后值日时，我重新认真擦干净一张旧课桌。");
  await page.locator('[data-material="detail"]').fill("粉笔印和水滴敲在水池边的声音");
  await page.locator('[data-material="insight"]').fill("成长是在没人提醒时也把小事做好。");
  await page.getByRole("button", { name: /生成三份提纲/ }).click();
  await page.locator(".outline-card").first().waitFor();
  if (await page.locator(".outline-card").count() !== 3) throw new Error("Expected three outline cards.");
  await page.locator(".outline-card").nth(1).click();
  await page.getByRole("button", { name: /按这份提纲写初稿/ }).click();
  await page.getByRole("heading", { name: /先核对真实/ }).waitFor();
  const draftCount = Number(await page.locator(".count-chip b").textContent());
  if (draftCount < 760 || draftCount > 840) throw new Error(`Draft length out of range: ${draftCount}`);
  await page.waitForTimeout(550);
  await page.screenshot({ path: fileURLToPath(new URL("desktop-draft.png", outputDirectory)), fullPage: true });
  await page.getByRole("button", { name: /查看老师讲评/ }).click();
  await page.getByRole("heading", { name: /下一步只改一件事/ }).waitFor();
  await page.getByText("最先改这里").waitFor();
  await page.waitForTimeout(550);
  await page.screenshot({ path: fileURLToPath(new URL("desktop-feedback.png", outputDirectory)), fullPage: true });
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: "使用示例题" }).click();
  await mobilePage.getByRole("button", { name: /先帮我审题/ }).click();
  await mobilePage.getByRole("heading", { name: /把这篇作文变成你的/ }).waitFor();
  await mobilePage.waitForTimeout(550);
  await mobilePage.screenshot({ path: fileURLToPath(new URL("mobile-material.png", outputDirectory)), fullPage: true });
  await mobile.close();

  console.log(JSON.stringify({ ok: true, baseUrl, draftCount, screenshots: ["desktop-draft.png", "desktop-feedback.png", "mobile-material.png"] }));
} finally {
  await browser.close();
}
