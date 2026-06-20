/**
 * Pre-TestFlight production verification — public probes + optional reflect smoke.
 *
 * Run:
 *   npm run verify:prod
 *   QA_SMOKE_EMAIL=... QA_SMOKE_PASSWORD=... npm run verify:prod -- --reflect
 *
 * Requires deploy with public /api/health and /privacy (middleware).
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { defaultScriptCredentials } from "./lib/script-http";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_BASE = "https://pathfinder-xi-rust.vercel.app";

type HealthBody = {
  ok?: boolean;
  db?: string;
  ai?: string;
  reflect?: boolean;
  deliveryBypass?: boolean;
};

type AiSyncBody = {
  ok?: boolean;
  skipped?: boolean;
  metrics?: {
    aiCallsCompleted?: number;
    reflectCall?: boolean;
    pendingInsightCount?: number;
  };
};

async function resolveSmokeToken(baseUrl: string): Promise<string | null> {
  const preset = process.env.QA_SMOKE_TOKEN?.trim();
  if (preset) return preset;

  const attempts: Array<{ email: string; password: string; label: string }> = [
    {
      email: process.env.QA_SMOKE_EMAIL ?? "",
      password: process.env.QA_SMOKE_PASSWORD ?? "",
      label: "qa-smoke-env",
    },
    {
      email: process.env.E2E_EMAIL ?? "",
      password: process.env.E2E_PASSWORD ?? "",
      label: "e2e-env",
    },
    {
      email: "jzhen648+pathfinder@gmail.com",
      password: process.env.QA_SMOKE_PASSWORD ?? "",
      label: "qa-account",
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
      console.log(`verify-prod: login failed (${response.status}) for ${label}`);
      continue;
    }
    const body = (await response.json()) as { token?: string };
    const token = body.token?.trim();
    if (token) {
      console.log(`verify-prod: logged in as ${email} (${label})`);
      return token;
    }
  }

  return null;
}

async function main() {
  const baseUrl = (process.env.QA_SMOKE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  const runReflect = process.argv.includes("--reflect");
  let failed = false;

  console.log(`verify-prod: base ${baseUrl}`);

  const healthRes = await fetch(`${baseUrl}/api/health`);
  if (!healthRes.ok) {
    console.error(`FAIL: GET /api/health → HTTP ${healthRes.status}`);
    failed = true;
  } else {
    const health = (await healthRes.json()) as HealthBody;
    console.log("health:", health);
    if (!health.ok || health.db !== "up") failed = true;
    if (health.ai !== "configured") {
      console.error("FAIL: GEMINI_API_KEY not configured on production");
      failed = true;
    }
    if (health.reflect !== true) {
      console.error("FAIL: USE_REFLECT_CALL is not true on production");
      failed = true;
    }
    if (health.deliveryBypass !== true) {
      console.warn("WARN: AI_READING_DELIVERY_BYPASS is not true (QA taps may hit 2h gate)");
    }
  }

  const privacyRes = await fetch(`${baseUrl}/privacy`);
  if (!privacyRes.ok) {
    console.error(`FAIL: GET /privacy → HTTP ${privacyRes.status}`);
    failed = true;
  } else {
    const privacyHtml = await privacyRes.text();
    if (!privacyHtml.includes("Privacy Policy")) {
      console.error("FAIL: /privacy body missing expected title");
      failed = true;
    } else {
      console.log("privacy: OK");
    }
  }

  if (runReflect) {
    const token = await resolveSmokeToken(baseUrl);
    if (!token) {
      console.error("FAIL: --reflect requires QA_SMOKE_EMAIL/PASSWORD or QA_SMOKE_TOKEN");
      failed = true;
    } else {
      const syncRes = await fetch(`${baseUrl}/api/map/ai-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ force: true }),
      });
      const syncBody = (await syncRes.json()) as AiSyncBody;
      const calls = syncBody.metrics?.aiCallsCompleted ?? 0;
      const reflect = syncBody.metrics?.reflectCall === true;
      const pending = syncBody.metrics?.pendingInsightCount ?? 0;

      console.log("ai-sync:", { status: syncRes.status, calls, reflect, pending, skipped: syncBody.skipped });

      if (!syncRes.ok) {
        console.error(`FAIL: ai-sync HTTP ${syncRes.status}`);
        failed = true;
      } else if (!reflect) {
        console.error("FAIL: metrics.reflectCall is not true — legacy path may be active");
        failed = true;
      } else if (calls < 1 || calls > 4) {
        console.error(`FAIL: expected 1–4 Gemini calls, got ${calls}`);
        failed = true;
      } else {
        console.log(`PASS: reflect sync (${calls} call${calls === 1 ? "" : "s"}, ${pending} panels pending)`);
      }
    }
  } else {
    console.log("verify-prod: skip ai-sync (pass --reflect to run one live sync)");
  }

  if (failed) {
    process.exitCode = 1;
    console.error("\nverify-prod: FAILED — fix items above, redeploy if middleware/health changed");
  } else {
    console.log("\nverify-prod: PASS (public probes)");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
