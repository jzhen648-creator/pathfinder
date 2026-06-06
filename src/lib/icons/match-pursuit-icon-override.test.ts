import assert from "node:assert/strict";
import { getLucideInstalledSlugs, isValidLucideSlug } from "@/lib/icons/enumerate-lucide-slugs";
import { matchPreferredOverrideIconSlug } from "@/lib/icons/match-pursuit-icon-override";

const slugs = getLucideInstalledSlugs();
assert.ok(slugs.length > 1000);
assert.equal(isValidLucideSlug("dumbbell"), true);
assert.equal(isValidLucideSlug("not-a-real-icon-slug"), false);

assert.equal(matchPreferredOverrideIconSlug("Build emergency fund"), "shield-check");
assert.equal(matchPreferredOverrideIconSlug("Plan Invisalign"), null);
assert.equal(matchPreferredOverrideIconSlug("Gym strength training"), "dumbbell");

console.log("match-pursuit-icon-override.test.ts passed");
