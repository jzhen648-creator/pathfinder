export type StreamSessionDumpRow = {
  inputText: string;
  inputMode: string;
  createdAt: Date;
};

const STREAM_SESSION_DUMP_LIMIT = 3;
const STREAM_SESSION_DUMP_MAX_CHARS = 500;

function truncateAtSentenceBoundary(text: string, maxChars: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed;

  const clipped = trimmed.slice(0, maxChars);
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?"),
  );
  const boundary =
    sentenceBoundary >= Math.floor(maxChars * 0.5)
      ? sentenceBoundary + 1
      : maxChars;
  return `${clipped.slice(0, boundary).trim()}…`;
}

export function formatPreviousStreamSessionSummary(titles: string[]): string {
  return titles.length === 0 ? "None yet" : titles.join(", ");
}

export function formatPreviousStreamSessionDumps(sessions: StreamSessionDumpRow[]): string {
  if (sessions.length === 0) return "None yet";
  return sessions
    .slice(-STREAM_SESSION_DUMP_LIMIT)
    .map((s, i) => {
      const date = s.createdAt.toISOString().slice(0, 10);
      return `### Session ${i + 1} (${date}, ${s.inputMode})\n${truncateAtSentenceBoundary(
        s.inputText,
        STREAM_SESSION_DUMP_MAX_CHARS,
      )}`;
    })
    .join("\n\n");
}
