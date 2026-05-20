/** Friendly assistant copy when Stream extract returns nothing useful (default for most failures). */
export const STREAM_EXTRACT_EMPTY_MESSAGE =
  "I didn't pick up anything concrete from that — try telling me a bit more about what you're working on or what happened.";

/** Map extract / narrative API status codes to user-facing assistant messages. */
export function streamExtractUserMessage(status: number, _serverError?: string | null): string {
  switch (status) {
    case 401:
      return "You'll need to sign in again to keep streaming.";
    case 503:
      return "Stream isn't available right now — try again in a moment.";
    case 400:
      return "That didn't come through clearly — try adding a little more detail.";
    case 404:
      return "We couldn't find that hub on your map.";
    case 502:
    case 500:
    default:
      return STREAM_EXTRACT_EMPTY_MESSAGE;
  }
}

/** Network / thrown errors during extract (no HTTP status). */
export function streamExtractCatchMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("unauthorized") || m.includes("401")) {
      return streamExtractUserMessage(401);
    }
    if (m.includes("503") || m.includes("not configured")) {
      return streamExtractUserMessage(503);
    }
  }
  return "Something went wrong while I was listening — try again in a moment.";
}
