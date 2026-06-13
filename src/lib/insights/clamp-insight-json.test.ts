import assert from "node:assert/strict";
import {
  normalizePursuitInsightTone,
  clampInsightGenerationJson,
} from "@/lib/insights/clamp-insight-json";

assert.equal(normalizePursuitInsightTone("reality check"), "reality_check");
assert.equal(normalizePursuitInsightTone("one-off"), "informational");
assert.equal(normalizePursuitInsightTone("encouraging"), "encouraging");

const clamped = clampInsightGenerationJson({
  pursuits: {
    g1: {
      insight: { tone: "Reality Check", headline: "x".repeat(120), body: "ok" },
    },
  },
}) as { pursuits: { g1: { insight: { tone: string; headline: string } } } };

assert.equal(clamped.pursuits.g1.insight.tone, "reality_check");
assert.equal(clamped.pursuits.g1.insight.headline.length, 100);

console.log("clamp-insight-json.test.ts ok");
