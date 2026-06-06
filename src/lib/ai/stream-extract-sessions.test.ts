import assert from "node:assert/strict";
import {
  formatPreviousStreamSessionDumps,
  formatPreviousStreamSessionSummary,
  preprocessStreamExtractJson,
  STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT,
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
assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("Self & Mind theme boundaries"));
assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("mind & emotions"));
assert.ok(STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT.includes("purpose & values"));

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

const longDump = `${"This is a useful sentence. ".repeat(30)}This tail should not survive.`;
const cappedDumps = formatPreviousStreamSessionDumps([
  {
    inputText: "Dropped oldest dump",
    inputMode: "text",
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
  },
  {
    inputText: "Kept first dump",
    inputMode: "text",
    createdAt: new Date("2026-05-02T12:00:00.000Z"),
  },
  {
    inputText: longDump,
    inputMode: "voice",
    createdAt: new Date("2026-05-03T12:00:00.000Z"),
  },
  {
    inputText: "Kept last dump",
    inputMode: "text",
    createdAt: new Date("2026-05-04T12:00:00.000Z"),
  },
]);

assert.ok(!cappedDumps.includes("Dropped oldest dump"));
assert.equal((cappedDumps.match(/### Session/g) ?? []).length, 3);
assert.ok(cappedDumps.includes("Kept first dump"));
assert.ok(!cappedDumps.includes("This tail should not survive"));
assert.ok(cappedDumps.includes("..."));

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
