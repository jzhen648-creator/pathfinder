import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateReflectResponse } from "@/lib/ai/generate-reflect";
import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { emptyMapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
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
  suggestConnections: false,
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
      ENRICH_OPTIONS,
      "",
      metrics,
    );

    assertReflectPursuitCompleteness(DENSE_DIRTY_PURSUIT_IDS, reflect);
    expect(Object.keys(reflect.pursuits)).toHaveLength(12);
    expect(metrics.readingPacketChars).toBeGreaterThan(0);
    // Minimal per-pursuit mock (~short headline/body) — measures baseline, not schema-max load.
    expect(metrics.reflectResponseChars).toBe(2823);
    expect(metrics.reflectResponseChars).toBeLessThanOrEqual(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
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
      ENRICH_OPTIONS,
      "",
      metrics,
    );

    expect(metrics.reflectResponseChars).toBe(2823);
    expect(metrics.reflectResponseChars).toBeLessThanOrEqual(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
  });

  it("documents truncation risk: schema-max 12-dirty output exceeds safe char budget", () => {
    const maxLoaded = buildMaxLoadedDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS);
    const chars = JSON.stringify(maxLoaded).length;

    // 12 dirty × ~600–900 chars + 900 reading ≈ 8–11 panels before 2048-token ceiling.
    expect(chars).toBeGreaterThan(REFLECT_OUTPUT_CHAR_SAFE_LIMIT);
    expect(chars).toBe(21834);
  });
});
