import { labelPreservesSalience } from "@/lib/canvas-label-salience";
import {
  limbJewelHighlightStopColor,
  mixRgb,
  parseHexRgb,
  rgbToHex,
  type Rgb,
} from "./tree-color-accents";

/** Near-white canvas ink (limb accent is a light tint only). */
const CANVAS_LABEL_INK_RGB: Rgb = { r: 253, g: 251, b: 248 };

const CANVAS_LABEL_SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "my",
  "with",
  "by",
]);

function capitalizeWordToken(word: string): string {
  if (!word) return word;
  if (/^[£$€]?\d+(?:\.\d+)?[kKmM]?$/.test(word)) {
    return word.replace(/m$/, "M");
  }
  const first = word.charAt(0);
  if (!first) return word;
  return first.toUpperCase() + word.slice(1).toLowerCase();
}

/** Words that were capitalized in the source title (e.g. London, Dad). */
function properNounsFromTitle(fullTitle: string): Map<string, string> {
  const out = new Map<string, string>();
  const words = fullTitle.match(/\b[\p{L}][\p{L}'’-]*\b/gu) ?? [];
  words.forEach((w, index) => {
    const first = w.charAt(0);
    const hasInternalUpper = /[\p{Ll}][\p{Lu}]|[\p{Lu}][\p{Ll}].*[\p{Lu}]/u.test(w);
    const allCaps = w.length > 1 && w === w.toUpperCase();
    const sentenceCaseOnly = index === 0 && !allCaps && !hasInternalUpper;
    if (w.length > 1 && first !== first.toLowerCase() && first === first.toUpperCase()) {
      if (!sentenceCaseOnly) out.set(w.toLowerCase(), w);
    }
  });
  return out;
}

/**
 * Readable tree label casing: sentence case + proper nouns from the goal title.
 * Fixes all-lowercase AI short labels without re-running generation.
 */
export function formatCanvasLabelForDisplay(label: string, fullTitle?: string): string {
  const s = label.trim();
  if (!s) return s;

  const proper = fullTitle ? properNounsFromTitle(fullTitle) : new Set<string>();
  const words = s.split(/\s+/).filter(Boolean);

  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (/^[£$€]?\d+(?:\.\d+)?[kKmM]?$/.test(word)) return word.replace(/m$/, "M");
      const properWord = proper.get(lower);
      if (properWord) return properWord;
      if (i === 0) return capitalizeWordToken(word);
      if (CANVAS_LABEL_SMALL_WORDS.has(lower)) return lower;
      return lower;
    })
    .join(" ");
}

const GOAL_LABEL_FILLER_PREFIXES = [
  "get a ",
  "get my ",
  "get ",
  "build a ",
  "build my ",
  "build ",
  "start a ",
  "start my ",
  "start ",
  "complete ",
  "establish ",
  "develop ",
  "create a ",
  "create my ",
  "create ",
  "achieve ",
  "become ",
  "find a ",
  "find my ",
  "find ",
  "launch ",
  "resolve ",
  "resolve the ",
] as const;

/** Index of the first comma that separates clauses — not a thousands separator (e.g. £10,000). */
function findClauseCommaIndex(s: string): number {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] !== ",") continue;
    if (i > 0 && i < s.length - 1 && /\d/.test(s[i - 1]!) && /\d/.test(s[i + 1]!)) continue;
    return i;
  }
  return -1;
}

/**
 * Shorter canvas copy without ellipsis: drop filler verbs, keep the headline clause only.
 * Full string remains in the panel / tooltip (`<title>`).
 */
export function preferShortCanvasLabel(title: string): string {
  let s = title.trim();
  if (!s) return "Pursuit";

  const lower = s.toLowerCase();
  for (const prefix of GOAL_LABEL_FILLER_PREFIXES) {
    if (lower.startsWith(prefix)) {
      s = s.slice(prefix.length).trim();
      if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
      break;
    }
  }

  const comma = findClauseCommaIndex(s);
  if (comma > 3) s = s.slice(0, comma).trim();

  const dash = s.match(/^(.+?)\s(?:—|–|-)\s+(.+)$/);
  if (dash && dash[1]!.trim().length >= 4) s = dash[1]!.trim();

  s = s.replace(/\s+through\s+.+$/i, "").trim();
  s = s.replace(/\s+before\s+.+$/i, "").trim();
  s = s.replace(/\s+by year\s+\d+.*$/i, "").trim();

  const out = s.length > 0 ? s : title.trim();
  return formatCanvasLabelForDisplay(out, title);
}

/** Tree SVG goal surface: prefer persisted AI short label when it keeps salient detail, else heuristic. */
export function goalCanvasDisplayLabel(
  fullTitle: string,
  shortLabel?: string | null,
  description?: string | null,
): string {
  const title = fullTitle.trim() || "Pursuit";
  const sl = typeof shortLabel === "string" ? shortLabel.trim() : "";
  const formattedShort = sl.length > 0 ? formatCanvasLabelForDisplay(sl, title) : "";
  const useShort =
    formattedShort.length > 0 && labelPreservesSalience(formattedShort, title, description);
  const raw = useShort ? sl : preferShortCanvasLabel(title);
  return formatCanvasLabelForDisplay(raw, title);
}

/** Approximate max characters per line from font size (SVG px). */
export function treeCanvasLabelCharsPerLine(fontSizePx: number, maxWidthPx?: number): number {
  const w = maxWidthPx ?? fontSizePx * 10.5;
  return Math.max(12, Math.round(w / (fontSizePx * 0.52)));
}

/**
 * Break label into up to `maxLines` rows on word boundaries.
 * For `maxLines === 2`, prefers a balanced two-line split (goal / hub labels).
 * For `maxLines > 2`, uses greedy fill; overflow on the last line ends with an ellipsis.
 */
export function splitCanvasLabelLines(
  text: string,
  fontSizePx: number,
  maxLines = 2,
  maxWidthPx?: number,
): string[] {
  const t = text.trim();
  if (!t) return ["Pursuit"];
  const maxChars = treeCanvasLabelCharsPerLine(fontSizePx, maxWidthPx);
  if (t.length <= maxChars || maxLines < 2) return [t];

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [t];

  if (maxLines === 2) {
    let bestIdx = 1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 1; i < words.length; i += 1) {
      const line1 = words.slice(0, i).join(" ");
      const line2 = words.slice(i).join(" ");
      if (line1.length > maxChars * 1.2) continue;
      const score = Math.abs(line1.length - line2.length);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const line1 = words.slice(0, bestIdx).join(" ");
    const line2 = words.slice(bestIdx).join(" ");
    if (!line2) return [line1];
    return [line1, line2];
  }

  const lines: string[] = [];
  let wi = 0;
  while (wi < words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      const remaining = words.slice(wi).join(" ");
      if (remaining.length <= maxChars) {
        lines.push(remaining);
      } else {
        lines.push(remaining.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…");
      }
      break;
    }
    let line = words[wi]!;
    wi += 1;
    while (wi < words.length && line.length + 1 + words[wi]!.length <= maxChars) {
      line += " " + words[wi]!;
      wi += 1;
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [t];
}

export type TreeCanvasLabelInk = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
};

/** Bright limb-tinted canvas ink (readable on dark membranes). */
export function treeCanvasLabelInk(accentHex: string, emphasis: "hub" | "goal" = "goal"): TreeCanvasLabelInk {
  const accent = parseHexRgb(accentHex);
  const fillRgb = accent ? mixRgb(accent, CANVAS_LABEL_INK_RGB, 0.1) : CANVAS_LABEL_INK_RGB;
  return {
    fill: rgbToHex(fillRgb),
    fillOpacity: 1,
    stroke: accentHex,
    strokeOpacity: emphasis === "hub" ? 0.42 : 0.32,
    strokeWidth: 0.65,
  };
}

/**
 * Hub / theme / goal map labels: keeps the limb hue (not flat cream) but lifts luminance so copy
 * stays legible on `#0d0d0f` and on the default charcoal label pill.
 */
export function treeMapLimbHueReadableInk(accentHex: string): TreeCanvasLabelInk {
  return {
    fill: limbJewelHighlightStopColor(accentHex, 0.58),
    fillOpacity: 1,
    stroke: accentHex,
    strokeOpacity: 0.38,
    strokeWidth: 0.72,
  };
}

