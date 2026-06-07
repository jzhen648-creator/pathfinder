/**
 * PERF_PROBE — quick-add pursuit create profiling (4 runs).
 * Requires local dev: PERF_PROBE=1 npm run dev (port 3001)
 *
 * Run: npx tsx scripts/perf-probe-quick-add.ts
 * Optional: PERF_PROBE_BASE_URL=https://pathfinder-xi-rust.vercel.app (prod fetch only, no stage headers)
 */
import { matchPreferredOverrideIconSlug } from "../src/lib/icons/match-pursuit-icon-override";

const RUNS: { label: string; title: string; expectIconPath: "ai" | "override" }[] = [
  { label: "ai-1", title: "Zorbify the quincunx matrix", expectIconPath: "ai" },
  { label: "ai-2", title: "Glorkenheim spanner protocol", expectIconPath: "ai" },
  { label: "ai-3", title: "Wibblecraft undermoon ledger", expectIconPath: "ai" },
  { label: "override-4", title: "Gym strength training", expectIconPath: "override" },
];

type BranchesResponse = {
  branches: Array<{ id: string; limbId: string; isActive?: boolean }>;
  goals: Array<{ id: string; branchId: string | null }>;
};

type CreateGoalPayload = {
  title: string;
  description: string;
  branchId: string;
  goalType: "project";
  deadline: string;
  significance: number;
  hasMeasurableTarget: boolean;
  targetAmount: string;
  currentAmount: string;
  unit: string;
  generateRoadmap: boolean;
};

function getBaseUrl(): string {
  return (
    process.env.PERF_PROBE_BASE_URL ??
    process.env.SMOKE_BASE_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

async function loginMobile(base: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !body.token) {
    throw new Error(`mobile-login failed (${res.status}): ${body.error ?? "no token"}`);
  }
  return body.token;
}

function pickBranchId(data: BranchesResponse): string {
  const branchWithGoal = data.branches.find((branch) =>
    data.goals.some((goal) => goal.branchId === branch.id),
  );
  return branchWithGoal?.id ?? data.branches[0]?.id ?? "";
}

async function main() {
  const base = getBaseUrl();
  const apiHost = new URL(base).host;
  const email = process.env.SMOKE_EMAIL ?? "fulltree@pathfinder.test";
  const password = process.env.SMOKE_PASSWORD ?? "password123";

  console.log(`\n[PERF_PROBE] ===== apiHost=${apiHost} =====\n`);

  for (const run of RUNS) {
    const overrideCheck = matchPreferredOverrideIconSlug(run.title, "");
    const pathGuess = overrideCheck ? "override" : "ai";
    if (pathGuess !== run.expectIconPath) {
      console.warn(
        `[PERF_PROBE] WARN ${run.label}: title "${run.title}" preflight path=${pathGuess}, expected ${run.expectIconPath}`,
      );
    }
  }

  const token = await loginMobile(base, email, password);
  const branchesRes = await fetch(`${base}/api/branches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!branchesRes.ok) {
    throw new Error(`GET /api/branches failed: ${branchesRes.status}`);
  }
  const branches = (await branchesRes.json()) as BranchesResponse;
  const branchId = pickBranchId(branches);
  if (!branchId) throw new Error("No branchId available for probe creates");

  type Row = Record<string, unknown>;
  const rows: Row[] = [];

  for (const run of RUNS) {
    const traceId = `${run.label}-${Date.now().toString(36)}`;
    const payload: CreateGoalPayload = {
      title: run.title,
      description: "",
      branchId,
      goalType: "project",
      deadline: "",
      significance: 3,
      hasMeasurableTarget: false,
      targetAmount: "",
      currentAmount: "",
      unit: "",
      generateRoadmap: false,
    };

    const fetchStart = performance.now();
    const res = await fetch(`${base}/api/goals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Perf-Trace": traceId,
      },
      body: JSON.stringify(payload),
    });
    const fetchMs = performance.now() - fetchStart;
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    const serverMsHeader = res.headers.get("X-Perf-Server-Ms");
    const iconPathHeader = res.headers.get("X-Perf-Icon-Path");
    const stagesHeader = res.headers.get("X-Perf-Stages");
    const vercelRegionHeader = res.headers.get("X-Perf-Region");
    let stages: Record<string, number> | null = null;
    if (stagesHeader) {
      try {
        stages = JSON.parse(stagesHeader) as Record<string, number>;
      } catch {
        stages = null;
      }
    }
    const serverMs = serverMsHeader ? Number(serverMsHeader) : null;
    const networkEstimateMs =
      serverMs != null && Number.isFinite(serverMs)
        ? Math.max(0, Math.round(fetchMs - serverMs))
        : null;

    const row: Row = {
      run: run.label,
      title: run.title,
      apiHost,
      status: res.status,
      fetchMs: Math.round(fetchMs),
      serverMs,
      networkEstimateMs,
      iconPath: iconPathHeader ?? pathGuess(run.title),
      vercelRegion: vercelRegionHeader,
      icon_ai: stages?.icon_ai ?? null,
      icon_override: stages?.icon_override ?? null,
      icon_assign_total: stages?.icon_assign_total ?? null,
      sequence_load: stages?.sequence_load ?? null,
      db_transaction: stages?.db_transaction ?? null,
      bloom_recompute: stages?.bloom_recompute ?? null,
      goalId:
        typeof body === "object" &&
        body !== null &&
        "goal" in body &&
        typeof (body as { goal?: { id?: string } }).goal?.id === "string"
          ? (body as { goal: { id: string } }).goal.id
          : null,
      error:
        typeof body === "object" && body !== null && "error" in body
          ? (body as { error: string }).error
          : null,
    };
    rows.push(row);
    console.log("[PERF_PROBE] run", JSON.stringify(row));

    if (res.ok && typeof row.goalId === "string") {
      await fetch(`${base}/api/goals/${encodeURIComponent(row.goalId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n[PERF_PROBE] ===== SUMMARY =====");
  console.log(JSON.stringify({ apiHost, rows }, null, 2));
}

function pathGuess(title: string): string {
  return matchPreferredOverrideIconSlug(title, "") ? "override" : "ai";
}

main().catch((err) => {
  console.error("[PERF_PROBE] fatal", err);
  process.exitCode = 1;
});
