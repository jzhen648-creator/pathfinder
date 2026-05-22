import { expect, test } from "@playwright/test";
import { loginMandela } from "./helpers/mandela-session";

test.describe("Hub panel Stream and marks", () => {
  test.setTimeout(120_000);

  test("Friendships hub shows marks list and a single Open Stream entry", async ({ page }) => {
    await loginMandela(page);

    await page.goto("/tree", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Growing your tree...")).toBeHidden({ timeout: 60_000 });

    await page.getByRole("button", { name: "Open Friendships" }).click();

    const hubRail = page.getByRole("complementary", { name: "Hub details" });
    await expect(hubRail).toBeVisible({ timeout: 15_000 });
    await expect(hubRail.getByRole("heading", { name: "Friendships" })).toBeVisible();

    await expect(hubRail.getByTestId("tree-open-hub-stream")).toHaveCount(1);
    await expect(hubRail.getByTestId("tree-open-hub-stream")).toHaveText("Open Stream");

    await expect(hubRail.getByTestId("tree-add-moment")).toHaveCount(0);
    await expect(hubRail.getByText("Tell me about this")).toHaveCount(0);
    await expect(hubRail.getByText("or just start talking →")).toHaveCount(0);

    await expect(hubRail.getByText(/Marks · \d+/)).toBeVisible();
    await expect(hubRail.getByText("Built organising partnership with Oliver Tambo")).toBeVisible();
  });
});
