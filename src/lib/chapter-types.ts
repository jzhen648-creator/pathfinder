import { z } from "zod";

/** Mirrors mobile `CHAPTER_TYPE_IDS` — keep in sync with pathfinder-mobile/lib/chapter-types. */
export const CHAPTER_TYPE_IDS = [
  "employment_role",
  "education_qualification",
  "business",
  "financial_account",
  "property_home",
  "relocation",
  "relationship",
  "health_condition",
  "training_practice",
  "creative_channel",
  "custom",
] as const;

export type ChapterTypeId = (typeof CHAPTER_TYPE_IDS)[number];

export const CURRENT_FOCUS_MAX_CHARS = 140;

export const identityFactsSchema = z
  .record(z.string().max(64), z.string().max(200))
  .refine((obj) => Object.keys(obj).length <= 20, {
    message: "Too many identity facts",
  });

export const chapterTypeSchema = z.enum(CHAPTER_TYPE_IDS);

export function isChapterTypeId(value: unknown): value is ChapterTypeId {
  return typeof value === "string" && (CHAPTER_TYPE_IDS as readonly string[]).includes(value);
}
