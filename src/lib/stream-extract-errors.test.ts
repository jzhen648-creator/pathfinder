import assert from "node:assert/strict";
import {
  STREAM_EXTRACT_SERVICE_ERROR_MESSAGE,
  streamExtractCatchMessage,
  streamExtractFailureStatus,
  streamExtractUserMessage,
} from "./stream-extract-errors";

assert.equal(streamExtractUserMessage(502), STREAM_EXTRACT_SERVICE_ERROR_MESSAGE);
assert.equal(streamExtractUserMessage(500), STREAM_EXTRACT_SERVICE_ERROR_MESSAGE);
assert.equal(
  streamExtractUserMessage(429),
  "Stream hit a temporary rate limit — wait a moment and try again.",
);
assert.equal(streamExtractUserMessage(401), "You'll need to sign in again to keep streaming.");
assert.equal(streamExtractUserMessage(503), "Stream isn't available right now — try again in a moment.");
assert.equal(streamExtractFailureStatus({ status: 429 }), 429);
assert.equal(streamExtractFailureStatus(new Error("429 status code (no body)")), 429);
assert.equal(streamExtractFailureStatus(new Error("quota exceeded")), 429);
assert.equal(streamExtractFailureStatus(new Error("Model returned invalid JSON.")), 502);
assert.match(streamExtractCatchMessage(new Error("429 status code (no body)")), /rate limit/);
assert.match(streamExtractCatchMessage(new Error("fetch failed")), /listening/);

console.log("stream-extract-errors.test.ts: ok");
