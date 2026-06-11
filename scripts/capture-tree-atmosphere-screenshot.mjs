/**
 * One-off capture for tree atmosphere sprint screenshots.
 * Usage: E2E_NO_SERVER=1 node scripts/capture-tree-atmosphere-screenshot.mjs [profileLabel]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
const profileNeedle = process.argv[2] ?? "1";
const PROFILE_EMAILS = {
  "1": "mygoals@pathfinder.test",
};
const EMAIL = process.env.E2E_EMAIL ?? PROFILE_EMAILS[profileNeedle] ?? "mygoals@pathfinder.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";

async function login(page) {
  const csrfRes = await page.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const signInRes = await page.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: { csrfToken, email: EMAIL, password: PASSWORD, redirect: "false", json: "true" },
  });
  const body = await signInRes.json().catch(() => ({}));
  if (body.error) throw new Error(`Auth error: ${body.error}`);
}

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "atmosphere-screenshots");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await login(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/tree`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.removeItem("pathfinder-tree-mock-user-id"));

  const profileSelect = page.locator("#tree-view-dev-profile");
  await profileSelect.waitFor({ timeout: 120_000 });
  const options = await profileSelect.locator("option").allTextContents();
  const matchIdx = options.findIndex(
    (t) => t.includes(`(${profileNeedle}`) || t.startsWith(`${profileNeedle} `),
  );
  if (matchIdx >= 0) {
    const value = await profileSelect.locator("option").nth(matchIdx).getAttribute("value");
    if (value) await profileSelect.selectOption(value);
  }
  await page.waitForTimeout(2500);

  await page.locator("[data-tree-limb-depth-plane]").first().waitFor({ timeout: 60_000 });

  const overview = page.getByRole("button", { name: /Overview/i });
  if (await overview.count()) {
    await overview.click();
    await page.waitForTimeout(800);
  }

  const file = path.join(outDir, `layer-1-profile-${profileNeedle}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`Wrote ${file}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
