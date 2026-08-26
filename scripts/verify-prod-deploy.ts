/** Read-only pre-TestFlight verification for the persisted Almanac API. */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

const DEFAULT_BASE = "https://pathfinder-chi-roan.vercel.app";

async function optionalMobileToken(baseUrl: string): Promise<string | null> {
  const preset = process.env.QA_SMOKE_TOKEN?.trim();
  if (preset) return preset;
  const email = process.env.QA_SMOKE_EMAIL?.trim();
  const password = process.env.QA_SMOKE_PASSWORD?.trim();
  if (!email || !password) return null;

  const response = await fetch(`${baseUrl}/api/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Mobile login failed: HTTP ${response.status}`);
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error("Mobile login returned no token");
  return body.token;
}

async function main() {
  const baseUrl = (process.env.QA_SMOKE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/u, "");
  let failed = false;
  console.log(`verify-prod: base ${baseUrl}`);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const health = (await healthResponse.json().catch(() => ({}))) as {
    ok?: boolean;
    db?: string;
  };
  if (!healthResponse.ok || !health.ok || health.db !== "up") {
    console.error(`FAIL: health HTTP ${healthResponse.status}, db=${health.db ?? "unknown"}`);
    failed = true;
  } else {
    console.log("health: OK (database up)");
  }

  const privacyResponse = await fetch(`${baseUrl}/privacy`);
  const privacyHtml = await privacyResponse.text();
  if (!privacyResponse.ok || !privacyHtml.includes("Privacy Policy")) {
    console.error(`FAIL: privacy page HTTP ${privacyResponse.status}`);
    failed = true;
  } else {
    console.log("privacy: OK");
  }

  const token = await optionalMobileToken(baseUrl);
  if (!token) {
    console.log("authenticated projection: skipped (no QA credentials supplied)");
  } else {
    const response = await fetch(`${baseUrl}/api/almanac`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as {
      atlas?: { places?: unknown[]; updates?: unknown[]; imports?: unknown[] };
    };
    const valid =
      response.ok &&
      Array.isArray(body.atlas?.places) &&
      Array.isArray(body.atlas?.updates) &&
      Array.isArray(body.atlas?.imports);
    if (!valid) {
      console.error(`FAIL: authenticated Almanac projection HTTP ${response.status}`);
      failed = true;
    } else {
      console.log(
        `almanac: OK (${body.atlas.places.length} subjects, ${body.atlas.updates.length} updates, ${body.atlas.imports.length} responses)`,
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
    console.error("verify-prod: FAILED");
  } else {
    console.log("verify-prod: PASS");
  }
}

void main().catch((error) => {
  console.error("verify-prod: FAILED", error);
  process.exitCode = 1;
});
