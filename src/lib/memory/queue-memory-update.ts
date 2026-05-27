import { updateUserMemory } from "@/lib/memory/update-memory";

/**
 * Fire-and-forget memory extraction after Stream commit. Never blocks the caller.
 */
export function queueMemoryUpdateAfterStream(userId: string, sessionText: string): void {
  const text = sessionText.trim();
  if (!text) return;

  void updateUserMemory(userId, text).catch((err) => {
    console.error("[queueMemoryUpdateAfterStream] unhandled", err);
  });
}
