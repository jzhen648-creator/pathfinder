import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { fragmentMatchesSource } from "./source-identity";
import { segmentImportSource } from "./segmentation";

describe("segmentImportSource", () => {
  it("keeps a short source as one exact fragment", () => {
    const source = "A decision with enough context to keep.";
    expect(segmentImportSource(source)).toEqual([
      expect.objectContaining({
        position: 0,
        startOffset: 0,
        endOffset: source.length,
        text: source,
      }),
    ]);
  });

  it("prefers paragraph boundaries and retains bounded overlap", () => {
    const source = `${"a".repeat(360)}\n\n${"b".repeat(360)}\n\n${"c".repeat(360)}`;
    const segments = segmentImportSource(source, { maxCharacters: 600, overlapCharacters: 80 });

    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]?.text.endsWith("\n\n")).toBe(true);
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1]!;
      const current = segments[index]!;
      expect(previous.endOffset - current.startOffset).toBeLessThanOrEqual(80);
      expect(previous.endOffset).toBeGreaterThan(current.startOffset);
    }
  });

  it("returns no fragments for an empty source", () => {
    expect(segmentImportSource("")).toEqual([]);
  });

  it("always returns exact, ordered, bounded fragments", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12_000 }), (source) => {
        const segments = segmentImportSource(source, {
          maxCharacters: 700,
          overlapCharacters: 90,
        });
        expect(segments[0]?.startOffset).toBe(0);
        expect(segments.at(-1)?.endOffset).toBe(source.length);
        expect(segments.map((segment) => segment.position)).toEqual(
          segments.map((_, index) => index),
        );
        for (const segment of segments) {
          expect(segment.endOffset - segment.startOffset).toBeLessThanOrEqual(700);
          expect(fragmentMatchesSource(source, segment)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
