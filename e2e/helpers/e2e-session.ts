import type { Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
export const HAS_E2E_CREDS = Boolean(E2E_EMAIL && E2E_PASSWORD);

/** Session login via NextAuth API (avoids pre-hydration form GET on /login). */
export async function loginForE2e(page: Page): Promise<"ok" | "onboarding" | "auth_failed"> {
  const csrfRes = await page.request.get("/api/auth/csrf");
  if (!csrfRes.ok()) return "auth_failed";

  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) return "auth_failed";

  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });

  const signInBody = (await signInRes.json().catch(() => ({}))) as { error?: string };
  if (signInBody.error) return "auth_failed";

  const sessionRes = await page.request.get("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  if (!session.user?.email) return "auth_failed";

  await page.goto("/dashboard", { waitUntil: "commit" });

  if (page.url().includes("/onboarding")) return "onboarding";
  if (page.url().includes("/login")) return "auth_failed";
  return "ok";
}

/** Ensures at least one root hub exists; returns its id. */
export async function ensureRootBranchId(page: Page): Promise<string> {
  const branchId = await page.evaluate(async () => {
    const res = await fetch("/api/branches");
    if (!res.ok) throw new Error(`GET /api/branches failed: ${res.status}`);
    const data = (await res.json()) as { branches?: { id: string; parentBranchId?: string | null }[] };
    const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
    if (roots.length > 0) return roots[0]!.id;

    const created = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limbId: "work", mapAngleOffset: 0 }),
    });
    if (!created.ok) throw new Error(`POST /api/branches failed: ${created.status}`);
    const row = (await created.json()) as { branch?: { id: string } };
    return row.branch?.id ?? "";
  });

  if (!branchId) throw new Error("Could not resolve a root branch id");
  return branchId;
}
