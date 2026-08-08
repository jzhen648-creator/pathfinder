import { createHash } from "node:crypto";

export const SOURCE_FINGERPRINT_VERSION = "source-v2";

export type SourceFingerprintInput = {
  contentType: "TEXT" | "URL" | "PHOTO" | "VOICE" | "MIXED";
  rawText: string;
  sourceUrl?: string | null;
};

export type ExistingSourceIdentity = {
  id: string;
  contentHash: string;
  deletedAt?: Date | null;
  createdAt: Date;
};

/**
 * Removes transport-only differences without changing the words a user chose.
 * The immutable raw payload is still stored separately.
 */
export function normalizeSourceText(rawText: string): string {
  return rawText
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Preserve indentation and repeated internal spaces: they can be meaningful
    // in code, tables, and quoted material. Only transport-edge whitespace goes.
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeSourceUrl(sourceUrl: string | null | undefined): string {
  const value = sourceUrl?.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

/** Exact-import fingerprint. Semantic reconciliation happens later. */
export function fingerprintSource(input: SourceFingerprintInput): string {
  const normalizedText = normalizeSourceText(input.rawText);
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: SOURCE_FINGERPRINT_VERSION,
        contentType: input.contentType,
        normalizedText,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Oldest non-deleted exact match wins so retries are stable. */
export function findExactDuplicate(
  contentHash: string,
  existing: readonly ExistingSourceIdentity[],
): ExistingSourceIdentity | null {
  return (
    existing
      .filter((source) => !source.deletedAt && source.contentHash === contentHash)
      .sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      })[0] ?? null
  );
}

export type SourceFragmentBounds = {
  startOffset: number;
  endOffset: number;
  text: string;
};

/** Provenance is valid only when the bounded text exactly matches rawText. */
export function fragmentMatchesSource(rawText: string, fragment: SourceFragmentBounds): boolean {
  if (!Number.isInteger(fragment.startOffset) || !Number.isInteger(fragment.endOffset)) {
    return false;
  }
  if (fragment.startOffset < 0 || fragment.endOffset <= fragment.startOffset) return false;
  if (fragment.endOffset > rawText.length) return false;
  return rawText.slice(fragment.startOffset, fragment.endOffset) === fragment.text;
}
