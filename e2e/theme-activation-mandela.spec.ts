import { expect, test, type Page } from "@playwright/test";

const MANDELA_EMAIL = "nelson.mandela@pathfinder.test";
const MANDELA_PASSWORD = "password123";

async function loginMandela(page: Page): Promise<void> {
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  expect(csrfToken).toBeTruthy();

  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrfToken!,
      email: MANDELA_EMAIL,
      password: MANDELA_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  const signInBody = (await signInRes.json().catch(() => ({}))) as { error?: string };
  expect(signInBody.error).toBeUndefined();

  const sessionRes = await page.request.get("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  expect(session.user?.email).toBe(MANDELA_EMAIL);
}

test.describe("Two-step theme activation (Mandela QA)", () => {
  test.setTimeout(120_000);

  test("unlock Money theme then open hubs individually", async ({ page }) => {
    await loginMandela(page);

    await page.goto("/tree", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Growing your tree...")).toBeHidden({ timeout: 60_000 });

    const apiBefore = await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      const data = (await res.json()) as {
        unlockedLimbIds?: string[];
        branches?: { limbId: string; label?: string | null; isActive?: boolean | null; parentBranchId?: string | null }[];
      };
      const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
      return {
        unlocked: data.unlockedLimbIds ?? [],
        financeActive: roots.filter((b) => b.limbId === "finance" && b.isActive === true).map((b) => b.label),
        healthActive: roots.filter((b) => b.limbId === "health" && b.isActive === true).map((b) => b.label),
        financeInactive: roots
          .filter((b) => b.limbId === "finance" && b.isActive !== true)
          .map((b) => b.label),
      };
    });

    expect(apiBefore.unlocked).not.toContain("finance");
    expect(apiBefore.unlocked).not.toContain("health");
    expect(apiBefore.financeActive).toEqual([]);
    expect(apiBefore.healthActive).toEqual([]);

    const dormantGateways = page.locator('[data-tree-dormant-gateway="1"]');
    await expect(dormantGateways).toHaveCount(2, { timeout: 15_000 });

    await page.locator('circle[aria-label="Add Money to your tree"]').click({ force: true });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Add Money to your map/i })).toBeVisible();

    const unlockResponse = page.waitForResponse(
      (res) => res.url().includes("/api/branches/unlock-theme") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add to map" }).click();
    const unlockRes = await unlockResponse;
    expect(unlockRes.ok()).toBeTruthy();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });

    await expect(page.getByRole("button", { name: "Open Income" })).toBeVisible({ timeout: 30_000 });

    const apiAfterUnlock = await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      const data = (await res.json()) as {
        unlockedLimbIds?: string[];
        branches?: { limbId: string; label?: string | null; isActive?: boolean | null; parentBranchId?: string | null }[];
      };
      const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
      return {
        unlocked: data.unlockedLimbIds ?? [],
        financeActive: roots.filter((b) => b.limbId === "finance" && b.isActive === true).length,
        financeInactiveLabels: roots
          .filter((b) => b.limbId === "finance" && b.isActive !== true)
          .map((b) => b.label),
      };
    });

    expect(apiAfterUnlock.unlocked).toContain("finance");
    expect(apiAfterUnlock.financeActive).toBe(0);
    expect(apiAfterUnlock.financeInactiveLabels.sort()).toEqual(
      ["Assets", "Income", "Liabilities", "Safety net"].sort(),
    );

    await expect(page.getByRole("button", { name: "Open Assets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Safety net" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Liabilities" })).toBeVisible();

    const revealAnimCount = await page
      .locator('[data-tree-gateway-node="1"] animate, [data-tree-limb-label-row="1"] animate')
      .count();

    await page.getByRole("button", { name: "Open Income" }).click();
    await expect(page.getByText("Opened Income")).toBeVisible({ timeout: 15_000 });

    const apiAfterIncome = await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      const data = (await res.json()) as {
        branches?: { limbId: string; label?: string | null; isActive?: boolean | null; parentBranchId?: string | null }[];
      };
      const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
      return roots
        .filter((b) => b.limbId === "finance" && b.isActive === true)
        .map((b) => b.label)
        .sort();
    });
    expect(apiAfterIncome).toEqual(["Income"]);

    await page.getByRole("button", { name: /Money & Finance/ }).click();
    await page.getByRole("button", { name: "Open Assets" }).click();
    await expect(page.getByText("Opened Assets")).toBeVisible({ timeout: 15_000 });

    const apiAfterAssets = await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      const data = (await res.json()) as {
        branches?: { limbId: string; label?: string | null; isActive?: boolean | null; parentBranchId?: string | null }[];
      };
      const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
      return roots
        .filter((b) => b.limbId === "finance" && b.isActive === true)
        .map((b) => b.label)
        .sort();
    });
    expect(apiAfterAssets).toEqual(["Assets", "Income"]);

    test.info().annotations.push({
      type: "reveal-animation",
      description: `SMIL animate nodes after unlock: ${revealAnimCount}`,
    });
  });
});
