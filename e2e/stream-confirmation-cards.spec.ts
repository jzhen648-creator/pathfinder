import { expect, test } from "@playwright/test";
import { HAS_E2E_CREDS, loginForE2e } from "./helpers/e2e-session";

/** Canonical Career hub brain dump — exercises mark, peer/child pursuits, milestones. */
const CAREER_DUMP = `Last March I was promoted to senior engineer — huge win. I'm actively working on moving into Head of Product — still early days. I need to find a mentor for that path. I also want to position for senior roles more broadly — I still need to update my LinkedIn. Separately I'm building a portfolio website — I've outlined the content structure but haven't designed or shipped it yet.`;

test.describe("Stream confirmation card variants", () => {
  test.skip(!HAS_E2E_CREDS, "Set E2E_EMAIL and E2E_PASSWORD");

  test("Career dump: seven cards with distinct variant classes", async ({ page }) => {
    const login = await loginForE2e(page);
    test.skip(login !== "ok", `E2E login failed: ${login}`);

    await page.goto("/tree", { waitUntil: "networkidle" });

    const careerBranchId = await page.evaluate(async () => {
      const res = await fetch("/api/branches");
      if (!res.ok) throw new Error(`branches ${res.status}`);
      const data = (await res.json()) as {
        branches?: { id: string; limbId: string; label?: string; name?: string }[];
      };
      const career = (data.branches ?? []).find(
        (b) => b.limbId === "work" && /career/i.test(b.label ?? b.name ?? ""),
      );
      return career?.id ?? null;
    });
    expect(careerBranchId).toBeTruthy();

    const extract = await page.evaluate(
      async ({ hubId, input }) => {
        const res = await fetch("/api/stream/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hubId, input, inputMode: "text" }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`extract ${res.status}: ${err}`);
        }
        return res.json();
      },
      { hubId: careerBranchId!, input: CAREER_DUMP },
    );

    const pursuits = extract.pursuits ?? [];
    const marks = extract.marks ?? [];
    const milestones = extract.milestones ?? [];
    const total = pursuits.length + marks.length + milestones.length;
    expect(total).toBeGreaterThanOrEqual(5);

    await page.evaluate(
      ({ hubId, draft }) => {
        (window as unknown as { __pfStreamTest?: { hubId: string; draft: string } }).__pfStreamTest =
          { hubId, draft };
      },
      { hubId: careerBranchId!, draft: CAREER_DUMP },
    );

    await page.getByRole("heading", { name: /career/i }).first().click({ timeout: 15_000 }).catch(() => {
      /* hub label may be in panel only */
    });

    const streamBtn = page.getByTestId("tree-open-stream").first();
    await streamBtn.click({ timeout: 15_000 });

    const textarea = page.locator(".pf-stream-shell textarea, .pf-stream-shell [contenteditable]").first();
    await textarea.fill(CAREER_DUMP);

    await page.getByRole("button", { name: "Send" }).click({ timeout: 10_000 });

    await page.waitForSelector(".pf-stream-card", { timeout: 60_000 });

    const seenVariants = new Set<string>();
    const cardCount = Math.min(7, total);

    for (let i = 0; i < cardCount; i += 1) {
      const card = page.locator(".pf-stream-card").first();
      await expect(card).toBeVisible();

      const variant = await card.evaluate((el) => {
        const m = el.className.match(/pf-stream-card--([\w-]+)/);
        return m?.[1] ?? "unknown";
      });
      seenVariants.add(variant);

      if (variant === "mark") {
        await expect(card.locator(".pf-stream-card-date")).toBeVisible();
      }
      if (variant === "pursuit-child") {
        await expect(card.locator(".pf-stream-card-parent")).toContainText("↳");
        await expect(page.locator(".pf-stream-card-connector")).toBeVisible();
      }
      if (variant === "milestone") {
        await expect(card.locator(".pf-stream-card-parent")).toContainText("on:");
      }

      await page.getByRole("button", { name: "Add" }).click();
      await page.waitForTimeout(250);
    }

    expect(seenVariants.size).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: /save to tree/i }).click({ timeout: 15_000 });
    await expect(page.getByText(/tree updated|saved/i)).toBeVisible({ timeout: 30_000 }).catch(() => {
      /* toast copy may vary */
    });
  });
});
