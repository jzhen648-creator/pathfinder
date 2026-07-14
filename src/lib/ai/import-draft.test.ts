import { describe, expect, it } from "vitest";

import {
  MAX_DRAFT_CHAPTERS,
  buildImportDraftSystemPrompt,
  importDraftRequestSchema,
  normalizeImportDraftResponse,
} from "@/lib/ai/import-draft";

describe("importDraftRequestSchema", () => {
  it("rejects empty text and accepts trimmed content", () => {
    expect(importDraftRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(importDraftRequestSchema.safeParse({ text: "  save more money  " }).success).toBe(true);
  });

  it("rejects text over the char cap", () => {
    expect(importDraftRequestSchema.safeParse({ text: "x".repeat(20_001) }).success).toBe(false);
  });
});

describe("buildImportDraftSystemPrompt", () => {
  it("lists real theme ids and forbids invention", () => {
    const prompt = buildImportDraftSystemPrompt();
    expect(prompt).toContain("finance");
    expect(prompt).toContain("health");
    expect(prompt.toLowerCase()).toContain("do not invent");
  });
});

describe("normalizeImportDraftResponse", () => {
  it("keeps valid chapters, clamps significance, coerces confidence", () => {
    const out = normalizeImportDraftResponse({
      chapters: [
        { title: "Clear the credit card", themeId: "finance", significance: 5, confidence: 1.4 },
        { title: "Run a marathon", themeId: "health", significance: 0, targetDate: "2027-04-26", confidence: -1 },
      ],
    });
    expect(out.chapters).toEqual([
      { title: "Clear the credit card", themeId: "finance", significance: 3, targetDate: null, confidence: 1 },
      { title: "Run a marathon", themeId: "health", significance: 1, targetDate: "2027-04-26", confidence: 0 },
    ]);
  });

  it("drops chapters with no title or an invented theme id", () => {
    const out = normalizeImportDraftResponse({
      chapters: [
        { title: "", themeId: "finance", significance: 2 },
        { title: "Learn Spanish", themeId: "languages", significance: 2 },
        { title: "Meditate daily", themeId: "becoming", significance: 2 },
      ],
    });
    expect(out.chapters.map((c) => c.title)).toEqual(["Meditate daily"]);
  });

  it("strips trailing punctuation and dedupes by title within a theme", () => {
    const out = normalizeImportDraftResponse({
      chapters: [
        { title: "Save more.", themeId: "finance", significance: 2 },
        { title: "save more", themeId: "finance", significance: 3 },
        { title: "Save more", themeId: "health", significance: 2 },
      ],
    });
    // First two collapse (same theme+title); the health one is distinct.
    expect(out.chapters).toEqual([
      { title: "Save more", themeId: "finance", significance: 2, targetDate: null, confidence: 0.5 },
      { title: "Save more", themeId: "health", significance: 2, targetDate: null, confidence: 0.5 },
    ]);
  });

  it("rejects malformed dates, keeping targetDate null", () => {
    const out = normalizeImportDraftResponse({
      chapters: [{ title: "Trip", themeId: "pleasures", significance: 1, targetDate: "next summer" }],
    });
    expect(out.chapters[0]?.targetDate).toBeNull();
  });

  it("caps the list and survives non-object input", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `Chapter ${i}`,
      themeId: "work",
      significance: 2,
    }));
    expect(normalizeImportDraftResponse({ chapters: many }).chapters).toHaveLength(MAX_DRAFT_CHAPTERS);
    expect(normalizeImportDraftResponse(null).chapters).toEqual([]);
    expect(normalizeImportDraftResponse({ chapters: "nope" }).chapters).toEqual([]);
  });
});
