/**
 * Sequential smoke test of major authenticated API routes.
 * Requires dev server: npm run dev
 * Run: npm run smoke-test
 */
import { z } from "zod";
import {
  apiFetch,
  apiFetchFollowRedirects,
  defaultScriptCredentials,
  getApiBaseUrl,
  loginWithCredentials,
  type ScriptSession,
} from "./lib/script-http";

type CheckResult = { name: string; ok: boolean; detail?: string };

const branchesSchema = z.object({
  branches: z.array(z.object({ id: z.string(), limbId: z.string() })),
  goals: z.array(z.object({ id: z.string(), title: z.string() })),
  archivedGoals: z.array(z.unknown()).optional(),
});

const marksSchema = z.object({
  user: z.object({ email: z.string() }),
  marks: z.array(z.object({ id: z.string(), branchId: z.string() })),
});

const streamExtractSchema = z.object({
  marks: z.array(z.unknown()),
  pursuits: z.array(z.unknown()),
  milestones: z.array(z.unknown()),
  ambiguous: z.array(z.unknown()),
  clarifyingQuestion: z.union([z.string(), z.null()]).optional(),
});

async function check(
  name: string,
  run: () => Promise<{ status: number; body: unknown }>,
  validate: (body: unknown) => string | null,
): Promise<CheckResult> {
  try {
    const { status, body } = await run();
    if (status !== 200) {
      const err =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : "";
      return { name, ok: false, detail: `HTTP ${status}${err ? `: ${err}` : ""}` };
    }
    const validationError = validate(body);
    if (validationError) return { name, ok: false, detail: validationError };
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function readJson(res: Response): Promise<{ status: number; body: unknown }> {
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runChecks(session: ScriptSession): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    await check(
      "GET /api/auth/session",
      async () => readJson(await apiFetch(session, "/api/auth/session")),
      (body) => {
        const s = body as { user?: { email?: string } };
        return s.user?.email ? null : "missing session.user.email";
      },
    ),
  );

  results.push(
    await check(
      "GET /api/branches",
      async () => readJson(await apiFetch(session, "/api/branches")),
      (body) => {
        const parsed = branchesSchema.safeParse(body);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? "invalid shape";
      },
    ),
  );

  results.push(
    await check(
      "GET /api/marks",
      async () => readJson(await apiFetch(session, "/api/marks")),
      (body) => {
        const parsed = marksSchema.safeParse(body);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? "invalid shape";
      },
    ),
  );

  results.push(
    await check(
      "GET /api/goals (→ marks)",
      async () => readJson(await apiFetchFollowRedirects(session, "/api/goals")),
      (body) => {
        const parsed = marksSchema.safeParse(body);
        return parsed.success ? null : "expected marks payload after redirect";
      },
    ),
  );

  const activateRes = await apiFetch(session, "/api/branches/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  results.push({
    name: "POST /api/branches/activate (validation)",
    ok: activateRes.status === 400,
    detail: activateRes.status === 400 ? undefined : `expected 400, got ${activateRes.status}`,
  });

  const streamRes = await apiFetch(session, "/api/stream/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      themeId: "work",
      input: "Closed Q1 planning and scheduled a stakeholder workshop.",
      inputMode: "text",
    }),
  });
  const streamBody = await streamRes.json().catch(() => ({}));
  if (
    streamRes.status === 503 &&
    String((streamBody as { error?: string }).error ?? "").includes("GEMINI_API_KEY")
  ) {
    results.push({
      name: "POST /api/stream/extract",
      ok: true,
      detail: "skipped - GEMINI_API_KEY not configured",
    });
  } else if (streamRes.status !== 200) {
    results.push({
      name: "POST /api/stream/extract",
      ok: false,
      detail: `HTTP ${streamRes.status}: ${String((streamBody as { error?: string }).error ?? "")}`,
    });
  } else {
    const parsed = streamExtractSchema.safeParse(streamBody);
    results.push({
      name: "POST /api/stream/extract",
      ok: parsed.success,
      detail: parsed.success ? undefined : parsed.error.issues[0]?.message ?? "invalid shape",
    });
  }

  const evalRes = await apiFetch(session, "/api/goals/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  results.push({
    name: "POST /api/goals/evaluate (disabled)",
    ok: evalRes.status === 410,
    detail: evalRes.status === 410 ? undefined : `expected 410, got ${evalRes.status}`,
  });

  return results;
}

async function main() {
  const base = getApiBaseUrl();
  const { email, password } = defaultScriptCredentials();

  console.log(`Smoke test — ${base}`);
  console.log(`Credentials: ${email}\n`);

  let session;
  try {
    session = await loginWithCredentials(email, password);
  } catch (e) {
    console.error("Login failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  const results = await runChecks(session);

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.ok ? "PASS" : "FAIL";
    console.log(`${icon}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.ok) passed += 1;
    else failed += 1;
  }

  console.log(`\n${passed} passed, ${failed} failed (${results.length} checks)`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
