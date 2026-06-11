/**
 * Screenshots for coherence-field + node-shape visual fixes.
 * Usage:
 *   E2E_NO_SERVER=1 node scripts/capture-visual-fix-screenshots.mjs [fix1|fix2|both]
 * Requires prod server: npm run build && npm run start (PLAYWRIGHT_BASE_URL)
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3013";
const mode = process.argv[2] ?? "both";
const EMAIL = process.env.E2E_EMAIL ?? "mygoals@pathfinder.test";
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

async function loadTree(page) {
  await page.goto(`${BASE}/tree`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.evaluate(() => window.localStorage.removeItem("pathfinder-tree-mock-user-id"));
  const profileSelect = page.locator("#tree-view-dev-profile");
  if (await profileSelect.count()) {
    await profileSelect.waitFor({ timeout: 30_000 });
    const options = await profileSelect.locator("option").allTextContents();
    const matchIdx = options.findIndex((t) => t.includes("(3") || t.startsWith("3 "));
    if (matchIdx >= 0) {
      const value = await profileSelect.locator("option").nth(matchIdx).getAttribute("value");
      if (value) await profileSelect.selectOption(value);
    }
    await page.waitForTimeout(2000);
  }
  await page.locator("[data-tree-limb-depth-plane]").first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
}

async function clickOverview(page) {
  const overview = page.getByRole("button", { name: /Overview/i });
  if (await overview.count()) {
    await overview.click();
    await page.waitForTimeout(900);
  }
}

async function zoomWorkCluster(page) {
  const svg = page.locator("svg").first();
  await svg.waitFor({ timeout: 30_000 });
  const box = await svg.boundingBox();
  if (!box) throw new Error("SVG bounding box missing");
  const cx = box.x + box.width * 0.34;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -420);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "atmosphere-screenshots");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await login(page);
  await loadTree(page);

  if (mode === "fix1" || mode === "both") {
    await clickOverview(page);
    const f1 = path.join(outDir, "fix-1-coherence-field-profile-3.png");
    await page.screenshot({ path: f1, fullPage: false });
    console.log(`Wrote ${f1}`);
  }

  if (mode === "fix2" || mode === "both") {
    await clickOverview(page);
    await zoomWorkCluster(page);
    const f2 = path.join(outDir, process.env.SHOT_NAME ?? "fix-2-work-cluster-profile-3.png");
    await page.screenshot({ path: f2, fullPage: false });
    console.log(`Wrote ${f2}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
