/** Friendly assistant copy when Stream extract returns nothing useful (successful but empty). */

export const STREAM_EXTRACT_EMPTY_MESSAGE =

  "I didn't pick up anything concrete from that — try telling me a bit more about what you're working on or what happened.";



/** When the extract API fails due to AI/service errors (not user input). */

export const STREAM_EXTRACT_SERVICE_ERROR_MESSAGE =

  "Stream couldn't process that right now — try again in a moment.";



function errorStatus(err: unknown): number | null {

  if (err && typeof err === "object" && "status" in err) {

    const status = (err as { status?: unknown }).status;

    return typeof status === "number" ? status : null;

  }

  return null;

}



function errorMessage(err: unknown): string {

  if (err instanceof Error) return err.message;

  return String(err);

}



/** Map an extract failure to an HTTP status for API routes. */

export function streamExtractFailureStatus(err: unknown): number {

  const status = errorStatus(err);

  if (status === 429) return 429;

  if (status === 401 || status === 403) return 503;



  const message = errorMessage(err).toLowerCase();

  if (message.includes("429") || message.includes("rate limit") || message.includes("quota")) {

    return 429;

  }



  return 502;

}



/** Map extract / narrative API status codes to user-facing assistant messages. */

export function streamExtractUserMessage(status: number, _serverError?: string | null): string {

  switch (status) {

    case 401:

      return "You'll need to sign in again to keep streaming.";

    case 429:

      return "Stream hit a temporary rate limit — wait a moment and try again.";

    case 503:

      return "Stream isn't available right now — try again in a moment.";

    case 400:

      return "That didn't come through clearly — try adding a little more detail.";

    case 404:

      return "We couldn't find that hub on your map.";

    case 502:

    case 500:

    default:

      return STREAM_EXTRACT_SERVICE_ERROR_MESSAGE;

  }

}



/** Network / thrown errors during extract (no HTTP status). */

export function streamExtractCatchMessage(err: unknown): string {

  if (err instanceof Error) {

    const m = err.message.toLowerCase();

    if (m.includes("unauthorized") || m.includes("401")) {

      return streamExtractUserMessage(401);

    }

    if (m.includes("429") || m.includes("rate limit") || m.includes("quota")) {

      return streamExtractUserMessage(429);

    }

    if (m.includes("503") || m.includes("not configured")) {

      return streamExtractUserMessage(503);

    }

  }

  return "Something went wrong while I was listening — try again in a moment.";

}


