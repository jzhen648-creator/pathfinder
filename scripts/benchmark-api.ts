/**
 * Benchmark key API routes (10 iterations each).
 * Requires dev server: npm run dev
 * Run: npm run benchmark:api
 */
import {
  apiFetch,
  defaultScriptCredentials,
  getApiBaseUrl,
  loginWithCredentials,
} from "./lib/script-http";

const ITERATIONS = 10;
const SLOW_MS = 500;

const STREAM_SAMPLE = {
  themeId: "work",
  input: "Had a solid sprint review and booked a coaching session for stakeholder communication.",
  inputMode: "text" as const,
};

type Timings = number[];

function stats(ms: Timings) {
  const sorted = [...ms].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length ? sum / sorted.length : 0,
  };
}

async function timeFetch(
  label: string,
  run: () => Promise<Response>,
): Promise<{ label: string; ms: Timings; errors: string[] }> {
  const ms: Timings = [];
  const errors: string[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    try {
      const res = await run();
      const elapsed = performance.now() - t0;
      ms.push(elapsed);
      if (!res.ok) {
        errors.push(`iter ${i + 1}: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`iter ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { label, ms, errors };
}

function printResult(result: { label: string; ms: Timings; errors: string[] }) {
  const { min, max, mean } = stats(result.ms);
  const slow = result.ms.filter((t) => t > SLOW_MS).length;
  const flag = max > SLOW_MS ? " ⚠ SLOW" : "";
  console.log(
    `${result.label.padEnd(28)} min=${min.toFixed(0)}ms  mean=${mean.toFixed(0)}ms  max=${max.toFixed(0)}ms  slow(>${SLOW_MS}ms)=${slow}/${ITERATIONS}${flag}`,
  );
  if (result.errors.length > 0) {
    console.log(`  errors: ${result.errors.slice(0, 3).join("; ")}${result.errors.length > 3 ? "…" : ""}`);
  }
}

async function main() {
  const base = getApiBaseUrl();
  const { email, password } = defaultScriptCredentials();

  console.log(`API benchmark — ${base}`);
  console.log(`Credentials: ${email} (${ITERATIONS} iterations per route)\n`);

  let session;
  try {
    session = await loginWithCredentials(email, password);
  } catch (e) {
    console.error("Login failed:", e instanceof Error ? e.message : e);
    console.error("Start the dev server (npm run dev) and ensure the account exists (npm run seed:tree).");
    process.exitCode = 1;
    return;
  }

  console.log(`Session as: ${session.email}\n`);

  const results = await Promise.all([
    timeFetch("GET /api/branches", () => apiFetch(session, "/api/branches")),
    timeFetch("GET /api/marks", () => apiFetch(session, "/api/marks")),
    timeFetch("POST /api/stream/extract", () =>
      apiFetch(session, "/api/stream/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(STREAM_SAMPLE),
      }),
    ),
  ]);

  for (const r of results) {
    printResult(r);
  }

  const anySlow = results.some((r) => stats(r.ms).max > SLOW_MS);
  const anyErrors = results.some((r) => r.errors.length > 0);
  if (anySlow) {
    console.log(`\nNote: routes over ${SLOW_MS}ms are flagged (stream/extract often exceeds this when calling Gemini).`);
  }
  if (anyErrors) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
