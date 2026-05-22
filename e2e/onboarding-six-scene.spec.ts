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

  test("navigates scenes, resumes at scene 3, completes to tree", async ({ page }) => {
    const email = `onboarding.e2e.${Date.now()}@pathfinder.test`;
    await registerAndLogin(page, email);

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/turn one thing on your mind/i)).toBeVisible();
    await page.getByRole("button", { name: "I'm ready" }).click();

    await expect(page.getByText("Your life moves across five areas.")).toBeVisible();
    await page.getByRole("button", { name: "Money" }).click();

    await expect(page.getByText(/Inside Money & Finance there are/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Income" }).click();

    await expect(page.getByText("[Stream Lite goes here — Phase 5]")).toBeVisible({ timeout: 30_000 });

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("[Stream Lite goes here — Phase 5]")).toBeVisible({ timeout: 15_000 });

    const advanceToConfirm = page.waitForResponse(
      (res) => res.url().includes("/api/onboarding/advance") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Skip for now (dev only)" }).click();
    await advanceToConfirm;
    await expect(page.getByText("[Confirm pursuit goes here — Phase 5]")).toBeVisible({
      timeout: 30_000,
    });

    const advanceToHorizon = page.waitForResponse(
      (res) => res.url().includes("/api/onboarding/advance") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Skip for now (dev only)" }).click();
    await advanceToHorizon;
    await expect(page.getByText("Your map is ready.")).toBeVisible();

    await page.getByRole("button", { name: "I'm done for now" }).click();
    await page.waitForURL("**/tree", { timeout: 30_000 });

    const progress = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      const session = (await res.json()) as { user?: { email?: string } };
      const branchesRes = await fetch("/api/branches");
      const branchesPayload = (await branchesRes.json()) as {
        unlockedLimbIds?: string[];
      };
      return {
        email: session.user?.email,
        unlocked: branchesPayload.unlockedLimbIds ?? [],
      };
    });
    expect(progress.email).toBe(email);
    expect(progress.unlocked).toContain("finance");
  });
});
