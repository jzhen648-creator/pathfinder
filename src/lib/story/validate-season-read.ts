const COMPLETION_PHRASE =
  /\b(completed|finished|achieved|wrapped up|done with|has been done|is done)\b/i;

export type PursuitStatusCheck = {
  title: string;
  status: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Log-only guard: completion language beside a non-COMPLETE pursuit title. */
export function validateSeasonReadAgainstPursuits(
  seasonRead: string,
  pursuits: PursuitStatusCheck[],
): void {
  const prose = seasonRead.trim();
  if (!prose) return;

  for (const pursuit of pursuits) {
    if (pursuit.status === "COMPLETE") continue;
    const title = pursuit.title.trim();
    if (!title || title.length < 3) continue;

    const titlePattern = new RegExp(escapeRegExp(title), "i");
    const match = titlePattern.exec(prose);
    if (!match) continue;

    const start = Math.max(0, match.index - 80);
    const end = Math.min(prose.length, match.index + title.length + 80);
    const window = prose.slice(start, end);
    if (COMPLETION_PHRASE.test(window)) {
      console.warn(
        `[story] seasonRead may falsely complete non-COMPLETE pursuit "${title}" (status ${pursuit.status})`,
      );
    }
  }
}
