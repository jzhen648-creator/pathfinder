import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const source = (relativePath: string): string =>
  readFileSync(resolve(ROOT, relativePath), "utf8");

describe("current Almanac runtime boundary", () => {
  it("has no routable V1, internal-AI, voice or registration surface", () => {
    const removed = [
      "src/app/onboarding/page.tsx",
      "src/app/api/transcribe/route.ts",
      "src/app/api/transcribe/status/route.ts",
      "src/app/api/auth/register/route.ts",
      "src/app/api/auth/mobile-register/route.ts",
      "src/app/api/auth/mobile-anonymous/route.ts",
      "src/app/api/auth/mobile-claim/route.ts",
      "src/app/api/auth/mobile-merge/route.ts",
    ];
    for (const path of removed) expect(existsSync(resolve(ROOT, path)), path).toBe(false);
  });

  it("does not impose Atlas position or capacity semantics on Subjects", () => {
    const service = source("src/lib/almanac/service.ts");
    expect(service).not.toContain("ATLAS_DISPERSION_ORDER");
    expect(service).not.toContain("AlmanacCapacityError");
    expect(service).not.toContain("slot: { in:");
    expect(service).toContain("places.reduce((highest, place) => Math.max(highest, place.slot), -1) + 1");
  });

  it("keeps health and current routes free of retired internal AI dependencies", () => {
    const health = source("src/app/api/health/route.ts");
    const current = [
      health,
      source("src/app/api/almanac/route.ts"),
      source("src/app/api/almanac/imports/route.ts"),
      source("src/app/api/almanac/places/[placeId]/route.ts"),
    ].join("\n");
    expect(current).not.toMatch(/GEMINI|OPENAI|reflect|deliveryBypass|@\/lib\/(?:ai|pursuit|timeline|voice)/u);
  });
});
