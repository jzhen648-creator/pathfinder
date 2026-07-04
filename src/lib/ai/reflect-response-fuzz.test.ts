import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalizeReflectResponse } from "@/lib/ai/normalize-reflect-response";
import { reflectResponseSchema } from "@/lib/ai/reflect-types";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";

type PipelineResult =
  | { ok: true; pursuitCount: number; themeCount: number }
  | { ok: false; reason: string };

function runReflectParsePipeline(json: unknown): PipelineResult {
  try {
    const clamped = clampInsightGenerationJson(json);
    const normalized = normalizeReflectResponse(clamped);
    const parsed = reflectResponseSchema.safeParse(normalized);
    if (parsed.success) {
      return {
        ok: true,
        pursuitCount: Object.keys(parsed.data.pursuits).length,
        themeCount: Object.keys(parsed.data.themes ?? {}).length,
      };
    }
    return {
      ok: false,
      reason: parsed.error.issues[0]?.message ?? "Invalid reflect response shape.",
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

const malformedReflectArb = fc.oneof(
  fc.jsonValue(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.anything(), { maxLength: 8 }),
  fc.record({
    pursuits: fc.oneof(
      fc.constant(null),
      fc.array(fc.anything()),
      fc.dictionary(fc.string(), fc.anything()),
      fc.string(),
    ),
    themes: fc.oneof(
      fc.constant(null),
      fc.array(fc.anything()),
      fc.dictionary(fc.string(), fc.anything()),
      fc.string(),
    ),
    global: fc.record({
      sections: fc.oneof(fc.dictionary(fc.string(), fc.anything()), fc.array(fc.anything())),
    }),
  }),
  fc.dictionary(
    fc.string(),
    fc.record({
      headline: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      body: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      tone: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      oneLiner: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      reflective: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      clarifiers: fc.oneof(fc.array(fc.anything()), fc.string(), fc.constant(null)),
      suggestedMilestones: fc.oneof(fc.array(fc.anything()), fc.string(), fc.constant(null)),
      insight: fc.oneof(fc.record({ headline: fc.string() }), fc.string(), fc.constant(null)),
    }),
  ),
);

describe("reflect response fuzz pipeline", () => {
  it("normalize → clamp → Zod never throws on malformed Gemini JSON", () => {
    fc.assert(
      fc.property(malformedReflectArb, (json) => {
        expect(() => runReflectParsePipeline(json)).not.toThrow();
        const result = runReflectParsePipeline(json);
        if (result.ok) {
          expect(result.pursuitCount).toBeGreaterThanOrEqual(0);
          expect(result.themeCount).toBeGreaterThanOrEqual(0);
        } else {
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("valid minimal reflect JSON survives the pipeline", () => {
    const result = runReflectParsePipeline({
      themes: {
        work: {
          tone: "encouraging",
          oneLiner: "Work chapters carry near deadlines.",
          reflective: "CeMAP and Product Lead search both have June deadlines on the map.",
        },
      },
      pursuits: {
        "p-cemap": {
          tone: "worth_a_look",
          headline: "CeMAP deadline is close",
          body: "Unit 1 and Unit 2 remain on the path toward the qualification deadline.",
          clarifiers: [],
          suggestedMilestones: null,
        },
      },
    });

    expect(result).toEqual({ ok: true, pursuitCount: 1, themeCount: 1 });
  });
});
