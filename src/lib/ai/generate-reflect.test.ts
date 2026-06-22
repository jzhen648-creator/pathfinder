import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateReflectResponse,
  buildPursuitsOnlyMapContext,
  buildReflectMilestoneOptions,
  buildReflectPursuitsOnlySystemPrompt,
  buildReflectSystemPrompt,
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

vi.mock("@/lib/map/compile-reading-packet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/compile-reading-packet")>();
  return {
    ...actual,
    compileReadingPacket: mocks.compileReadingPacket,
    readingPacketToJson: (packet: unknown) => JSON.stringify(packet, null, 2),
  };
});

vi.mock("@/lib/gemini", () => ({
  hasGeminiKey: () => true,
  generateJsonCompletion: mocks.generateJsonCompletion,
  GeminiNotConfiguredError: class GeminiNotConfiguredError extends Error {},
  GeminiProviderError: class GeminiProviderError extends Error {
    status = 429;
  },
}));

vi.mock("@/lib/insights/load-pursuit-tone-goals", () => ({
  loadPursuitToneGoals: vi.fn(async (_userId: string, pursuitIds: string[]) => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    return new Map(
      pursuitIds.map((id) => [
        id,
        {
          id,
          title: id === "p-cemap" ? "CeMAP qualification" : "Test pursuit",
          description: null,
          enrichAnswers: [],
          status: id === "p-done" ? "COMPLETE" : "ACTIVE",
          significance: 4,
          deadline: now,
          targetAmount: null,
          currentAmount: null,
          milestones: [],
        },
      ]),
    );
  }),
}));

const USER_ID = "alex-carter";
const ENRICH_OPTIONS = {
  clarifyTitles: false,
} as const;

function baseDirtyAnalysis(): ReadingDirtyAnalysis {
  return {
    pursuitIds: DENSE_DIRTY_PURSUIT_IDS,
    themeIds: ["work", "finance"],
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

describe("buildReflectSystemPrompt benchmark rubric", () => {
  it("includes pursuit status rubric with MAINTAINING on full and pursuits-only scopes", () => {
    const full = buildReflectSystemPrompt(ENRICH_OPTIONS, "full");
    const scoped = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);

    for (const prompt of [full, scoped]) {
      expect(prompt).toContain("Pursuit status (status field in map context):");
      expect(prompt).toContain("- MAINTAINING —");
      expect(prompt).toContain("MUST NOT treat absent milestone movement");
      expect(prompt).toContain("- PAUSED —");
    }
  });

  it("replaces generic age/location benchmark lines with BENCHMARK & INSIGHT MOVES", () => {
    const full = buildReflectSystemPrompt(ENRICH_OPTIONS, "full");
    expect(full).toContain("BENCHMARK & INSIGHT MOVES");
    expect(full).toContain("At most one observation per pursuit.");
    expect(full).toContain("GROUNDING RULE (mandatory)");
    expect(full).toContain("TENSION, NOT FORECAST:");
    expect(full).toContain("Those two facts sit in tension.");
    expect(full).not.toContain("won or lost");
    expect(full).not.toContain("Use age/location for contextual benchmarking");
    expect(full).not.toContain(
      "When age AND location are in user context, include fromMap and/or comparison fields",
    );
    expect(full).not.toContain("optional age/location benchmark for the theme");

    const scoped = buildReflectPursuitsOnlySystemPrompt(ENRICH_OPTIONS, false);
    expect(scoped).toContain("BENCHMARK & INSIGHT MOVES");
    expect(scoped).not.toContain(
      "When age AND location are in user context, include fromMap and/or comparison fields",
    );

    expect(full).toContain("PURSUIT PANEL — MILESTONE LIST IS ON SCREEN");
    expect(scoped).toContain("Do NOT restate, enumerate, or quote milestone titles");
    expect(scoped).toContain("MUST return 1-6 chronological outcome waypoints");
    expect(scoped).toContain("PURSUIT CONTEXT PRECEDENCE");
    expect(scoped).toContain("durable interpretation context");
  });

  it("full-scope prompt steers theme synthesis as reflective-only", () => {
    const full = buildReflectSystemPrompt(ENRICH_OPTIONS, "full");
    expect(full).toContain('{ tone, oneLiner, reflective }');
    expect(full).toContain("FROM YOUR MAP — endogenous map facts only");
    expect(full).toContain("map_context and a fact the user entered there");
    expect(full).toContain("Relate pursuits to each other within the theme");
    expect(full).not.toContain("combined (UI: ACROSS PURSUITS");
    expect(full).not.toContain("contextual (UI: COMPARISON");
  });

  it("full-scope prompt includes suggestedMilestones guidance on pursuit panels", () => {
    const full = buildReflectSystemPrompt(ENRICH_OPTIONS, "full");

    expect(full).not.toContain("One concrete suggestion per pursuit, max");
    expect(full).toContain("PURSUIT PANEL — suggestedMilestones FIELD");
    expect(full).toContain("MUST return 1-6 items in suggestedMilestones");
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
    expect(block).toContain("MUST return 1-6 items in suggestedMilestones");
    expect(block).toContain("p-full: Milestones allowed");
    expect(block).toContain("suggest only missing chronological steps");
    expect(block).toContain("p-sparse: Milestones allowed");
  });
});

describe("buildPursuitsOnlyMapContext", () => {
  it("keeps dirty pursuits with same-category siblings and drops unrelated map context", () => {
    const sliced = buildPursuitsOnlyMapContext(DENSE_MAP_CONTEXT, ["p-cemap"]);
    const pursuits = sliced.themes.flatMap((theme) =>
      theme.categories.flatMap((category) => category.pursuits.map((pursuit) => pursuit.title)),
    );

    expect(sliced.themes.map((theme) => theme.id)).toEqual(["work"]);
    expect(sliced.themes[0]?.categories.map((category) => category.id)).toEqual(["cat-job"]);
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
      metrics,
    );

    assertReflectPursuitCompleteness(DENSE_DIRTY_PURSUIT_IDS, reflect);
    expect(Object.keys(reflect.pursuits)).toHaveLength(12);
    expect(reflect.themes?.work?.oneLiner).toBeTruthy();
    expect(metrics.readingPacketChars).toBeGreaterThan(0);
    expect(metrics.systemPromptChars).toBeGreaterThan(0);
    expect(metrics.mapContextChars).toBeGreaterThan(0);
    expect(metrics.userPromptChars).toBeGreaterThan(0);
    expect(metrics.reflectFullCalls).toBe(1);
    expect(metrics.reflectScopedCalls).toBe(0);
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
      metrics,
    );

    expect(metrics.reflectResponseChars).toBeGreaterThan(2800);
    expect(metrics.reflectResponseChars).toBeLessThanOrEqual(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
  });

  it("sends sliced same-category map context for pursuit-only reflect", async () => {
    mocks.generateJsonCompletion.mockResolvedValue(
      JSON.stringify({
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
    expect(user).toContain("<pursuit_tone_guidance>");
    expect(user).toContain("Tone: worth_a_look");
    expect(user).toContain('Return ONLY: { "pursuits": { ... } }');
  });

  it("sends confirmedRelationships only in reading_packet on full reflect — not in map_context", async () => {
    const complete = buildDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    mocks.generateJsonCompletion.mockResolvedValue(JSON.stringify(complete));

    await generateReflectResponse(
      USER_ID,
      baseDirtyAnalysis(),
      DENSE_DIRTY_PURSUIT_IDS,
      ["work", "finance"],
      ENRICH_OPTIONS,
      emptyMapAiSyncMetrics(),
      { scope: "full" },
    );

    const user = (mocks.generateJsonCompletion.mock.calls[0]?.[0] as { user: string }).user;
    const packetBlock = user.match(/<reading_packet>\n([\s\S]*?)\n<\/reading_packet>/)?.[1] ?? "";
    const mapContextBlock = user.match(/<map_context>\n([\s\S]*?)\n<\/map_context>/)?.[1] ?? "";

    expect(packetBlock).toContain("confirmedRelationships");
    expect(packetBlock).toContain("Senior Engineer at Acme");
    expect(packetBlock).toContain("CeMAP qualification");
    expect(mapContextBlock).not.toContain("confirmedRelationships");
    expect(mapContextBlock).toContain("CeMAP qualification");
  });

  it("schema-max 12-dirty output fits within 8192-token reflect budget", () => {
    const maxLoaded = buildMaxLoadedDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    const chars = JSON.stringify(maxLoaded).length;

    // Prior 2048-token ceiling truncated 15-pursuit Alex first refresh into invalid JSON.
    expect(chars).toBe(20861);
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
      metrics,
    );

    expect(mocks.generateJsonCompletion).toHaveBeenCalledTimes(2);
    assertReflectPursuitCompleteness(fifteenIds, reflect);
    expect(reflect.themes?.work?.oneLiner).toBeTruthy();
    expect(metrics.reflectResponseChars).toBeGreaterThan(0);
  });
});
