const chains = new Map<string, Promise<unknown>>();
const lastFinishedAt = new Map<string, number>();

/** Minimum gap between Gemini calls for one user on a warm instance. */
const MIN_GAP_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithGap<T>(key: string, job: () => Promise<T>): Promise<T> {
  const last = lastFinishedAt.get(key) ?? 0;
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - last));
  if (wait > 0) await sleep(wait);
  try {
    return await job();
  } finally {
    lastFinishedAt.set(key, Date.now());
  }
}

/**
 * Serialize AI provider calls per user so Stream, insights, and season read
 * never hit Gemini in parallel for the same account.
 */
export async function runSerializedAiJob<T>(
  queueKey: string | null | undefined,
  job: () => Promise<T>,
): Promise<T> {
  const key = queueKey?.trim() || "__global__";
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(
    () => runWithGap(key, job),
    () => runWithGap(key, job),
  );
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
