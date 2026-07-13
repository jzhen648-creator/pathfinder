import { describe, expect, it } from "vitest";

import {
  composeInsightCacheMapVersion,
  isPromptVersionStale,
  parseStoredInsightCacheMapVersion,
  REFLECT_PROMPT_VERSION,
} from "@/lib/insights/reflect-prompt-version";
import {
  isPromptOnlyReadingDrift,
  isReadingDrift,
} from "@/lib/insights/reading-cache-stale";

const MAP_HASH = "abc123def4567890abcdef1234567890";

describe("reflect-prompt-version", () => {
  it("composeInsightCacheMapVersion appends current prompt suffix", () => {
    expect(composeInsightCacheMapVersion(MAP_HASH)).toBe(
      `${MAP_HASH}:${REFLECT_PROMPT_VERSION}`,
    );
  });

  it("parseStoredInsightCacheMapVersion splits composed values", () => {
    expect(parseStoredInsightCacheMapVersion(`${MAP_HASH}:${REFLECT_PROMPT_VERSION}`)).toEqual({
      mapHash: MAP_HASH,
      promptVersion: REFLECT_PROMPT_VERSION,
    });
  });

  it("parseStoredInsightCacheMapVersion treats legacy plain hash as no prompt version", () => {
    expect(parseStoredInsightCacheMapVersion(MAP_HASH)).toEqual({
      mapHash: MAP_HASH,
      promptVersion: null,
    });
  });

  it("isPromptVersionStale is true for legacy and outdated suffixes", () => {
    expect(isPromptVersionStale(MAP_HASH)).toBe(true);
    expect(isPromptVersionStale(`${MAP_HASH}:2026-01-01-old`)).toBe(true);
    expect(isPromptVersionStale(`${MAP_HASH}:${REFLECT_PROMPT_VERSION}`)).toBe(false);
  });
});

describe("reading-cache-stale", () => {
  const row = (mapVersion: string, memoryVersion = 1) => ({ mapVersion, memoryVersion });

  it("isReadingDrift is false when composed mapVersion and memory match", () => {
    expect(
      isReadingDrift(
        row(composeInsightCacheMapVersion(MAP_HASH)),
        MAP_HASH,
        1,
      ),
    ).toBe(false);
  });

  it("isReadingDrift is true for legacy plain-hash rows", () => {
    expect(isReadingDrift(row(MAP_HASH), MAP_HASH, 1)).toBe(true);
  });

  it("isReadingDrift is true when prompt suffix is outdated", () => {
    expect(isReadingDrift(row(`${MAP_HASH}:2026-01-01-old`), MAP_HASH, 1)).toBe(true);
  });

  it("isReadingDrift is true when map hash drifts", () => {
    expect(
      isReadingDrift(
        row(composeInsightCacheMapVersion("other-hash")),
        MAP_HASH,
        1,
      ),
    ).toBe(true);
  });

  it("isReadingDrift is true when memoryVersion drifts", () => {
    expect(
      isReadingDrift(row(composeInsightCacheMapVersion(MAP_HASH)), MAP_HASH, 2),
    ).toBe(true);
  });

  it("isPromptOnlyReadingDrift is true when only prompt suffix is stale", () => {
    expect(isPromptOnlyReadingDrift(row(MAP_HASH), MAP_HASH, 1)).toBe(true);
    expect(
      isPromptOnlyReadingDrift(row(`${MAP_HASH}:2026-01-01-old`), MAP_HASH, 1),
    ).toBe(true);
  });

  it("isPromptOnlyReadingDrift is false when map hash or memory also drift", () => {
    expect(
      isPromptOnlyReadingDrift(row(`${MAP_HASH}:2026-01-01-old`), "other-hash", 1),
    ).toBe(false);
    expect(
      isPromptOnlyReadingDrift(row(`${MAP_HASH}:2026-01-01-old`), MAP_HASH, 2),
    ).toBe(false);
  });

  it("isPromptOnlyReadingDrift is false when cache is current", () => {
    expect(
      isPromptOnlyReadingDrift(row(composeInsightCacheMapVersion(MAP_HASH)), MAP_HASH, 1),
    ).toBe(false);
  });
});
