import { describe, expect, it } from "vitest";
import {
  benchmarkFactsApplicable,
  buildBenchmarkFactsBlock,
  parseDobDateFromUserContext,
  parseDobFromUserContext,
  type BenchmarkPursuitRow,
} from "@/lib/insights/benchmark-facts";

function financePursuit(overrides: Partial<BenchmarkPursuitRow> = {}): BenchmarkPursuitRow {
  return {
    id: "p1",
    themeId: "finance",
    title: "Build ISA",
    enrichAnswerCount: 0,
    ...overrides,
  };
}

function healthPursuit(overrides: Partial<BenchmarkPursuitRow> = {}): BenchmarkPursuitRow {
  return {
    id: "h1",
    themeId: "health",
    title: "Half marathon",
    enrichAnswerCount: 0,
    hasDeadline: true,
    ...overrides,
  };
}

describe("benchmarkFactsApplicable — finance/work locale gating", () => {
  it("suppresses finance benchmarks when location is empty", () => {
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, null),
    ).toBe(false);
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, ""),
    ).toBe(false);
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, "   "),
    ).toBe(false);
  });

  it("suppresses finance benchmarks for clearly non-UK location", () => {
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, "France"),
    ).toBe(false);
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, "Tokyo, Japan"),
    ).toBe(false);
  });

  it("allows finance benchmarks for UK-looking location with profile signal", () => {
    expect(
      benchmarkFactsApplicable("finance", [financePursuit()], 30, "London, UK"),
    ).toBe(true);
    expect(
      benchmarkFactsApplicable("work", [financePursuit({ themeId: "work", title: "CeMAP" })], 28, "Manchester"),
    ).toBe(true);
  });

  it("suppresses finance benchmarks for quantified pursuits when location is empty", () => {
    expect(
      benchmarkFactsApplicable(
        "finance",
        [financePursuit({ targetAmount: 500_000, currentAmount: 50_000, unit: "GBP" })],
        null,
        null,
      ),
    ).toBe(false);
  });
});

describe("buildBenchmarkFactsBlock — finance rarity signal", () => {
  it("includes ISA max-out rarity line for UK finance theme", () => {
    const block = buildBenchmarkFactsBlock({
      age: 30,
      location: "London, UK",
      themeIds: ["finance"],
      pursuits: [financePursuit({ targetAmount: 500_000, currentAmount: 20_000, unit: "GBP" })],
    });
    expect(block).not.toBeNull();
    expect(block).toContain("relatively few UK ISA holders max the £20k annual subscription");
  });
});

describe("benchmarkFactsApplicable — health unchanged", () => {
  it("requires full profile (age and location) for health benchmarks", () => {
    expect(
      benchmarkFactsApplicable("health", [healthPursuit()], 30, null),
    ).toBe(false);
    expect(
      benchmarkFactsApplicable("health", [healthPursuit()], null, "Tokyo, Japan"),
    ).toBe(false);
    expect(
      benchmarkFactsApplicable("health", [healthPursuit()], 30, "Tokyo, Japan"),
    ).toBe(true);
  });
});

describe("parseDobFromUserContext", () => {
  it("parses ISO date of birth from user context", () => {
    const context = [
      "Today: 2026-07-04",
      "",
      "User context:",
      "Name: Alex",
      "Date of birth: 2007-03-15",
      "Age: 19",
    ].join("\n");
    expect(parseDobFromUserContext(context)).toBe("2007-03-15");
    expect(parseDobDateFromUserContext(context)?.toISOString()).toBe("2007-03-15T00:00:00.000Z");
  });

  it("returns null when date of birth is absent", () => {
    expect(parseDobFromUserContext("Age: 19\nLocation: London")).toBeNull();
  });
});
