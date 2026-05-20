import { expect, test } from "@playwright/test";
import { HAS_E2E_CREDS, loginForE2e } from "./helpers/e2e-session";

test.describe("Tree load probe", () => {
  test.skip(!HAS_E2E_CREDS, "Set E2E_EMAIL and E2E_PASSWORD");

  test("loads limbs after login", async ({ page }) => {
    const login = await loginForE2e(page);
    test.skip(login !== "ok", "E2E user not ready");

    await page.goto("/tree", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Growing your tree...")).toBeHidden({ timeout: 60_000 });

    const limbCount = await page.locator("[data-tree-limb-depth-plane]").count();
    expect(limbCount).toBeGreaterThan(0);
  });
});
