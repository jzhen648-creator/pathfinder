import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "tmp-screenshots");
const outPath = path.join(outDir, "stream-panel-part1.png");

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";
const email = process.env.E2E_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? "";

async function login(page) {
  const csrfRes = await page.request.get(`${baseURL}/api/auth/csrf`);
  if (!csrfRes.ok()) throw new Error("csrf failed");
  const { csrfToken } = await csrfRes.json();
  const signInRes = await page.request.post(`${baseURL}/api/auth/callback/credentials`, {
    form: { csrfToken, email, password, redirect: "false", json: "true" },
  });
  const body = await signInRes.json().catch(() => ({}));
  if (body.error) throw new Error(`login: ${body.error}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

try {
  if (email && password) {
    await login(page);
  }
  await page.goto(`${baseURL}/dev/stream-panel-layout`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  await page.waitForSelector(".pf-stream-shell", { timeout: 30_000 });
  await page.waitForTimeout(600);

  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Wrote ${outPath}`);
} finally {
  await browser.close();
}
