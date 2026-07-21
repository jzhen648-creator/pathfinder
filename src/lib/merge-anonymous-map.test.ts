import { describe, expect, it, vi } from "vitest";
import {
  mergeAnonymousMapIntoAccount,
  type MergeDbClient,
} from "./merge-anonymous-map";

const SOURCE = "anon-user";
const TARGET = "real-user";

type MockOverrides = {
  sourceCategories?: Array<{
    id: string;
    themeId: string;
    label: string | null;
    isSystemCategory?: boolean;
  }>;
  targetCategories?: Array<{
    id: string;
    themeId: string;
    label: string | null;
    isActive: boolean;
  }>;
  sourceGoals?: Array<{ id: string; categoryId: string | null }>;
  sourceManualProfile?: Record<string, unknown> | null;
  targetManualProfile?: Record<string, unknown> | null;
  sourceFacts?: Array<Record<string, unknown>>;
  sourceUnlocked?: string[];
  targetUnlocked?: string[];
  sourceMemory?: Record<string, unknown> | null;
  targetMemory?: Record<string, unknown> | null;
  sourceOnboarding?: { onboardingCompleted: boolean; onboardingThemeId: string | null };
  targetOnboarding?: { onboardingCompleted: boolean; onboardingThemeId: string | null };
};

function emptyManualProfile(userId: string): Record<string, unknown> {
  return {
    id: `profile-${userId}`,
    userId,
    displayName: null,
    dateOfBirth: null,
    location: null,
    languages: [],
    occupation: null,
    educationLevel: null,
    employmentStatus: null,
    industry: null,
    jobTitle: null,
    currencyCode: null,
    measurementSystem: null,
  };
}

function buildMockDb(overrides: MockOverrides = {}) {
  const sourceCategories = overrides.sourceCategories ?? [];
  const targetCategories = overrides.targetCategories ?? [];
  const sourceGoals = overrides.sourceGoals ?? [];

  let createdCategoryCount = 0;

  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === SOURCE) {
          return {
            unlockedLimbIds: overrides.sourceUnlocked ?? [],
            onboardingCompleted: overrides.sourceOnboarding?.onboardingCompleted ?? false,
            onboardingThemeId: overrides.sourceOnboarding?.onboardingThemeId ?? null,
          };
        }
        return {
          unlockedLimbIds: overrides.targetUnlocked ?? [],
          onboardingCompleted: overrides.targetOnboarding?.onboardingCompleted ?? false,
          onboardingThemeId: overrides.targetOnboarding?.onboardingThemeId ?? null,
        };
      }),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    goal: {
      findMany: vi.fn(async () => sourceGoals),
      updateMany: vi.fn(async ({ where }: { where: { categoryId?: string | null } }) => {
        if (where.categoryId === undefined) {
          // Catch-all move for whatever is left uncategorized.
          const moved = sourceGoals.filter(
            (g) =>
              g.categoryId == null ||
              !sourceCategories.some((c) => c.id === g.categoryId),
          );
          return { count: moved.length };
        }
        return {
          count: sourceGoals.filter((g) => g.categoryId === where.categoryId).length,
        };
      }),
    },
    themeCategory: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === SOURCE ? sourceCategories : targetCategories,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdCategoryCount += 1;
        return {
          id: `created-${createdCategoryCount}`,
          themeId: data.themeId,
          label: data.label,
          isActive: true,
        };
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    pursuitContextEntry: { updateMany: vi.fn(async () => ({ count: 0 })) },
    pursuitRelationship: { updateMany: vi.fn(async () => ({ count: 0 })) },
    pursuitStatusTransition: { updateMany: vi.fn(async () => ({ count: 0 })) },
    userManualProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        if (where.userId === SOURCE) return overrides.sourceManualProfile ?? null;
        return overrides.targetManualProfile ?? null;
      }),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    profileFact: {
      findMany: vi.fn(async () => overrides.sourceFacts ?? []),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    userMemory: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        if (where.userId === SOURCE) return overrides.sourceMemory ?? null;
        return overrides.targetMemory ?? null;
      }),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    aiReadingDirtyItem: { upsert: vi.fn(async () => ({})) },
  };

  return db as typeof db & MergeDbClient;
}

describe("mergeAnonymousMapIntoAccount", () => {
  it("rejects merging a user into itself", async () => {
    const db = buildMockDb();
    await expect(
      mergeAnonymousMapIntoAccount(db, SOURCE, SOURCE),
    ).rejects.toThrow(/itself/);
  });

  it("remaps goals onto the target category with the same theme + label key", async () => {
    const db = buildMockDb({
      sourceCategories: [{ id: "src-cat", themeId: "finance", label: "Saving & investments" }],
      targetCategories: [
        { id: "tgt-cat", themeId: "finance", label: "Saving & investments", isActive: true },
      ],
      sourceGoals: [
        { id: "g1", categoryId: "src-cat" },
        { id: "g2", categoryId: "src-cat" },
      ],
    });

    const result = await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: SOURCE, categoryId: "src-cat" },
      data: { userId: TARGET, categoryId: "tgt-cat" },
    });
    expect(db.themeCategory.create).not.toHaveBeenCalled();
    expect(result.movedGoals).toBe(2);
    expect(result.createdCategories).toBe(0);
  });

  it("recreates custom guest categories missing on the target", async () => {
    const db = buildMockDb({
      sourceCategories: [{ id: "src-custom", themeId: "work", label: "Side hustle" }],
      targetCategories: [],
      sourceGoals: [{ id: "g1", categoryId: "src-custom" }],
    });

    const result = await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.themeCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: TARGET,
          themeId: "work",
          label: "Side hustle",
          isSystemCategory: false,
          isActive: true,
        }),
      }),
    );
    expect(db.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: SOURCE, categoryId: "src-custom" },
      data: { userId: TARGET, categoryId: "created-1" },
    });
    expect(result.createdCategories).toBe(1);
  });

  it("moves uncategorized goals and child rows, marks dirty, deletes the anon user", async () => {
    const db = buildMockDb({
      sourceGoals: [{ id: "g1", categoryId: null }],
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.goal.updateMany).toHaveBeenCalledWith({
      where: { userId: SOURCE },
      data: { userId: TARGET },
    });
    for (const delegate of [
      db.pursuitContextEntry,
      db.pursuitRelationship,
      db.pursuitStatusTransition,
    ]) {
      expect(delegate.updateMany).toHaveBeenCalledWith({
        where: { userId: SOURCE },
        data: { userId: TARGET },
      });
    }
    expect(db.aiReadingDirtyItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: TARGET,
          entityType: "global",
          reason: "anonymous_map_merged",
        }),
      }),
    );
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: SOURCE } });
  });

  it("fills only empty target manual-profile fields", async () => {
    const db = buildMockDb({
      sourceManualProfile: {
        ...emptyManualProfile(SOURCE),
        displayName: "Guest Ada",
        dateOfBirth: new Date("1990-01-01"),
        location: "United Kingdom",
      },
      targetManualProfile: {
        ...emptyManualProfile(TARGET),
        displayName: "Ada",
      },
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.userManualProfile.update).toHaveBeenCalledWith({
      where: { userId: TARGET },
      data: {
        dateOfBirth: new Date("1990-01-01"),
        location: "United Kingdom",
      },
    });
    expect(db.userManualProfile.create).not.toHaveBeenCalled();
  });

  it("creates the target manual profile when missing", async () => {
    const db = buildMockDb({
      sourceManualProfile: {
        ...emptyManualProfile(SOURCE),
        displayName: "Guest Ada",
      },
      targetManualProfile: null,
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.userManualProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: TARGET, displayName: "Guest Ada" }),
      }),
    );
  });

  it("unions profile facts with duplicate skip and unlocked themes in canonical order", async () => {
    const db = buildMockDb({
      sourceFacts: [
        {
          category: "preferences",
          key: "orientation",
          value: "builder",
          confidence: null,
          source: "user_manual",
        },
      ],
      sourceUnlocked: ["health"],
      targetUnlocked: ["finance"],
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.profileFact.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: TARGET, key: "orientation" }),
      ],
      skipDuplicates: true,
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { unlockedLimbIds: ["finance", "health"] },
    });
  });

  it("does not rewrite unlockedLimbIds when the source adds nothing", async () => {
    const db = buildMockDb({
      sourceUnlocked: ["finance"],
      targetUnlocked: ["finance", "health"],
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unlockedLimbIds: expect.anything() }),
      }),
    );
  });

  it("recreates empty custom guest categories so they survive the merge", async () => {
    const db = buildMockDb({
      sourceCategories: [
        { id: "src-empty", themeId: "work", label: "Side hustle", isSystemCategory: false },
        { id: "src-system", themeId: "work", label: "Career", isSystemCategory: true },
      ],
      targetCategories: [],
      sourceGoals: [],
    });

    const result = await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.themeCategory.create).toHaveBeenCalledTimes(1);
    expect(db.themeCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: TARGET, label: "Side hustle" }),
      }),
    );
    expect(result.createdCategories).toBe(1);
  });

  it("moves guest UserMemory when the target has none", async () => {
    const db = buildMockDb({
      sourceMemory: {
        blob: "Prefers building slowly.",
        version: 3,
        isDirty: false,
        lastUserEditedAt: null,
      },
      targetMemory: null,
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.userMemory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: TARGET,
          blob: "Prefers building slowly.",
          version: 3,
        }),
      }),
    );
  });

  it("keeps the target UserMemory when it already has content", async () => {
    const db = buildMockDb({
      sourceMemory: { blob: "Guest memory.", version: 1, isDirty: false, lastUserEditedAt: null },
      targetMemory: { blob: "Target memory.", version: 5, isDirty: false, lastUserEditedAt: null },
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.userMemory.create).not.toHaveBeenCalled();
    expect(db.userMemory.update).not.toHaveBeenCalled();
  });

  it("carries onboarding progress over and clears the delivery gate", async () => {
    const db = buildMockDb({
      sourceOnboarding: { onboardingCompleted: true, onboardingThemeId: "finance" },
      targetOnboarding: { onboardingCompleted: false, onboardingThemeId: null },
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: {
        lastReadingDeliveredAt: null,
        onboardingCompleted: true,
        onboardingThemeId: "finance",
      },
    });
  });

  it("never downgrades target onboarding state", async () => {
    const db = buildMockDb({
      sourceOnboarding: { onboardingCompleted: false, onboardingThemeId: null },
      targetOnboarding: { onboardingCompleted: true, onboardingThemeId: "work" },
    });

    await mergeAnonymousMapIntoAccount(db, SOURCE, TARGET);

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { lastReadingDeliveredAt: null },
    });
  });
});
