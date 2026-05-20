import assert from "node:assert/strict";
import {
  buildStreamNarrativeUserMessage,
  STREAM_NARRATIVE_MAX_WORDS,
  STREAM_NARRATIVE_SYSTEM_PROMPT,
  truncateStreamNarrative,
} from "./stream-extract-narrative";

assert.ok(STREAM_NARRATIVE_SYSTEM_PROMPT.includes(String(STREAM_NARRATIVE_MAX_WORDS)));
assert.ok(STREAM_NARRATIVE_SYSTEM_PROMPT.includes("second-person"));
assert.ok(STREAM_NARRATIVE_SYSTEM_PROMPT.includes("JSON"));
assert.ok(!STREAM_NARRATIVE_SYSTEM_PROMPT.includes("paragraph"));
assert.ok(!STREAM_NARRATIVE_SYSTEM_PROMPT.includes("mapping"));

const userMessage = buildStreamNarrativeUserMessage("Work", "Shipped the release.");
assert.ok(userMessage.includes("Shipped the release."));
assert.ok(userMessage.includes(`at most ${STREAM_NARRATIVE_MAX_WORDS} words`));

assert.equal(truncateStreamNarrative(""), "");
assert.equal(truncateStreamNarrative("   \n\t  "), "");
assert.equal(
  truncateStreamNarrative("You\nfelt\ngreat."),
  "You felt great.",
);

assert.equal(
  truncateStreamNarrative("You felt great! And you also mentioned travel plans for summer."),
  "You felt great!",
);

const twentyOneWords = Array.from({ length: 21 }, (_, i) => `word${i + 1}`).join(" ");
const truncated = truncateStreamNarrative(twentyOneWords);
assert.equal(truncated.split(/\s+/).length, STREAM_NARRATIVE_MAX_WORDS);

const longFirstSentence = `${Array.from({ length: 25 }, (_, i) => `word${i + 1}`).join(" ")}. Second sentence here.`;
assert.equal(
  truncateStreamNarrative(longFirstSentence).split(/\s+/).length,
  STREAM_NARRATIVE_MAX_WORDS,
);

console.log("stream-extract-narrative.test.ts: ok");
