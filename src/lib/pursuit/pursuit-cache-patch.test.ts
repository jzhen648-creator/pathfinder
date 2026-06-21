import { describe, expect, it } from "vitest";

import { resolvePreservedThemeText } from "@/lib/pursuit/pursuit-cache-patch";

describe("resolvePreservedThemeText", () => {
  const gate = (text: string) => text;

  it("does not resurrect cached text when reflect returned an empty field", () => {
    expect(resolvePreservedThemeText("", "stale editorial benchmark", gate)).toBe("");
  });

  it("falls back to cached when reflect omitted the field", () => {
    expect(resolvePreservedThemeText(undefined, "cached line", gate)).toBe("cached line");
  });
});
