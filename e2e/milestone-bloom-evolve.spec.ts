import { expect, test } from "@playwright/test";
import {
  HAS_E2E_CREDS,
  ensureRootBranchId,
  loginForE2e,
} from "./helpers/e2e-session";

/**
 * Critical-path regression: relational milestones → bloom → evolve (fork).
 *
 * Credentials: `E2E_EMAIL` + `E2E_PASSWORD` (onboarded user with session auth).
 * Suggested dev user after `npm run seed:tree`:
 *   fulltree@pathfinder.test / password123
 * Example:
 *   E2E_EMAIL=fulltree@pathfinder.test E2E_PASSWORD=password123 npm run test:e2e -- milestone-bloom-evolve
 */

type BranchesPayload = {
  goals?: {
    id: string;
    title: string;
    bloomStatus: string;
    parentGoalId: string | null;
    milestones: { id: string; completedAt: string | null }[];
  }[];
};

type CriticalPathResult = {
  goalId: string;
  childGoalId: string;
  bloomAfterCompletion: string;
  forkStatus: number;
};

test.describe("Milestone → bloom → evolve critical path", () => {
  test.describe.configure({ timeout: 90_000 });

  test.skip(!HAS_E2E_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run this spec");

  test("completing all milestones blooms the goal and fork creates a linked child", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);
    const title = `E2E bloom evolve ${Date.now()}`;

    const result = await page.evaluate(
      async ({ branchId: hubId, title: goalTitle }) => {
        const readJson = async (res: Response) => {
          const text = await res.text();
          try {
            return text ? JSON.parse(text) : {};
          } catch {
            return { raw: text };
          }
        };

        const loadGoals = async () => {
          const res = await fetch("/api/branches");
          if (!res.ok) throw new Error(`GET /api/branches ${res.status}`);
          const data = (await readJson(res)) as BranchesPayload;
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
          const err = await readJson(createRes);
          throw new Error(`POST /api/goals ${createRes.status}: ${JSON.stringify(err)}`);
        }
        const created = (await readJson(createRes)) as { goal?: { id: string } };
        const goalId = created.goal?.id;
        if (!goalId) throw new Error("POST /api/goals missing goal.id");

        for (const stepTitle of ["First step", "Final step"]) {
          const msRes = await fetch(`/api/goals/${goalId}/milestones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: stepTitle }),
          });
          if (!msRes.ok) {
            const err = await readJson(msRes);
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
            const err = await readJson(patchRes);
            throw new Error(`PATCH milestone ${patchRes.status}: ${JSON.stringify(err)}`);
          }
        }

        goals = await loadGoals();
        goal = goals.find((g) => g.id === goalId);
        if (!goal) throw new Error(`Goal ${goalId} missing after milestone completion`);
        const bloomAfterCompletion = goal.bloomStatus;

        const forkRes = await fetch(`/api/goals/${goalId}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Next: ${goalTitle}` }),
        });
        const forkStatus = forkRes.status;
        const forkBody = (await readJson(forkRes)) as { goal?: { id: string } };
        const childGoalId = forkBody.goal?.id ?? "";

        return {
          goalId,
          childGoalId,
          bloomAfterCompletion,
          forkStatus,
        } satisfies CriticalPathResult;
      },
      { branchId, title },
    );

    expect(result.bloomAfterCompletion).toBe("BLOOMED");
    expect(result.forkStatus).toBe(201);
    expect(result.childGoalId).toBeTruthy();

    const childLink = await page.evaluate(async (childId: string) => {
      const res = await fetch("/api/branches");
      if (!res.ok) throw new Error(`GET /api/branches ${res.status}`);
      const data = (await res.json()) as BranchesPayload;
      return (data.goals ?? []).find((g) => g.id === childId) ?? null;
    }, result.childGoalId);

    expect(childLink).not.toBeNull();
    expect(childLink!.parentGoalId).toBe(result.goalId);
    expect(childLink!.bloomStatus).toBe("BUD");
  });

  test("fork returns 409 when the parent goal is not bloomed", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);

    const forkStatus = await page.evaluate(async (hubId: string) => {
      const readJson = async (res: Response) => {
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return { raw: text };
        }
      };

      const createRes = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `E2E fork guard ${Date.now()}`,
          description: "Incomplete goal",
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
      if (!createRes.ok) throw new Error(`POST /api/goals ${createRes.status}`);
      const created = (await readJson(createRes)) as { goal?: { id: string } };
      const goalId = created.goal?.id;
      if (!goalId) throw new Error("missing goal id");

      await fetch(`/api/goals/${goalId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Only step" }),
      });

      const forkRes = await fetch(`/api/goals/${goalId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Should not fork" }),
      });
      return forkRes.status;
    }, branchId);

    expect(forkStatus).toBe(409);
  });
});
