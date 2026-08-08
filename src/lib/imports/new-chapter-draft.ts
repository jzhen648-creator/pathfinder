import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import type { Prisma } from "@prisma/client";

const LIFE_AREA_SET = new Set<string>(LIFE_AREA_IDS);

export type NewChapterDraft = {
  title: string;
  primaryThemeId: LifeAreaId;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function parseNewChapterDraft(payload: unknown): NewChapterDraft | null {
  const root = record(payload);
  const draft = record(root?.newChapterDraft);
  if (!draft) return null;

  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const primaryThemeId =
    typeof draft.primaryThemeId === "string" ? draft.primaryThemeId : "";
  if (!title || title.length > 100 || !LIFE_AREA_SET.has(primaryThemeId)) return null;

  return { title, primaryThemeId: primaryThemeId as LifeAreaId };
}

export function withNewChapterDraft(
  payload: unknown,
  draft: NewChapterDraft,
): Prisma.InputJsonObject {
  const root = record(payload) ?? {};
  return {
    ...root,
    newChapterDraft: {
      title: draft.title.trim(),
      primaryThemeId: draft.primaryThemeId,
    },
  } as Prisma.InputJsonObject;
}

export function withoutNewChapterDraft(payload: unknown): Prisma.InputJsonObject {
  const root = record(payload) ?? {};
  const { newChapterDraft: _removed, ...rest } = root;
  return rest as Prisma.InputJsonObject;
}
