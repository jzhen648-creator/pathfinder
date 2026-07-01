import { describe, expect, it } from "vitest";

import {
  gateEnrichResult,
  gatePursuitInsightProse,
  gateThemeCombined,
  gateThemeContextual,
  gateThemeContextualContent,
  gateThemeInsightProse,
  gateThemeReflective,
  gatePursuitComparison,
  hasMinimumContextSignal,
  isHolisticBenchmarkEligible,
  sentenceParaphrasesHeadline,
  sentenceRestatesEnrichAnswer,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { buildFocalPursuitReadingFacts } from "@/lib/map/compile-reading-packet";
import type { EnrichAnswer } from "@/lib/pursuit/pursuit-enrich-types";

const richSignal: PursuitSignal = {
  title: "Build £500k ISA",
  backgroundChars: 0,
  enrichAnswerCount: 2,
  milestoneCount: 2,
  completedMilestoneCount: 1,
  hasDeadline: true,
  hasQuantifiedTarget: true,
  status: "ACTIVE",
};

const thinSignal: PursuitSignal = {
  title: "Learn Spanish",
  backgroundChars: 0,
  enrichAnswerCount: 0,
  milestoneCount: 0,
  completedMilestoneCount: 0,
  hasDeadline: false,
  hasQuantifiedTarget: false,
  status: "ACTIVE",
};

describe("pursuit-enrich-readiness gates", () => {
  it("gateThemeCombined strips when no confirmed links", () => {
    expect(gateThemeCombined("CeMAP feeds broker role.", false)).toBe("");
    expect(gateThemeCombined("CeMAP feeds broker role.", true)).toBe("CeMAP feeds broker role.");
  });

  it("gateThemeContextual respects benchmark applicability", () => {
    const text = "At 29, ISA contributions often sit below £20k annual limit.";
    expect(
      gateThemeContextual(text, [richSignal], {
        themeId: "finance",
        age: 29,
        location: "London",
        benchmarkApplicable: true,
      }),
    ).toBe(text);
    expect(
      gateThemeContextual(text, [richSignal], {
        themeId: "finance",
        age: 29,
        location: "London",
        benchmarkApplicable: false,
      }),
    ).toBe("");
  });

  it("gatePursuitComparison allows benchmarks with profile + milestones", () => {
    const comparison = "Typical half-marathon prep is 12-16 weeks from a 5k base.";
    const marathonSignal: PursuitSignal = {
      title: "Half marathon",
      backgroundChars: 0,
      enrichAnswerCount: 0,
      milestoneCount: 3,
      completedMilestoneCount: 1,
      hasDeadline: false,
      hasQuantifiedTarget: false,
      status: "ACTIVE",
    };
    expect(gatePursuitComparison(comparison, marathonSignal)).toBe("");
    expect(
      gatePursuitComparison(comparison, marathonSignal, { age: 29, location: "London" }),
    ).toBe(comparison);
  });

  it("gatePursuitComparison strips unanchored definitional worth-knowing", () => {
    const brokerRole =
      "Mortgage broker roles involve sourcing cases across lenders; CeMAP is the standard qualification to advise.";
    expect(gatePursuitComparison(brokerRole, thinSignal)).toBe("");
    expect(gatePursuitComparison(brokerRole, thinSignal, { age: null, location: null })).toBe("");
  });

  it("gatePursuitComparison keeps consequential anchored worth-knowing without benchmark signal", () => {
    const consequential =
      "CeMAP unlocks lender-panel advising — it bridges your qualification chapter and any broker move on the map.";
    expect(gatePursuitComparison(consequential, thinSignal)).toBe(consequential);
  });

  it("gatePursuitComparison strips prescriptive worth-knowing copy", () => {
    expect(
      gatePursuitComparison("You should complete CeMAP before applying for broker roles.", thinSignal),
    ).toBe("");
  });

  it("gatePursuitComparison strips quantified benchmarks when benchmark signal is absent", () => {
    const quantified = "CeMAP typically takes 6-18 months; you finished in about three.";
    expect(gatePursuitComparison(quantified, thinSignal)).toBe("");
  });

  it("isHolisticBenchmarkEligible when age and location are both known", () => {
    expect(isHolisticBenchmarkEligible([], { age: 29, location: "London" })).toBe(true);
  });

  it("hasMinimumContextSignal counts background freeform", () => {
    expect(
      hasMinimumContextSignal({
        ...thinSignal,
        backgroundChars: 80,
      }),
    ).toBe(true);
  });

  it("hasMinimumContextSignal counts enrich answers", () => {
    expect(hasMinimumContextSignal(thinSignal)).toBe(false);
    expect(hasMinimumContextSignal(richSignal)).toBe(true);
  });

  it("gateEnrichResult strips clarifiers for COMPLETE pursuits", () => {
    const completeSignal: PursuitSignal = {
      ...thinSignal,
      status: "COMPLETE",
    };
    const gated = gateEnrichResult(
      {
        clarifiers: [
          {
            id: "retro-skill",
            prompt: "Which skill did you develop most?",
            options: ["A", "B"],
            kind: "retrospective",
          },
        ],
        insight: { tone: "arrival", headline: "Headline", body: "Body" },
        suggestedMilestones: null,
      },
      completeSignal,
      { clarifyTitles: true },
      { status: "COMPLETE" },
    );
    expect(gated.clarifiers).toHaveLength(0);
  });

  it("gateEnrichResult keeps clarifiers for deadline+title pursuits (QQ decoupled from richness)", () => {
    const deadlineTitleSignal: PursuitSignal = {
      title: "Save for house deposit",
      backgroundChars: 0,
      enrichAnswerCount: 0,
      milestoneCount: 0,
      completedMilestoneCount: 0,
      hasDeadline: true,
      hasQuantifiedTarget: false,
      status: "ACTIVE",
    };
    expect(hasMinimumContextSignal(deadlineTitleSignal)).toBe(true);
    const gated = gateEnrichResult(
      {
        clarifiers: [{ id: "route", prompt: "What route?", options: ["A", "B"], kind: "clarify" }],
        insight: { tone: "context", headline: "Headline", body: "Body" },
        suggestedMilestones: null,
      },
      deadlineTitleSignal,
      { clarifyTitles: true },
    );
    expect(gated.clarifiers).toHaveLength(1);
  });

  it("gateThemeContextualContent strips editorial Comparison filler", () => {
    expect(
      gateThemeContextualContent(
        "For a 29-year-old in London, pursuing DipPFS is valued in a competitive market.",
      ),
    ).toBe("");
    expect(gateThemeContextualContent("Median ISA balance near £20k at age 29.")).toBe(
      "Median ISA balance near £20k at age 29.",
    );
  });

  it("gateThemeReflective strips confirmed link sentences", () => {
    const themeMap = new Map([
      ["p-cemap", "work"],
      ["p-broker", "work"],
    ]);
    const reflective =
      "CeMAP and Sales role are active. You linked CeMAP qualification to Independent broker via feeds into.";
    const stripped = gateThemeReflective(reflective, "work", [
      {
        goalAId: "p-cemap",
        goalBId: "p-broker",
        label: "feeds into",
        goalATitle: "CeMAP qualification",
        goalBTitle: "Independent broker",
      },
    ], themeMap);
    expect(stripped).toBe("CeMAP and Sales role are active.");
    expect(stripped.toLowerCase()).not.toContain("feeds into");
  });

  it("sentenceParaphrasesHeadline flags synonym swap of headline claim", () => {
    const oneLiner = "Long-term investing is the through-line in Money & Finance.";
    expect(
      sentenceParaphrasesHeadline(
        "The theme centers on building wealth through steady long-term investing contributions.",
        oneLiner,
      ),
    ).toBe(true);
    expect(
      sentenceParaphrasesHeadline(
        "ISA chapter: £12,400 of £500,000 with £200/month set.",
        oneLiner,
      ),
    ).toBe(false);
  });

  it("gateThemeInsightProse strips paraphrase but keeps grounding facts", () => {
    const gated = gateThemeInsightProse({
      oneLiner: "The ISA target and current balance are miles apart — contributions are set but the gap is the story.",
      reflective:
        "Wealth building here is about steady contributions toward a significant target. Build £500k ISA: £12,400 of £500,000; £200/month contribution.",
    });
    expect(gated.reflective).toBe("Build £500k ISA: £12,400 of £500,000; £200/month contribution.");
    expect(gated.reflective?.toLowerCase()).not.toContain("steady contributions");
  });

  it("gatePursuitInsightProse strips enrichAnswer glossary from body", () => {
    const enrichAnswers: EnrichAnswer[] = [
      {
        clarifierId: "q1",
        prompt: "What matters most in interviews?",
        selectedOption: "Interview performance",
      },
      {
        clarifierId: "q2",
        prompt: "What client skill?",
        selectedOption: "Client relationship management",
      },
      {
        clarifierId: "q3",
        prompt: "Focus area?",
        selectedOption: "Shifted focus to a different area of property",
      },
    ];
    const gated = gatePursuitInsightProse({
      headline: "Interview performance and client relationship management define this chapter",
      body:
        "Interview performance and client relationship management shaped the role. Shifted focus to a different area of property pulled you away from pure sales.",
      enrichAnswers,
      focalFacts: ["Status: ACTIVE", "Sales negotiator: 1/3 milestones complete"],
    });
    expect(gated.headline).not.toMatch(/Interview performance/i);
    expect(gated.headline).toMatch(/milestones complete/i);
    expect(gated.body?.toLowerCase() ?? "").not.toContain("interview performance");
  });

  it("gatePursuitInsightProse keeps cross-chapter body that only lightly touches one enrichAnswer", () => {
    const enrichAnswers: EnrichAnswer[] = [
      {
        clarifierId: "q1",
        prompt: "Route?",
        selectedOption: "Independent broker",
      },
    ];
    const body =
      "CeMAP qualification is complete while this chapter stays active — the broker route you confirmed sits ahead of any employed desk move.";
    expect(sentenceRestatesEnrichAnswer(body, enrichAnswers)).toBe(false);
    const gated = gatePursuitInsightProse({
      headline: "CeMAP is done — broker licensing is the frontier now",
      body,
      enrichAnswers,
    });
    expect(gated.body).toBe(body);
  });

  it("buildFocalPursuitReadingFacts leads with structured chapter facts not enrichAnswers", () => {
    const facts = buildFocalPursuitReadingFacts({
      id: "g1",
      title: "Sales negotiator",
      status: "ACTIVE",
      significance: 4,
      timelineStart: "2024-01-15",
      milestones: [
        { id: "m1", title: "First listing", completed: true, completedAt: "2024-06-01" },
        { id: "m2", title: "Quarter target", completed: false },
      ],
      enrichAnswers: [
        {
          clarifierId: "q1",
          prompt: "Focus?",
          selectedOption: "Interview performance",
        },
      ],
    });
    expect(facts.some((fact) => fact.startsWith("Status:"))).toBe(true);
    expect(facts.some((fact) => fact.includes("milestones complete"))).toBe(true);
    expect(facts.join(" ").toLowerCase()).not.toContain("interview performance");
  });
});
