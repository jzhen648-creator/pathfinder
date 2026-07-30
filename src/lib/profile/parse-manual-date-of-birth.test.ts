import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MINIMUM_AGE_YEARS,
  parseManualDateOfBirth,
} from "./parse-manual-date-of-birth";

describe("parseManualDateOfBirth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes through undefined (omit from update)", () => {
    expect(parseManualDateOfBirth(undefined)).toBeUndefined();
  });

  it("clears on null or blank", () => {
    expect(parseManualDateOfBirth(null)).toBeNull();
    expect(parseManualDateOfBirth("")).toBeNull();
    expect(parseManualDateOfBirth("   ")).toBeNull();
  });

  it(`rejects ages under ${MINIMUM_AGE_YEARS}`, () => {
    // Born 2020-01-01 → age 6 on the frozen clock
    expect(() => parseManualDateOfBirth("2020-01-01T00:00:00.000Z")).toThrow(
      `You must be at least ${MINIMUM_AGE_YEARS} years old.`,
    );
  });

  it(`accepts exactly ${MINIMUM_AGE_YEARS} years old`, () => {
    const exactly13 = new Date("2026-07-30T12:00:00.000Z");
    exactly13.setFullYear(exactly13.getFullYear() - MINIMUM_AGE_YEARS);
    const parsed = parseManualDateOfBirth(exactly13.toISOString());
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe(exactly13.toISOString());
  });

  it("accepts older dates", () => {
    const parsed = parseManualDateOfBirth("1995-06-15T00:00:00.000Z");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe("1995-06-15T00:00:00.000Z");
  });

  it("rejects invalid ISO strings", () => {
    expect(() => parseManualDateOfBirth("not-a-date")).toThrow(
      "dateOfBirth must be a valid ISO date string",
    );
  });
});
