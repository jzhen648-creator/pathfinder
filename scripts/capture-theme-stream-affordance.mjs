import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "tmp-screenshots");
const outPath = path.join(outDir, "theme-stream-affordance.png");

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${baseURL}/dev/theme-stream-affordance`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.waitForSelector("[data-tree-theme-stream-row]", { timeout: 30_000 });
  await page.waitForSelector(".pf-theme-stream-cta", { timeout: 30_000 });
  await page.getByRole("button", { name: "Overview" }).click().catch(() => {});
  await page.waitForTimeout(800);
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Wrote ${outPath}`);
} finally {
  await browser.close();
}
