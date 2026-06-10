const chains = new Map<string, Promise<unknown>>();

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
  const run = previous.then(() => job(), () => job());
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
