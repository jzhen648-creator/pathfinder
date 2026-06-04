import assert from "node:assert/strict";
import { sanitizeThemeLabelsInText } from "@/lib/life-areas";
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
  opening: "Who I'm Becoming is empty.",
  strengths: [],
  gaps: [{ pursuitTitle: "Who im becoming", body: "No pursuits yet." }],
  comparison: "",
  focus: "",
  closing: "",
});
assert.equal(sanitized.opening, "Self & Mind is empty.");
assert.equal(sanitized.gaps[0]?.pursuitTitle, "Self & Mind");

console.log("sanitize-story.test.ts ok");
