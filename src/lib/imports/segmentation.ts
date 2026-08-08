import { createHash } from "node:crypto";
import { fragmentMatchesSource } from "./source-identity";

export const DEFAULT_IMPORT_SEGMENT_CHARACTERS = 4_000;
export const DEFAULT_IMPORT_SEGMENT_OVERLAP = 240;

export type ImportSegment = {
  position: number;
  startOffset: number;
  endOffset: number;
  text: string;
  contentHash: string;
};

function segmentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function chooseSegmentEnd(rawText: string, startOffset: number, maxCharacters: number): number {
  const hardEnd = Math.min(rawText.length, startOffset + maxCharacters);
  if (hardEnd === rawText.length) return hardEnd;

  const minimumUsefulEnd = startOffset + Math.floor(maxCharacters * 0.6);
  const paragraphEnd = rawText.lastIndexOf("\n\n", hardEnd);
  if (paragraphEnd >= minimumUsefulEnd) return paragraphEnd + 2;

  const lineEnd = rawText.lastIndexOf("\n", hardEnd);
  if (lineEnd >= minimumUsefulEnd) return lineEnd + 1;

  const sentenceEnd = rawText.lastIndexOf(". ", hardEnd);
  if (sentenceEnd >= minimumUsefulEnd) return sentenceEnd + 1;
  return hardEnd;
}

/** Deterministic, exact-offset segmentation. Overlap preserves boundary context. */
export function segmentImportSource(
  rawText: string,
  options: { maxCharacters?: number; overlapCharacters?: number } = {},
): ImportSegment[] {
  if (rawText.length === 0) return [];

  const maxCharacters = Math.max(512, Math.floor(options.maxCharacters ?? DEFAULT_IMPORT_SEGMENT_CHARACTERS));
  const requestedOverlap = Math.max(
    0,
    Math.floor(options.overlapCharacters ?? DEFAULT_IMPORT_SEGMENT_OVERLAP),
  );
  const overlapCharacters = Math.min(requestedOverlap, Math.floor(maxCharacters / 3));
  const segments: ImportSegment[] = [];
  let startOffset = 0;

  while (startOffset < rawText.length) {
    const endOffset = chooseSegmentEnd(rawText, startOffset, maxCharacters);
    const text = rawText.slice(startOffset, endOffset);
    if (text.length === 0) throw new Error("Import segmentation made no forward progress");

    const segment: ImportSegment = {
      position: segments.length,
      startOffset,
      endOffset,
      text,
      contentHash: segmentHash(text),
    };
    if (!fragmentMatchesSource(rawText, segment)) {
      throw new Error("Import segmentation produced invalid source bounds");
    }
    segments.push(segment);

    if (endOffset === rawText.length) break;
    startOffset = Math.max(startOffset + 1, endOffset - overlapCharacters);
  }

  return segments;
}
