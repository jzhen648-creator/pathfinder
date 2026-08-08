import { describe, expect, it } from "vitest";
import {
  findExactDuplicate,
  fingerprintSource,
  fragmentMatchesSource,
  normalizeSourceText,
  normalizeSourceUrl,
} from "./source-identity";

describe("source identity", () => {
  it("normalizes transport whitespace without changing meaningful internal spacing", () => {
    expect(normalizeSourceText("\uFEFF  Keep  This\r\n\r\n\r\nNext\tline  ")).toBe(
      "Keep  This\n\nNext\tline",
    );
  });

  it("generates the same exact fingerprint for equivalent line endings and spacing", () => {
    const left = fingerprintSource({
      contentType: "TEXT",
      rawText: "I may leave my job.\r\nNeed a runway.",
    });
    const right = fingerprintSource({
      contentType: "TEXT",
      rawText: "I may leave my job.\nNeed a runway. ",
    });

    expect(left).toBe(right);
  });

  it("keeps materially different words distinct", () => {
    expect(
      fingerprintSource({ contentType: "TEXT", rawText: "I may leave my job." }),
    ).not.toBe(fingerprintSource({ contentType: "TEXT", rawText: "I will leave my job." }));
  });

  it("normalizes URL fragments but preserves the rest of the URL", () => {
    expect(normalizeSourceUrl(" https://EXAMPLE.com/path?q=1#section ")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("keeps capture URL out of canonical content identity", () => {
    const left = fingerprintSource({
      contentType: "TEXT",
      rawText: "The same selected passage.",
      sourceUrl: "https://chatgpt.com/c/one",
    });
    const right = fingerprintSource({
      contentType: "TEXT",
      rawText: "The same selected passage.",
      sourceUrl: "https://claude.ai/chat/two",
    });
    expect(left).toBe(right);
  });

  it("chooses the oldest non-deleted exact duplicate deterministically", () => {
    const match = findExactDuplicate("same", [
      { id: "new", contentHash: "same", createdAt: new Date("2026-08-02") },
      {
        id: "deleted",
        contentHash: "same",
        createdAt: new Date("2026-07-01"),
        deletedAt: new Date("2026-07-02"),
      },
      { id: "old", contentHash: "same", createdAt: new Date("2026-08-01") },
    ]);

    expect(match?.id).toBe("old");
  });

  it("validates exact source-fragment provenance", () => {
    const rawText = "Health matters. Career is changing.";
    expect(
      fragmentMatchesSource(rawText, {
        startOffset: 16,
        endOffset: 35,
        text: "Career is changing.",
      }),
    ).toBe(true);
    expect(
      fragmentMatchesSource(rawText, {
        startOffset: 16,
        endOffset: 35,
        text: "Career might change.",
      }),
    ).toBe(false);
  });
});
