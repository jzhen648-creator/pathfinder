import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyClarifierAnswerForUser,
  clearQuickQuestionsQuietUntilInCache,
  deleteClarifierAnswerForUser,
  pruneMootPendingClarifiersOnStatusChange,
} from "@/lib/pursuit/apply-clarifier-answers";
import { clarifierPreserveAllowed } from "@/lib/pursuit/pursuit-cache-patch";
import {
  computeQuickQuestionsQuietUntil,
  gateEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { pickQuestionSlotForPursuit } from "@/lib/pursuit/pick-question-slot";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";

const mocks = vi.hoisted(() => ({
  goalFindFirst: vi.fn(),
  goalUpdate: vi.fn(),
  insightFindUnique: vi.fn(),
  insightCacheUpdate: vi.fn(),
  markPursuitReadingDirty: vi.fn(),
  syncPursuitPanel: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    goal: {
      findFirst: mocks.goalFindFirst,
      update: mocks.goalUpdate,
    },
    insightCache: {
      findUnique: mocks.insightFindUnique,
      update: mocks.insightCacheUpdate,
    },
  },
}));

vi.mock("@/lib/map/reading-dirty-ledger", () => ({
  markPursuitReadingDirty: mocks.markPursuitReadingDirty,
}));

vi.mock("@/lib/pursuit/generate-pursuit-enrich", () => ({
  syncPursuitPanel: mocks.syncPursuitPanel,
}));

const USER_ID = "user-alex";
const GOAL_ID = "p-cemap";

const activeSignal: PursuitSignal = {
  title: "CeMAP qualification",
  backgroundChars: 0,
  enrichAnswerCount: 1,
  milestoneCount: 2,
  completedMilestoneCount: 1,
  hasDeadline: true,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
};

function slotContext(quickQuestionsQuietUntil?: string | null) {
  return {
    signal: activeSignal,
    status: "ACTIVE",
    completedAt: null,
    significance: 4,
    enrichAnswers: [],
    quickQuestionsQuietUntil,
    siblingGoalIds: [] as string[],
    existingRelationshipPeerIds: [] as string[],
  };
}

describe("clearQuickQuestionsQuietUntilInCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears quickQuestionsQuietUntil on the pursuit cache row when set", async () => {
    const quietUntil = computeQuickQuestionsQuietUntil();
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        [GOAL_ID]: {
          tone: "in_focus",
          headline: "Headline",
          body: "Body",
          quickQuestionsQuietUntil: quietUntil,
        },
      },
    });

    await clearQuickQuestionsQuietUntilInCache(USER_ID, GOAL_ID);

    expect(mocks.insightCacheUpdate).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        pursuitInsights: {
          [GOAL_ID]: {
            tone: "in_focus",
            headline: "Headline",
            body: "Body",
            quickQuestionsQuietUntil: undefined,
          },
        },
      },
    });
  });

  it("is a no-op when the pursuit row has no cooldown", async () => {
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        [GOAL_ID]: { tone: "in_focus", headline: "Headline", body: "Body" },
      },
    });

    await clearQuickQuestionsQuietUntilInCache(USER_ID, GOAL_ID);

    expect(mocks.insightCacheUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteClarifierAnswerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goalFindFirst.mockResolvedValue({
      id: GOAL_ID,
      description: "",
      enrichAnswers: [
        {
          clarifierId: "route",
          prompt: "Independent or employed?",
          selectedOption: "Independent",
          options: ["Independent", "Employed"],
        },
      ],
    });
    mocks.goalUpdate.mockResolvedValue({
      description: "",
      enrichAnswers: [],
    });
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        [GOAL_ID]: {
          tone: "in_focus",
          headline: "Headline",
          body: "Body",
          quickQuestionsQuietUntil: computeQuickQuestionsQuietUntil(),
        },
      },
    });
  });

  it("clears cooldown and marks dirty without auto-replenish", async () => {
    const result = await deleteClarifierAnswerForUser(USER_ID, GOAL_ID, "route");

    expect(result.enrichAnswers).toEqual([]);
    expect(mocks.markPursuitReadingDirty).toHaveBeenCalledWith(
      USER_ID,
      GOAL_ID,
      "clarifier_answered",
    );
    expect(mocks.insightCacheUpdate).toHaveBeenCalled();
    expect(mocks.syncPursuitPanel).not.toHaveBeenCalled();
  });

  it("reopens clarify slot and preserve on next sync after delete (lock-in)", async () => {
    const quietUntil = computeQuickQuestionsQuietUntil();

    expect(pickQuestionSlotForPursuit(slotContext(quietUntil))).toBe("none");
    expect(
      clarifierPreserveAllowed({
        clarifyTitles: true,
        status: "ACTIVE",
        quickQuestionsQuietUntil: quietUntil,
      }),
    ).toBe(false);
    expect(
      gateEnrichResult(
        {
          clarifiers: [{ id: "fresh", prompt: "Visa route?", options: ["A", "B"], kind: "clarify" }],
          insight: { tone: "in_focus", headline: "H", body: "B" },
          suggestedMilestones: null,
        },
        activeSignal,
        { clarifyTitles: true },
        { status: "ACTIVE", quickQuestionsQuietUntil: quietUntil },
      ).clarifiers,
    ).toHaveLength(0);

    await deleteClarifierAnswerForUser(USER_ID, GOAL_ID, "route");

    const updatedCache = mocks.insightCacheUpdate.mock.calls[0]?.[0]?.data
      ?.pursuitInsights as Record<string, { quickQuestionsQuietUntil?: string }>;
    expect(updatedCache[GOAL_ID]?.quickQuestionsQuietUntil).toBeUndefined();

    expect(pickQuestionSlotForPursuit(slotContext(undefined))).toBe("clarify");
    expect(
      clarifierPreserveAllowed({
        clarifyTitles: true,
        status: "ACTIVE",
        quickQuestionsQuietUntil: undefined,
      }),
    ).toBe(true);
    expect(
      gateEnrichResult(
        {
          clarifiers: [{ id: "fresh", prompt: "Visa route?", options: ["A", "B"], kind: "clarify" }],
          insight: { tone: "in_focus", headline: "H", body: "B" },
          suggestedMilestones: null,
        },
        activeSignal,
        { clarifyTitles: true },
        { status: "ACTIVE", quickQuestionsQuietUntil: undefined },
      ).clarifiers,
    ).toHaveLength(1);
  });
});

describe("applyClarifierAnswerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goalFindFirst.mockResolvedValue({
      id: GOAL_ID,
      description: "",
      enrichAnswers: [],
      milestones: [],
    });
    mocks.goalUpdate.mockResolvedValue({
      description: "",
      enrichAnswers: [
        {
          clarifierId: "route",
          prompt: "Independent or employed?",
          selectedOption: "Independent",
          options: ["Independent", "Employed"],
        },
      ],
    });
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        [GOAL_ID]: {
          tone: "in_focus",
          headline: "Headline",
          body: "Body",
          clarifiers: [
            {
              id: "route",
              prompt: "Independent or employed?",
              options: ["Independent", "Employed"],
              kind: "clarify",
            },
          ],
        },
      },
    });
    mocks.syncPursuitPanel.mockResolvedValue({ clarifierCount: 1, headline: "Headline" });
  });

  it("regenerates the next question after answering", async () => {
    const result = await applyClarifierAnswerForUser(USER_ID, GOAL_ID, {
      clarifierId: "route",
      prompt: "Independent or employed?",
      selectedOption: "Independent",
      options: ["Independent", "Employed"],
    });

    expect(result.nextClarifierCount).toBe(1);
    expect(mocks.syncPursuitPanel).toHaveBeenCalledWith(USER_ID, GOAL_ID, "next", {
      clarifyTitles: true,
    });
  });
});

describe("pruneMootPendingClarifiersOnStatusChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears all pending clarifiers when status becomes COMPLETE", async () => {
    mocks.insightFindUnique.mockResolvedValue({
      pursuitInsights: {
        [GOAL_ID]: {
          tone: "arrival",
          headline: "Headline",
          body: "Body",
          clarifiers: [
            {
              id: "retro-skill",
              prompt: "Which skill did you develop most?",
              options: ["A", "B"],
              kind: "retrospective",
            },
            {
              id: "route",
              prompt: "What route?",
              options: ["A", "B"],
              kind: "clarify",
            },
          ],
          quickQuestionsQuietUntil: computeQuickQuestionsQuietUntil(),
        },
      },
    });

    await pruneMootPendingClarifiersOnStatusChange(USER_ID, GOAL_ID, "COMPLETE");

    expect(mocks.insightCacheUpdate).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        pursuitInsights: {
          [GOAL_ID]: {
            tone: "arrival",
            headline: "Headline",
            body: "Body",
            quickQuestionsQuietUntil: undefined,
          },
        },
      },
    });
  });
});
