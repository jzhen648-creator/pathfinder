import { describe, expect, it } from "vitest";
import {
  clarifyInsightHeadline,
  claimsRoughlyEqual,
  isAdministrativeEcho,
  isClearInsightHeadline,
} from "@/lib/insights/insight-clarity";
import { gateThemeInsightProse } from "@/lib/pursuit/pursuit-enrich-readiness";
import { dedupePursuitHeadlinesAgainstThemes } from "@/lib/ai/normalize-reflect-response";
import {
  THEME_INSIGHT_FIELD_LANES,
  THEME_PLAN_MIRROR_RULE,
  OVERALL_READING_FIELD_JOB,
} from "@/lib/insights/theme-insight-prompt-blocks";
import {
  PROSE_CONCRETE_NOUNS_RULE,
  REFLECT_VOICE_ANTI_PATTERNS,
  PURSUIT_HEADLINE_FIELD_JOB,
} from "@/lib/insights/insight-voice-prompt-blocks";

describe("insight clarity", () => {
  it("rejects the gap-is-the-story family", () => {
    expect(
      isClearInsightHeadline(
        "The ISA balance is £30,000 against a £1,000,000 target — the gap is the story.",
      ),
    ).toBe(false);
    expect(
      clarifyInsightHeadline(
        "Contributions are set but the gap is still the story.",
        { fallback: "ISA: £30,000 of £1,000,000" },
      ),
    ).toBe("ISA: £30,000 of £1,000,000");
  });

  it("rejects administrative milestone and long-range deadline inventory", () => {
    expect(isAdministrativeEcho("Deadline in 716 days; one of four milestones complete")).toBe(
      true,
    );
    expect(isClearInsightHeadline("Deadline in 716 days; one of four milestones complete")).toBe(
      false,
    );
    expect(isClearInsightHeadline("2 of 5 milestones complete")).toBe(false);
    expect(isClearInsightHeadline("Work & Career (3 active)")).toBe(false);
    expect(isClearInsightHeadline("Money & Finance: 1 in progress")).toBe(false);
  });

  it("accepts concrete quantitative, qualitative, and urgent-frontier lines", () => {
    expect(
      isClearInsightHeadline(
        "ISA balance is £30,000 against a £1,000,000 target — regular contributions are set.",
      ),
    ).toBe(true);
    expect(
      isClearInsightHeadline(
        "At 17 the apprenticeship, and that same year Formal Education finished.",
        { knownTitleTokens: ["apprenticeship", "formal", "education"] },
      ),
    ).toBe(true);
    expect(
      isClearInsightHeadline("Deadline in 16 days; Module 3 still open"),
    ).toBe(true);
    expect(
      isClearInsightHeadline("Race in ten weeks; longest logged run still 8k."),
    ).toBe(true);
  });

  it("gateThemeInsightProse drops riddle oneLiners and can promote reflective", () => {
    const gated = gateThemeInsightProse({
      oneLiner: "Contributions are set but the gap is the story.",
      reflective:
        "ISA holds £30,000 against a £1,000,000 target. Formal Education completed at 17.",
      knownTitleTokens: ["isa"],
    });
    expect(gated.oneLiner).toMatch(/£30,000/);
    expect(gated.reflective?.toLowerCase()).toContain("formal education");
  });
});

describe("prompt no longer teaches riddles or audit headlines", () => {
  it("removes gap-is-the-story examples and bans admin inventory", () => {
    const joined = [
      THEME_INSIGHT_FIELD_LANES,
      THEME_PLAN_MIRROR_RULE,
      OVERALL_READING_FIELD_JOB,
      PROSE_CONCRETE_NOUNS_RULE,
      REFLECT_VOICE_ANTI_PATTERNS,
      PURSUIT_HEADLINE_FIELD_JOB,
    ].join("\n");
    expect(joined.toLowerCase()).not.toMatch(/right:.*gap is (still )?the story/);
    expect(joined.toLowerCase()).toContain("gap is the story");
    expect(joined.toLowerCase()).toMatch(/wrong.*716 days|administrative inventory/);
    expect(joined.toLowerCase()).toContain("optional");
  });
});

describe("cross-level headline dedupe", () => {
  it("clears chapter headlines that restate the theme oneLiner", () => {
    const next = dedupePursuitHeadlinesAgainstThemes(
      {
        "p-isa": {
          tone: "in_focus",
          headline: "ISA balance £30k against £1m target — contributions are set",
          body: "Amount progress remains the main fact.",
        },
        "p-app": {
          tone: "in_focus",
          headline: "Formal Education completed at 17 before this apprenticeship began",
          body: "Training continues.",
        },
      },
      [
        "ISA balance is £30,000 against a £1,000,000 target — regular contributions are set.",
      ],
    );
    expect(next["p-isa"]?.headline).toBe("");
    expect(next["p-app"]?.headline).toMatch(/formal education/i);
  });

  it("claimsRoughlyEqual matches near-duplicate amount claims", () => {
    expect(
      claimsRoughlyEqual(
        "ISA balance £30k against £1m target",
        "ISA balance is £30,000 against a £1,000,000 target",
      ),
    ).toBe(true);
  });
});
