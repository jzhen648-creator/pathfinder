/**
 * PERF_PROBE — verify production icon path via created goal.iconName
 */
import { matchPreferredOverrideIconSlug } from "../src/lib/icons/match-pursuit-icon-override";

const BASE = "https://pathfinder-xi-rust.vercel.app";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SMOKE_EMAIL ?? "jzhen648@gmail.com",
      password: process.env.SMOKE_PASSWORD ?? "pathfinder123",
    }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("login failed");
  return body.token;
}

async function create(
  token: string,
  branchId: string,
  title: string,
): Promise<{ goalId: string; fetchMs: number }> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/goals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
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
    }),
  });
  const fetchMs = performance.now() - t0;
  const body = (await res.json()) as { goal?: { id: string } };
  if (!res.ok || !body.goal?.id) throw new Error(`create failed ${res.status}`);
  return { goalId: body.goal.id, fetchMs: Math.round(fetchMs) };
}

async function main() {
  const token = await login();
  const branchesRes = await fetch(`${BASE}/api/branches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const branches = (await branchesRes.json()) as {
    branches: Array<{ id: string }>;
    goals: Array<{ id: string; branchId: string | null; iconName?: string | null }>;
  };
  const branchId = branches.branches[0]?.id;
  if (!branchId) throw new Error("no branch");

  for (const title of ["Zorbify the quincunx matrix", "Gym strength training"]) {
    const preflight = matchPreferredOverrideIconSlug(title, "");
    const { goalId, fetchMs } = await create(token, branchId, title);
    const verifyRes = await fetch(`${BASE}/api/branches`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const verify = (await verifyRes.json()) as typeof branches;
    const goal = verify.goals.find((g) => g.id === goalId);
    console.log(
      "[PERF_PROBE] prod-icon-verify",
      JSON.stringify({
        apiHost: "pathfinder-xi-rust.vercel.app",
        title,
        preflightOverride: preflight,
        fetchMs,
        iconName: goal?.iconName ?? null,
      }),
    );
    await fetch(`${BASE}/api/goals/${goalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

main().catch(console.error);
