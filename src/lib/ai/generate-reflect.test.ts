import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateReflectResponse,
  buildPursuitsOnlyMapContext,
  buildReflectMilestoneOptions,
  generateReflectResponseBatched,
} from "@/lib/ai/generate-reflect";
import type { PursuitSignal } from "@/lib/pursuit/pursuit-enrich-readiness";
import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { REFLECT_PURSUIT_BATCH_SIZE, chunkReflectPursuitIds } from "@/lib/ai/reflect-call";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import {
  buildDenseReflectResponse,
  buildMaxLoadedDenseReflectResponse,
  DENSE_ALL_PURSUIT_IDS,
  DENSE_DIRTY_PURSUIT_IDS,
  DENSE_MAP_CONTEXT,
  DENSE_READING_PACKET,
  DENSE_USER_CONTEXT,
  REFLECT_OUTPUT_CHAR_SAFE_LIMIT,
} from "@/lib/map/__fixtures__/dense-map";

const mocks = vi.hoisted(() => ({
  formatMapContext: vi.fn(),
  formatUserContext: vi.fn(),
  compileReadingPacket: vi.fn(),
  generateJsonCompletion: vi.fn(),
}));

vi.mock("@/lib/ai/format-map-context", () => ({
  formatMapContext: mocks.formatMapContext,
}));

vi.mock("@/lib/ai/format-user-context", () => ({
  formatUserContext: mocks.formatUserContext,
}));

vi.mock("@/lib/map/compile-reading-packet", () => ({
  compileReadingPacket: mocks.compileReadingPacket,
  readingPacketToJson: (packet: unknown) => JSON.stringify(packet, null, 2),
}));

vi.mock("@/lib/gemini", () => ({
  hasGeminiKey: () => true,
  generateJsonCompletion: mocks.generateJsonCompletion,
  GeminiNotConfiguredError: class GeminiNotConfiguredError extends Error {},
  GeminiProviderError: class GeminiProviderError extends Error {
    status = 429;
  },
}));

const USER_ID = "alex-carter";
const ENRICH_OPTIONS = {
  clarifyTitles: false,
  includeMarks: false,
} as const;

function baseDirtyAnalysis(): ReadingDirtyAnalysis {
  return {
    pursuitIds: DENSE_DIRTY_PURSUIT_IDS,
    themeIds: ["work", "finance"],
    hubIds: ["cat-job", "cat-savings"],
    markIds: [],
    hasGlobal: true,
    totalItems: DENSE_DIRTY_PURSUIT_IDS.length,
    hasPursuitArchivedReason: false,
    staleDirtyPursuitIds: [],
    activeDirtyPursuitIds: DENSE_DIRTY_PURSUIT_IDS,
  };
}

/** Silent panel loss guard — every dirty pursuit must appear in output pursuits record. */
export function assertReflectPursuitCompleteness(
  dirtyPursuitIds: string[],
  reflect: ReflectResponse,
): void {
  for (const id of dirtyPursuitIds) {
    expect(reflect.pursuits[id], `missing pursuit panel for ${id}`).toBeDefined();
  }
}

describe("chunkReflectPursuitIds", () => {
  it("returns a single batch when pursuits fit the budget", () => {
    const ids = Array.from({ length: REFLECT_PURSUIT_BATCH_SIZE }, (_, i) => `p${i + 1}`);
    expect(chunkReflectPursuitIds(ids)).toEqual([ids]);
  });

  it("splits Alex-sized 15-pursuit first refresh into two batches", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `p${i + 1}`);
    expect(chunkReflectPursuitIds(ids)).toEqual([ids.slice(0, 8), ids.slice(8)]);
  });
});

describe("buildReflectMilestoneOptions", () => {
  it("marks pursuits with enough signal as milestones allowed", () => {
    const signals = new Map<string, PursuitSignal>([
      [
        "p-rich",
        {
          title: "CeMAP qualification",
          description: "x".repeat(80),
          enrichAnswerCount: 0,
          milestoneCount: 0,
          completedMilestoneCount: 0,
          hasDeadline: true,
          hasQuantifiedTarget: false,
          status: "ACTIVE",
        },
      ],
      [
        "p-full",
        {
          title: "Already has three milestones",
          description: "Plenty of context",
          enrichAnswerCount: 2,
          milestoneCount: 3,
          completedMilestoneCount: 0,
          hasDeadline: true,
          hasQuantifiedTarget: false,
          status: "ACTIVE",
        },
      ],
      [
        "p-sparse",
        {
          title: "Hi",
          description: "",
          enrichAnswerCount: 0,
          milestoneCount: 0,
          completedMilestoneCount: 0,
          hasDeadline: false,
          hasQuantifiedTarget: false,
          status: "ACTIVE",
        },
      ],
    ]);

    const block = buildReflectMilestoneOptions(["p-rich", "p-full", "p-sparse"], signals);

    expect(block).toContain("p-rich: Milestones allowed");
    expect(block).toContain("p-full: Milestones allowed");
    expect(block).toContain("suggest only missing chronological steps");
    expect(block).toContain("p-sparse: Milestones NOT allowed");
  });
});

describe("buildPursuitsOnlyMapContext", () => {
  it("keeps dirty pursuits with same-category siblings and drops unrelated map context", () => {
    const sliced = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, ["p-cemap"]);
    const pursuits = sliced.themes.flatMap((theme) =>
      theme.hubs.flatMap((hub) => hub.pursuits.map((pursuit) => pursuit.title)),
    );

    expect(sliced.themes.map((theme) => theme.id)).toEqual(["work"]);
    expect(sliced.themes[0]?.hubs.map((hub) => hub.id)).toEqual(["cat-job"]);
    expect(pursuits).toEqual([
      "CeMAP qualification",
      "Product Lead search",
      "Senior Engineer at Acme",
    ]);
    expect(pursuits).not.toContain("Public speaking");
    expect(pursuits).not.toContain("£500,000 ISA");
  });
});

describe("generateReflectResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatMapContext.mockResolvedValue(DENSE_MAP_CONTEXT);
    mocks.formatUserContext.mockResolvedValue(DENSE_USER_CONTEXT);
    mocks.compileReadingPacket.mockResolvedValue(DENSE_READING_PACKET);
  });

  it("returns a pursuit entry for every dirty pursuit on the 12-pursuit dense map", async () => {
    expect(DENSE_ALL_PURSUIT_IDS).toHaveLength(12);
    expect(DENSE_DIRTY_PURSUIT_IDS).toEqual(DENSE_ALL_PURSUIT_IDS);

    const complete = buildDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    mocks.generateJsonCompletion.mockResolvedValue(JSON.stringify(complete));

    const metrics = emptyMapAiSyncMetrics();
    const reflect = await generateReflectResponse(
      USER_ID,
      baseDirtyAnalysis(),
      DENSE_DIRTY_PURSUIT_IDS,
      ["work", "finance"],
      ENRICH_OPTIONS,
      "",
      metrics,
    );

    assertReflectPursuitCompleteness(DENSE_DIRTY_PURSUIT_IDS, reflect);
    expect(Object.keys(reflect.pursuits)).toHaveLength(12);
    expect(reflect.themes?.work?.oneLiner).toBeTruthy();
    expect(metrics.readingPacketChars).toBeGreaterThan(0);
  });

  it("fails completeness when a dirty pursuit is missing from truncated output", () => {
    const truncated = buildDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS.slice(0, -1));
    expect(() =>
      assertReflectPursuitCompleteness(DENSE_DIRTY_PURSUIT_IDS, truncated),
    ).toThrow(/missing pursuit panel/);
  });

  it("records reflectResponseChars within safe budget for minimal dense fixture", async () => {
    const complete = buildDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    mocks.generateJsonCompletion.mockResolvedValue(JSON.stringify(complete));

    const metrics = emptyMapAiSyncMetrics();
    await generateReflectResponse(
      USER_ID,
      baseDirtyAnalysis(),
      DENSE_DIRTY_PURSUIT_IDS,
      ["work", "finance"],
      ENRICH_OPTIONS,
      "",
      metrics,
    );

    expect(metrics.reflectResponseChars).toBeGreaterThan(2800);
    expect(metrics.reflectResponseChars).toBeLessThanOrEqual(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
  });

  it("sends sliced same-category map context for pursuit-only reflect", async () => {
    mocks.generateJsonCompletion.mockResolvedValue(
      JSON.stringify({
        reading: "",
        themes: {},
        pursuits: {
          "p-cemap": {
            tone: "worth_a_look",
            headline: "CeMAP deadline is close",
            body: "CeMAP has a near deadline and no completed milestones yet.",
            clarifiers: [],
            suggestedMilestones: null,
          },
        },
      }),
    );

    await generateReflectResponse(
      USER_ID,
      baseDirtyAnalysis(),
      ["p-cemap"],
      [],
      ENRICH_OPTIONS,
      "",
      emptyMapAiSyncMetrics(),
      { scope: "pursuits-only" },
    );

    const user = (mocks.generateJsonCompletion.mock.calls[0]?.[0] as { user: string }).user;
    const mapContextBlock = user.match(/<map_context>\n([\s\S]*?)\n<\/map_context>/)?.[1] ?? "";
    expect(mapContextBlock).toContain("CeMAP qualification");
    expect(mapContextBlock).toContain("Product Lead search");
    expect(mapContextBlock).toContain("Senior Engineer at Acme");
    expect(mapContextBlock).not.toContain("Public speaking");
    expect(mapContextBlock).not.toContain("£500,000 ISA");
    expect(user).toContain('Return ONLY: { "reading": "", "pursuits": { ... } }');
  });

  it("schema-max 12-dirty output fits within 8192-token reflect budget", () => {
    const maxLoaded = buildMaxLoadedDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    const chars = JSON.stringify(maxLoaded).length;

    // Prior 2048-token ceiling truncated 15-pursuit Alex first refresh into invalid JSON.
    expect(chars).toBe(21774);
    expect(chars).toBeLessThanOrEqual(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
  });

  it("batches 15 dirty pursuits across two reflect calls", async () => {
    const fifteenIds = Array.from({ length: 15 }, (_, i) => `p-${i + 1}`);
    const firstBatch = fifteenIds.slice(0, 8);
    const secondBatch = fifteenIds.slice(8);

    mocks.generateJsonCompletion
      .mockResolvedValueOnce(
        JSON.stringify({
          ...buildDenseReflectResponse(firstBatch),
          themes: {
            work: {
              tone: "in_focus",
              oneLiner: "Work is live",
              reflective: "CeMAP and Product Lead search carry deadlines.",
              contextual: "",
              combined: "",
            },
          },
        }),
      )
      .mockResolvedValueOnce(JSON.stringify(buildDenseReflectResponse(secondBatch)));

    const metrics = emptyMapAiSyncMetrics();
    const dirty = { ...baseDirtyAnalysis(), pursuitIds: fifteenIds, activeDirtyPursuitIds: fifteenIds };

    const reflect = await generateReflectResponseBatched(
      USER_ID,
      dirty,
      fifteenIds,
      ["work", "finance"],
      ENRICH_OPTIONS,
      "",
      metrics,
    );

    expect(mocks.generateJsonCompletion).toHaveBeenCalledTimes(2);
    assertReflectPursuitCompleteness(fifteenIds, reflect);
    expect(reflect.reading.length).toBeGreaterThan(0);
    expect(metrics.reflectResponseChars).toBeGreaterThan(0);
  });
});
