import { describe, expect, it } from "vitest";
import { parseAlmanacDogfoodFlag } from "@/lib/almanac/feature";

describe("persisted Almanac server flag", () => {
  it("fails closed", () => {
    for (const value of [undefined, "", "0", "false", "TRUE"]) {
      expect(parseAlmanacDogfoodFlag(value)).toBe(false);
    }
  });

  it("accepts only explicit enabled values", () => {
    expect(parseAlmanacDogfoodFlag("1")).toBe(true);
    expect(parseAlmanacDogfoodFlag("true")).toBe(true);
  });
});
