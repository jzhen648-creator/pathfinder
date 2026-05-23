import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "password123";

async function registerAndLogin(page: Page, email: string) {
  const register = await page.request.post("/api/auth/register", {
    data: {
      name: "Onboarding Test",
      email,
      password: PASSWORD,
    },
  });
  expect(register.ok()).toBeTruthy();

  const csrfRes = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  expect(csrfToken).toBeTruthy();

  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrfToken!,
      email,
      password: PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  const signInBody = (await signInRes.json().catch(() => ({}))) as { error?: string };
  expect(signInBody.error).toBeUndefined();
}

test.describe("Six-scene guided onboarding", () => {
  test.setTimeout(180_000);

  test("navigates scenes on /tree, resumes, completes in-place", async ({ page }) => {
    const email = `onboarding.e2e.${Date.now()}@pathfinder.test`;
    await registerAndLogin(page, email);

    await page.goto("/tree", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/turn one thing on your mind/i)).toBeVisible();
    await page.getByRole("button", { name: "I'm ready" }).click();

    await expect(page.getByText(/Tap a theme to begin/i)).toBeVisible({ timeout: 15_000 });
    await page.locator('circle[aria-label="Add Money to your tree"]').click({ force: true });
    await page.getByRole("button", { name: "Add Money" }).click();
    await expect(page.getByRole("complementary", { name: "Theme details" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /^Income\b/ }).click();
    await expect(page.getByText("Opened Income.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Open Stream — Money/i }).click();
    await expect(page.getByText("Take your time. Sentences are fine.")).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/tree", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Take your time. Sentences are fine.")).toBeVisible({
      timeout: 15_000,
    });

    const advanceToHorizon = page.waitForResponse(
      (res) => res.url().includes("/api/onboarding/advance") && res.request().method() === "POST",
    );
    await page.evaluate(async () => {
      await fetch("/api/onboarding/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: 6, themeId: "finance", hubSlug: "income" }),
      });
    });
    await advanceToHorizon;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Your map has started.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /I'm done for now/i }).click();
    await expect(page).toHaveURL(/\/tree/, { timeout: 30_000 });
    await expect(page.getByText(/turn one thing on your mind/i)).not.toBeVisible({ timeout: 15_000 });

    const progress = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      const session = (await res.json()) as { user?: { email?: string; onboardingCompleted?: boolean } };
      const branchesRes = await fetch("/api/branches");
      const branchesPayload = (await branchesRes.json()) as {
        unlockedLimbIds?: string[];
      };
      return {
        email: session.user?.email,
        onboardingCompleted: session.user?.onboardingCompleted,
        unlocked: branchesPayload.unlockedLimbIds ?? [],
      };
    });
    expect(progress.email).toBe(email);
    expect(progress.onboardingCompleted).toBe(true);
    expect(progress.unlocked).toContain("finance");
  });
});
