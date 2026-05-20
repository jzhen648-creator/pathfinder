import assert from "node:assert/strict";
import {
  STREAM_EXTRACT_EMPTY_MESSAGE,
  streamExtractCatchMessage,
  streamExtractUserMessage,
} from "./stream-extract-errors";

assert.equal(streamExtractUserMessage(502), STREAM_EXTRACT_EMPTY_MESSAGE);
assert.equal(streamExtractUserMessage(401), "You'll need to sign in again to keep streaming.");
assert.equal(streamExtractUserMessage(503), "Stream isn't available right now — try again in a moment.");
assert.match(streamExtractCatchMessage(new Error("fetch failed")), /listening/);

console.log("stream-extract-errors.test.ts: ok");
