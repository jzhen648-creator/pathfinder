import assert from "node:assert/strict";
import {
  formatPreviousStreamSessionDumps,
  formatPreviousStreamSessionSummary,
  preprocessStreamExtractJson,
  STREAM_EXTRACT_SYSTEM_PROMPT,
  STREAM_EXTRACT_THEME_SYSTEM_PROMPT,
} from "./stream-extract";
import { streamExtractResponseSchema } from "@/types/stream";

assert.equal(formatPreviousStreamSessionSummary([]), "None yet");
assert.equal(formatPreviousStreamSessionSummary(["A", "B"]), "A, B");
assert.ok(STREAM_EXTRACT_SYSTEM_PROMPT.includes("narrativeSentence"));
assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("narrativeSentence"));
assert.ok(STREAM_EXTRACT_SYSTEM_PROMPT.includes("confidence < 0.65"));
assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("confidence < 0.65"));
assert.ok(STREAM_EXTRACT_SYSTEM_PROMPT.includes("Skills / Career"));
assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("Appearance / Inner life"));

assert.equal(formatPreviousStreamSessionDumps([]), "None yet");

const formatted = formatPreviousStreamSessionDumps([
  {
    inputText: "First dump",
    inputMode: "text",
    createdAt: new Date("2026-05-10T12:00:00.000Z"),
  },
  {
    inputText: "Second dump",
    inputMode: "voice",
    createdAt: new Date("2026-05-12T12:00:00.000Z"),
  },
]);

assert.ok(formatted.includes("### Session 1 (2026-05-10, text)"));
assert.ok(formatted.includes("First dump"));
assert.ok(formatted.includes("### Session 2 (2026-05-12, voice)"));
assert.ok(formatted.includes("Second dump"));

const withNullParentRef = preprocessStreamExtractJson({
  narrativeSentence: "  You are sorting what matters next.  ",
  marks: [],
  pursuits: [
    {
      title: "Ship v1",
      goalType: "project",
      bloomStatus: "ACTIVE",
      parentRef: null,
      clientKey: null,
      hubId: null,
    },
  ],
  milestones: [
    { title: "Phase 1", pursuitRef: null, hubId: null },
    { title: "Bad ref", pursuitRef: { kind: "existing" }, hubId: null },
    {
      title: "Good ref",
      pursuitRef: { kind: "new", clientKey: "pursuit-1" },
    },
  ],
  ambiguous: [
    {
      id: "amb-1",
      label: "Work confidence",
      reason: null,
      confidence: "0.52",
      hubId: null,
    },
  ],
  clarifyingQuestion: null,
  itemOrder: [],
});

const parsedNulls = streamExtractResponseSchema.safeParse(withNullParentRef);
assert.equal(parsedNulls.success, true);
if (parsedNulls.success) {
  assert.equal(parsedNulls.data.narrativeSentence, "You are sorting what matters next.");
  assert.equal(parsedNulls.data.pursuits.length, 1);
  assert.equal(parsedNulls.data.pursuits[0]?.parentRef, undefined);
  assert.equal(parsedNulls.data.milestones.length, 1);
  assert.equal(parsedNulls.data.milestones[0]?.title, "Good ref");
  assert.equal(parsedNulls.data.ambiguous[0]?.confidence, 0.52);
  assert.equal(parsedNulls.data.ambiguous[0]?.hubId, undefined);
}

console.log("stream-extract-sessions.test.ts: ok");
