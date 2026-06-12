import { updateUserMemory } from "@/lib/memory/update-memory";

/** Session texts collected during ai-sync digest — flushed after reading succeeds. */
const pendingByUser = new Map<string, string[]>();

export function deferMemoryUpdateAfterStream(userId: string, sessionText: string): void {
  const text = sessionText.trim();
  if (!text) return;
  const list = pendingByUser.get(userId) ?? [];
  list.push(text);
  pendingByUser.set(userId, list);
}

export async function flushDeferredMemoryUpdates(userId: string): Promise<void> {
  const texts = pendingByUser.get(userId) ?? [];
  pendingByUser.delete(userId);
  for (const text of texts) {
    try {
      await updateUserMemory(userId, text);
    } catch (err) {
      console.error("[flushDeferredMemoryUpdates]", err);
    }
  }
}

export function discardDeferredMemoryUpdates(userId: string): void {
  pendingByUser.delete(userId);
}
