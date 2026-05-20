import { expect, test } from "@playwright/test";
import {
  HAS_E2E_CREDS,
  ensureRootBranchId,
  loginForE2e,
} from "./helpers/e2e-session";

/**
 * Regression: relational milestones → bloom (goal COMPLETE).
 *
 * Credentials: `E2E_EMAIL` + `E2E_PASSWORD` (onboarded user with session auth).
 * Example:
 *   E2E_EMAIL=fulltree@pathfinder.test E2E_PASSWORD=password123 npm run test:e2e -- milestone-bloom-evolve
 */

type BranchesPayload = {
  goals?: {
    id: string;
    title: string;
    bloomStatus: string;
    parentGoalId: string | null;
    milestones: { id: string; title?: string; completedAt: string | null }[];
  }[];
};

/** Create a goal with two milestones and complete them so bloomStatus is COMPLETE. */
async function createBloomedGoal(page: import("@playwright/test").Page, branchId: string, title: string) {
  return page.evaluate(
    async ({ hubId, goalTitle }) => {
      const loadGoals = async () => {
        const res = await fetch("/api/branches");
        if (!res.ok) throw new Error(`GET /api/branches ${res.status}`);
        const data = (await res.json()) as BranchesPayload;
        return data.goals ?? [];
      };

      const createRes = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goalTitle,
          description: "Playwright critical path",
          branchId: hubId,
          goalType: "practice",
          deadline: "",
          significance: 3,
          hasMeasurableTarget: false,
          targetAmount: "",
          currentAmount: "",
          unit: "",
          generateRoadmap: false,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(`POST /api/goals ${createRes.status}: ${JSON.stringify(err)}`);
      }
      const created = (await createRes.json()) as { goal?: { id: string } };
      const goalId = created.goal?.id;
      if (!goalId) throw new Error("POST /api/goals missing goal.id");

      for (const stepTitle of ["First step", "Final step"]) {
        const msRes = await fetch(`/api/goals/${goalId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: stepTitle }),
        });
        if (!msRes.ok) {
          const err = await msRes.json();
          throw new Error(`POST milestone ${msRes.status}: ${JSON.stringify(err)}`);
        }
      }

      let goals = await loadGoals();
      let goal = goals.find((g) => g.id === goalId);
      if (!goal || goal.milestones.length < 2) {
        throw new Error(`Expected 2 milestones on goal ${goalId}`);
      }

      const sorted = [...goal.milestones].sort((a, b) => a.id.localeCompare(b.id));
      for (const milestone of sorted) {
        const patchRes = await fetch(`/api/goals/${goalId}/milestones/${milestone.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: true }),
        });
        if (!patchRes.ok) {
          const err = await patchRes.json();
          throw new Error(`PATCH milestone ${patchRes.status}: ${JSON.stringify(err)}`);
        }
      }

      goals = await loadGoals();
      goal = goals.find((g) => g.id === goalId);
      if (!goal) throw new Error(`Goal ${goalId} missing after milestone completion`);
      return { goalId, bloomStatus: goal.bloomStatus };
    },
    { hubId: branchId, goalTitle: title },
  );
}

test.describe("Milestone → bloom", () => {
  test.describe.configure({ timeout: 90_000 });

  test.skip(!HAS_E2E_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run this spec");

  test("completing all milestones blooms the goal", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);
    const title = `E2E bloom ${Date.now()}`;

    const bloomed = await createBloomedGoal(page, branchId, title);
    expect(bloomed.bloomStatus).toBe("COMPLETE");
  });
});
