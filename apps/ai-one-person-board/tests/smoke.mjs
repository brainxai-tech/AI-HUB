import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:5192";
const screenshotsDir = new URL("../outputs/", import.meta.url);
const viewports = [
  { name: "desktop", width: 1440, height: 920 },
  { name: "mobile", width: 390, height: 844 }
];

const browser = await chromium.launch();
try {
  await mkdir(screenshotsDir, { recursive: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.getByRole("button", { name: "召开董事会" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "召开董事会" }).click();
    await page.getByRole("heading", { name: "先验证" }).waitFor({ timeout: 10_000 });
    await page.screenshot({
      path: fileURLToPath(new URL(`smoke-${viewport.name}.png`, screenshotsDir)),
      fullPage: true
    });

    if (errors.length) {
      throw new Error(`${viewport.name} console errors:\n${errors.join("\n")}`);
    }

    await page.close();
  }
} finally {
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

process.exit(0);
