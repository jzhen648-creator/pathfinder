/**
 * Takes a full page screenshot of the life map
 * Saves to /screenshots with timestamp
 * Run: npm run snapshot
 * Requires: npx playwright install chromium
 */

import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

async function takeSnapshot() {
  const dir = path.join(process.cwd(), "screenshots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3001/tree");
  await page.waitForTimeout(2000);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `tree-${timestamp}.png`;
  const filepath = path.join(dir, filename);

  await page.screenshot({ path: filepath, fullPage: true });
  await browser.close();

  console.log(`Snapshot saved: ${filename}`);
}

takeSnapshot().catch(console.error);

