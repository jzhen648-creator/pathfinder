import { describe, expect, it, vi, beforeEach } from "vitest";

import { applyClarifierAnswerForUser } from "@/lib/pursuit/apply-clarifier-answers";

const mocks = vi.hoisted(() => ({
  goalFindFirst: vi.fn(),
  goalUpdate: vi.fn(),
  markPursuitReadingDirty: vi.fn(),
  insightCacheFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: {
      findFirst: mocks.goalFindFirst,
      update: mocks.goalUpdate,
    },
    insightCache: {
      findUnique: mocks.insightCacheFindUnique,
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/map/reading-dirty-ledger", () => ({
  markPursuitReadingDirty: mocks.markPursuitReadingDirty,
}));

vi.mock("@/lib/pursuit/pursuit-context-log", () => ({
  appendPursuitContextEntryAndSync: vi.fn(),
}));

describe("applyClarifierAnswerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goalFindFirst.mockResolvedValue({
      id: "goal-1",
      description: "Manual context only.",
      enrichAnswers: [],
      milestones: [],
    });
    mocks.goalUpdate.mockResolvedValue({
      description: "Manual context only.",
      enrichAnswers: [
        {
          clarifierId: "qq-1",
          prompt: "Stocks or cash ISA?",
          selectedOption: "Stocks and shares",
        },
      ],
    });
    mocks.markPursuitReadingDirty.mockResolvedValue(undefined);
    mocks.insightCacheFindUnique.mockResolvedValue(null);
  });

  it("stores the answer only in enrichAnswers — does not mirror into description", async () => {
    const { appendPursuitContextEntryAndSync } = await import("@/lib/pursuit/pursuit-context-log");

    const result = await applyClarifierAnswerForUser("user-1", "goal-1", {
      clarifierId: "qq-1",
      prompt: "Stocks or cash ISA?",
      selectedOption: "Stocks and shares",
    });

    expect(mocks.goalUpdate).toHaveBeenCalledWith({
      where: { id: "goal-1" },
      data: {
        enrichAnswers: [
          {
            clarifierId: "qq-1",
            prompt: "Stocks or cash ISA?",
            selectedOption: "Stocks and shares",
          },
        ],
      },
      select: { description: true, enrichAnswers: true },
    });
    expect(appendPursuitContextEntryAndSync).not.toHaveBeenCalled();
    expect(result.description).toBe("Manual context only.");
    expect(result.enrichAnswers).toEqual([
      {
        clarifierId: "qq-1",
        prompt: "Stocks or cash ISA?",
        selectedOption: "Stocks and shares",
      },
    ]);
  });
});
