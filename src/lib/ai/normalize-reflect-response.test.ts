import { describe, expect, it } from "vitest";

import { normalizeReflectResponse, normalizeThemeTone } from "@/lib/ai/normalize-reflect-response";
import { reflectResponseSchema } from "@/lib/ai/reflect-types";

describe("normalizeThemeTone", () => {
  it("maps pursuit-only tone informational to encouraging", () => {
    expect(normalizeThemeTone("informational")).toBe("encouraging");
  });
});

describe("normalizeReflectResponse", () => {
  it("coerces invalid theme tone before Zod parse succeeds", () => {
    const raw = {
      reading: "Whole-map reading.",
      pursuits: {
        "p-1": {
          tone: "informational",
          headline: "Next step",
          body: "Body copy.",
        },
      },
      themes: {
        work: {
          tone: "informational",
          oneLiner: "Work is live",
          reflective: "CeMAP and Product Lead search both have deadlines in view.",
        },
      },
    };

    const normalized = normalizeReflectResponse(raw);
    const parsed = reflectResponseSchema.safeParse(normalized);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.themes.work?.tone).toBe("encouraging");
    expect(parsed.data.pursuits["p-1"]?.tone).toBe("context");
  });
});
