import assert from "node:assert/strict";
import { sanitizeThemeLabelsInText } from "@/lib/life-areas";
import { STORY_SCHEMA_VERSION } from "./story-types";
import { sanitizeStoryGeneration } from "./sanitize-story";

assert.equal(
  sanitizeThemeLabelsInText("Momentum on Who I'm Becoming is thin."),
  "Momentum on Self & Mind is thin.",
);
assert.equal(
  sanitizeThemeLabelsInText("who im becoming has no active pursuits"),
  "Self & Mind has no active pursuits",
);

const sanitized = sanitizeStoryGeneration({
  schemaVersion: STORY_SCHEMA_VERSION,
  opening: "Who I'm Becoming is quiet while Work & Career leads.",
  focus: "Keep building on your named pursuit.",
});
assert.equal(sanitized.opening, "Self & Mind is quiet while Work & Career leads.");

console.log("sanitize-story.test.ts ok");
