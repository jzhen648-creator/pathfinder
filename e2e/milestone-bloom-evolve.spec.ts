import { expect, test } from "@playwright/test";
import {
  HAS_E2E_CREDS,
  ensureRootBranchId,
  loginForE2e,
} from "./helpers/e2e-session";

/**
 * Critical-path regression: relational milestones → bloom → evolve (fork / propose / commit).
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
    milestones: { id: string; title?: string; completedAt: string | null }[];
  }[];
};

type EvolveProposal = {
  title: string;
  description: string;
  targetDate: string | null;
  milestoneTitles: string[];
};

/** Create a goal with two milestones and complete them so bloomStatus is BLOOMED. */
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

test.describe("Milestone → bloom → evolve critical path", () => {
  test.describe.configure({ timeout: 90_000 });

  test.skip(!HAS_E2E_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run this spec");

  test("completing all milestones blooms the goal and fork creates a linked child", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);
    const title = `E2E bloom evolve ${Date.now()}`;

    const bloomed = await createBloomedGoal(page, branchId, title);
    expect(bloomed.bloomStatus).toBe("BLOOMED");

    const result = await page.evaluate(
      async ({ goalId, goalTitle }) => {
        const forkRes = await fetch(`/api/goals/${goalId}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `Next: ${goalTitle}` }),
        });
        const forkStatus = forkRes.status;
        const forkBody = (await forkRes.json()) as { goal?: { id: string } };
        const childGoalId = forkBody.goal?.id ?? "";

        return {
          goalId,
          childGoalId,
          forkStatus,
        };
      },
      { goalId: bloomed.goalId, goalTitle: title },
    );
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

  test("propose → revise → commit persists milestones on the child goal", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);
    const title = `E2E evolve propose ${Date.now()}`;
    const bloomed = await createBloomedGoal(page, branchId, title);
    expect(bloomed.bloomStatus).toBe("BLOOMED");

    const result = await page.evaluate(
      async ({ goalId, goalTitle }) => {
        const proposeRes = await fetch(`/api/goals/${goalId}/fork/propose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            whatsDifferent: "Shift from learning to shipping a small portfolio piece.",
          }),
        });
        if (!proposeRes.ok) {
          const err = await proposeRes.json();
          throw new Error(`POST propose ${proposeRes.status}: ${JSON.stringify(err)}`);
        }
        const proposed = (await proposeRes.json()) as { proposal?: EvolveProposal };
        if (!proposed.proposal?.milestoneTitles?.length) {
          throw new Error("propose missing milestoneTitles");
        }

        const revisedTitles = proposed.proposal.milestoneTitles.map((t, i) =>
          i === 0 ? "E2E revised first phase" : t,
        );
        const draftForRevise: EvolveProposal = {
          ...proposed.proposal,
          milestoneTitles: revisedTitles,
        };

        const reviseRes = await fetch(`/api/goals/${goalId}/fork/propose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            whatsDifferent: "Shift from learning to shipping a small portfolio piece.",
            correction: "Lead with client outreach, not more coursework.",
            previousProposal: draftForRevise,
          }),
        });
        if (!reviseRes.ok) {
          const err = await reviseRes.json();
          throw new Error(`POST revise ${reviseRes.status}: ${JSON.stringify(err)}`);
        }
        const revised = (await reviseRes.json()) as { proposal?: EvolveProposal };
        const proposal = revised.proposal;
        if (!proposal?.title) throw new Error("revise missing proposal.title");

        const commitProposal: EvolveProposal = {
          ...proposal,
          title: `E2E committed: ${goalTitle}`.slice(0, 200),
          milestoneTitles: proposal.milestoneTitles.length
            ? proposal.milestoneTitles
            : ["Phase one", "Phase two", "Phase three"],
        };

        const forkRes = await fetch(`/api/goals/${goalId}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: commitProposal.title,
            description: commitProposal.description,
            deadline: commitProposal.targetDate ?? undefined,
            proposal: commitProposal,
          }),
        });
        const forkStatus = forkRes.status;
        const forkBody = (await forkRes.json()) as { goal?: { id: string }; error?: string };
        if (!forkRes.ok) {
          throw new Error(`POST fork commit ${forkStatus}: ${forkBody.error ?? "unknown"}`);
        }
        const childGoalId = forkBody.goal?.id ?? "";

        const branchesRes = await fetch("/api/branches");
        const branches = (await branchesRes.json()) as BranchesPayload;
        const child = (branches.goals ?? []).find((g) => g.id === childGoalId);

        return {
          goalId,
          childGoalId,
          forkStatus,
          childMilestoneCount: child?.milestones.length ?? 0,
          childParentId: child?.parentGoalId ?? null,
          firstMilestoneTitle: child?.milestones[0]?.title ?? "",
        };
      },
      { goalId: bloomed.goalId, goalTitle: title },
    );

    expect(result.forkStatus).toBe(201);
    expect(result.childGoalId).toBeTruthy();
    expect(result.childParentId).toBe(result.goalId);
    expect(result.childMilestoneCount).toBeGreaterThanOrEqual(2);
  });

  test("propose returns 409 when the parent goal is not bloomed", async ({ page }) => {
    const login = await loginForE2e(page);
    if (login === "onboarding") test.skip(true, "E2E user must complete onboarding first");
    if (login === "auth_failed") test.skip(true, "Session not established after sign-in");

    const branchId = await ensureRootBranchId(page);

    const status = await page.evaluate(async (hubId: string) => {
      const createRes = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `E2E propose guard ${Date.now()}`,
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
      const created = (await createRes.json()) as { goal?: { id: string } };
      const goalId = created.goal?.id;
      if (!goalId) throw new Error("missing goal id");

      const proposeRes = await fetch(`/api/goals/${goalId}/fork/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsDifferent: "Should not propose yet" }),
      });
      return proposeRes.status;
    }, branchId);

    expect(status).toBe(409);
  });
});
