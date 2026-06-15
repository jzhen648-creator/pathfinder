/**
 * Layer 4 live smoke — one real Gemini ai-sync call when GEMINI_API_KEY is set.
 * Usage: npm run qa:live-smoke
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const FINDINGS_PATH = path.join(ROOT, "QA-FINDINGS.md");

type SmokeResult = {
  ok: boolean;
  status: number;
  geminiCalls?: number;
  message: string;
};

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const baseUrl = (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.QA_SMOKE_BASE_URL)?.replace(/\/$/, "");

  if (!apiKey) {
    console.log("qa-live-smoke: skipped — GEMINI_API_KEY not set");
    process.exit(0);
  }

  if (!baseUrl) {
    console.log("qa-live-smoke: skipped — set VERCEL_URL or QA_SMOKE_BASE_URL");
    process.exit(0);
  }

  const token = process.env.QA_SMOKE_TOKEN?.trim();
  if (!token) {
    console.log("qa-live-smoke: skipped — QA_SMOKE_TOKEN not set (Bearer JWT for seed account)");
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
