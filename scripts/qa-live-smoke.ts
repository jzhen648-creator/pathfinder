/**
 * Layer 4 live smoke — one real Gemini ai-sync call when GEMINI_API_KEY is set.
 * Usage: npm run qa:live-smoke
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { defaultScriptCredentials } from "./lib/script-http";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const ROOT = path.resolve(__dirname, "..", "..");
const FINDINGS_PATH = path.join(ROOT, "QA-FINDINGS.md");

type SmokeResult = {
  ok: boolean;
  status: number;
  geminiCalls?: number;
  message: string;
};

async function resolveSmokeToken(baseUrl: string): Promise<string | null> {
  const preset = process.env.QA_SMOKE_TOKEN?.trim();
  if (preset) return preset;

  const attempts: Array<{ email: string; password: string; label: string }> = [
    {
      email: process.env.E2E_EMAIL ?? process.env.QA_SMOKE_EMAIL ?? "",
      password: process.env.E2E_PASSWORD ?? process.env.QA_SMOKE_PASSWORD ?? "",
      label: "env",
    },
    {
      email: "alex@qa-seed.test",
      password: process.env.QA_SEED_PASSWORD ?? "pathfinder-qa",
      label: "alex-seed",
    },
    {
      email: defaultScriptCredentials().email,
      password: defaultScriptCredentials().password,
      label: "script-default",
    },
  ].filter((row) => row.email && row.password);

  for (const { email, password, label } of attempts) {
    const response = await fetch(`${baseUrl}/api/auth/mobile-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      console.log(`qa-live-smoke: mobile-login failed (${response.status}) for ${label}`);
      continue;
    }

    const body = (await response.json()) as { token?: string };
    const token = body.token?.trim();
    if (token) {
      console.log(`qa-live-smoke: logged in as ${email} (${label})`);
      return token;
    }
  }

  console.log("qa-live-smoke: no token — set QA_SMOKE_TOKEN or E2E_EMAIL/E2E_PASSWORD");
  return null;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const baseUrl = (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.QA_SMOKE_BASE_URL)?.replace(/\/$/, "");

  if (!apiKey) {
    console.log("qa-live-smoke: skipped — GEMINI_API_KEY not set in .env.local");
    process.exit(0);
  }

  if (!baseUrl) {
    console.log("qa-live-smoke: skipped — set VERCEL_URL or QA_SMOKE_BASE_URL");
    process.exit(0);
  }

  const token = await resolveSmokeToken(baseUrl);
  if (!token) {
    console.log("qa-live-smoke: skipped — no Bearer token (QA_SMOKE_TOKEN or valid mobile-login credentials)");
    process.exit(0);
  }

  let result: SmokeResult = { ok: false, status: 0, message: "not run" };

  try {
    const response = await fetch(`${baseUrl}/api/map/ai-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    });

    const body = (await response.json()) as {
      metrics?: { aiCallsCompleted?: number };
      ok?: boolean;
    };

    const calls = body.metrics?.aiCallsCompleted ?? 0;
    result = {
      ok: response.ok && (body.ok ?? true) && calls <= 2,
      status: response.status,
      geminiCalls: calls,
      message: response.ok ? "pass" : `HTTP ${response.status}`,
    };
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const row = `| ${new Date().toISOString().slice(0, 10)} | smoke | full | ${result.geminiCalls ?? "—"} | ${result.ok ? "pass" : "fail"} | ${result.message} |`;
  if (fs.existsSync(FINDINGS_PATH)) {
    const content = fs.readFileSync(FINDINGS_PATH, "utf8");
    const marker = "| _ex_ 2026-06-15 | seed-1 | full | 2 | pass | story+panels refreshed, within budget |";
    if (content.includes(marker)) {
      fs.writeFileSync(FINDINGS_PATH, content.replace(marker, `${row}\n${marker}`));
    }
  }

  console.log("qa-live-smoke:", result);
  process.exit(result.ok ? 0 : 1);
}

void main();
