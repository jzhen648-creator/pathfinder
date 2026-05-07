import { expect, test } from "@playwright/test";

/**
 * Credentials for a user with onboarding complete and (ideally) at least one root branch.
 * Example: `E2E_EMAIL=user@example.com E2E_PASSWORD=secret npm run test:e2e`
 */
const email = process.env.E2E_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? "";

test.describe("Create goal from Next Steps", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run this spec");

  test("opens modal, submits, and shows the new goal", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/(dashboard|next-steps|onboarding|tree)/, { timeout: 30_000 });
    if (page.url().includes("/onboarding")) {
      test.skip(true, "E2E user must complete onboarding first");
    }

    await page.goto("/next-steps");
    await page.waitForURL(/\/(next-steps|login|onboarding)/, { timeout: 15_000 });
    if (page.url().includes("login")) {
      test.skip(true, "Session not established after sign-in");
    }
    if (!page.url().includes("next-steps")) {
      test.skip(true, "Redirected away from Next Steps");
    }

    await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      const data = (await res.json()) as { branches?: { id: string; parentBranchId?: string | null }[] };
      const roots = (data.branches ?? []).filter((b) => !b.parentBranchId);
      if (roots.length > 0) return;
      await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limbId: "work", mapAngleOffset: 0 }),
      });
    });

    await page.goto("/next-steps");
    await expect(page.locator('[data-testid="next-steps-add-goal"]')).toBeVisible({ timeout: 20_000 });

    await page.locator('[data-testid="next-steps-add-goal"]').click();
    await expect(page.locator('[data-testid="add-goal-modal"]')).toBeVisible();

    const title = `Playwright goal ${Date.now()}`;
    await page.locator('[data-testid="add-goal-title"]').fill(title);

    const branchValue = await page
      .locator('[data-testid="add-goal-branch"] option[value]:not([value=""])')
      .first()
      .getAttribute("value");
    expect(branchValue, "Need at least one branch option").toBeTruthy();
    await page.locator('[data-testid="add-goal-branch"]').selectOption(branchValue!);

    await page.locator('[data-testid="add-goal-submit"]').click();

    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 25_000 });
  });
});
