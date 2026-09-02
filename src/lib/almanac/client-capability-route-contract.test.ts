import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const guardedRouteFiles = [
  "src/app/api/almanac/route.ts",
  "src/app/api/almanac/imports/route.ts",
  "src/app/api/almanac/imports/[importId]/route.ts",
  "src/app/api/almanac/imports/[importId]/undo/route.ts",
  "src/app/api/almanac/places/[placeId]/route.ts",
  "src/app/api/almanac/subjects/[subjectId]/route.ts",
  "src/app/api/almanac/subjects/[subjectId]/updates/route.ts",
  "src/app/api/almanac/subjects/[subjectId]/unmerge/route.ts",
  "src/app/api/almanac/subjects/merge/route.ts",
  "src/app/api/almanac/updates/[updateId]/route.ts",
];

describe("Almanac USER_ENTRY route compatibility boundary", () => {
  it.each(guardedRouteFiles)("guards every source or projection response in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    expect(source).toContain("almanacUserEntryCapabilityGuard");
    expect(source).toContain("almanacUserEntrySafeJson");
    expect(source.match(/almanacUserEntryCapabilityGuard\s*\(/gu)?.length).toBeGreaterThanOrEqual(1);
    expect(source.match(/almanacUserEntrySafeJson\s*\(/gu)?.length).toBeGreaterThanOrEqual(1);
  });

  it("requires the capability unconditionally on the direct-write route", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/almanac/subjects/[subjectId]/updates/route.ts"),
      "utf8",
    );
    expect(source).toContain("{ directWrite: true }");
  });

  it("allows the capability header through the development web CORS boundary", () => {
    const middleware = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).toContain("X-Almanac-Capabilities");
  });
});
