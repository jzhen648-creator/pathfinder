import { describe, expect, it } from "vitest";
import {
  ALMANAC_SUBJECT_ICON_KEYS,
  ALMANAC_SUBJECT_ICON_REGISTRY_VERSION,
} from "@/lib/almanac/subject-icons";

describe("Subject icon API registry", () => {
  it("keeps the original eight keys and a bounded versioned vocabulary", () => {
    expect(ALMANAC_SUBJECT_ICON_REGISTRY_VERSION).toBe(1);
    expect(ALMANAC_SUBJECT_ICON_KEYS.length).toBeGreaterThanOrEqual(60);
    expect(ALMANAC_SUBJECT_ICON_KEYS.length).toBeLessThanOrEqual(80);
    expect(new Set(ALMANAC_SUBJECT_ICON_KEYS).size).toBe(ALMANAC_SUBJECT_ICON_KEYS.length);
    expect(ALMANAC_SUBJECT_ICON_KEYS).toEqual(expect.arrayContaining([
      "activity",
      "book-open",
      "briefcase-business",
      "circle",
      "compass",
      "house",
      "landmark",
      "wallet",
    ]));
  });
});
