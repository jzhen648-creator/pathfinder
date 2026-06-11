import { prisma } from "@/lib/prisma";
import { recordStreamThemeSession } from "@/lib/stream-theme-context";

/** Persist Stream input before memory update so paused paths can be incorporated later. */
export async function persistStreamSessionForMemory(
  userId: string,
  themeId: string,
  sessionText: string,
  fields: { itemsAdded?: number; itemsSkipped?: number } = {},
): Promise<void> {
  const text = sessionText.trim().slice(0, 8000);
  if (!text) return;

  await recordStreamThemeSession(prisma, userId, themeId, {
    inputText: text,
    inputMode: "text",
    itemsAdded: fields.itemsAdded ?? 0,
    itemsSkipped: fields.itemsSkipped ?? 0,
  });
}
