import { describe, expect, it } from "vitest";

import {
  buildPursuitCachePayload,
  mergePreservedClarifiers,
  mergePreservedPursuitInsightProse,
  pursuitCachePayloadHasContent,
  resolvePreservedReadingProse,
} from "@/lib/pursuit/pursuit-cache-patch";
import {
  CLARIFIER_PLACEHOLDER_BODY,
  CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC,
  type Clarifier,
} from "@/lib/pursuit/pursuit-enrich-types";

const fresh: Clarifier[] = [
  { id: "next-q", prompt: "Full-time or part-time?", options: ["Full-time", "Part-time"], kind: "clarify" as const },
  { id: "extra", prompt: "Extra?", options: ["A", "B"], kind: "clarify" as const },
];

const clarifier: Clarifier = {
  id: "route",
  prompt: "Primary approach?",
  options: ["Diet", "Exercise"],
  kind: "clarify",
};

describe("buildPursuitCachePayload", () => {
  it("writes clarifier placeholder only when clarifiers exist and prose is empty", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [clarifier],
      insight: null,
      suggestedMilestones: null,
    });
    expect(payload?.headline).toBe(CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC);
    expect(payload?.clarifiers).toHaveLength(1);
  });

  it("keeps body when headline is empty — does not inject placeholder", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [clarifier],
      insight: {
        tone: "context",
        headline: "",
        body: "Cross-theme pressure from the ISA target keeps this chapter paced.",
      },
      suggestedMilestones: null,
    });
    expect(payload?.headline).toBe("");
    expect(payload?.body).toContain("ISA");
    expect(payload?.headline).not.toBe(CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC);
  });

  it("persists milestones-only without QQ invite headline", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [],
      insight: null,
      suggestedMilestones: [{ title: "Cut evening snacks", order: 0 }],
    });
    expect(payload?.headline).toBe("");
    expect(payload?.suggestedMilestones).toHaveLength(1);
  });

  it("counts body-only payloads as persistable content", () => {
    const payload = buildPursuitCachePayload({
      clarifiers: [],
      insight: {
        tone: "context",
        headline: "",
        body: "Cross-theme pressure from the ISA target keeps this chapter paced.",
      },
      suggestedMilestones: null,
    });
    expect(pursuitCachePayloadHasContent(payload)).toBe(true);
  });
});

describe("preserve chapter reading prose", () => {
  it("keeps cached reading when fresh fields are blanked", () => {
    expect(resolvePreservedReadingProse("", "68kg by April 2027 with cardio milestones set")).toBe(
      "68kg by April 2027 with cardio milestones set",
    );
    const merged = mergePreservedPursuitInsightProse(
      { tone: "context", headline: "", body: "" },
      {
        tone: "in_focus",
        headline: "68kg by April 2027 with cardio milestones set",
        body: "Diet and training pace the drop against the ISA runway.",
      },
    );
    expect(merged?.headline).toContain("68kg");
    expect(merged?.body).toContain("Diet");
  });

  it("does not resurrect QQ invite shell from cache", () => {
    expect(
      resolvePreservedReadingProse("", CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC),
    ).toBeUndefined();
    expect(resolvePreservedReadingProse("", CLARIFIER_PLACEHOLDER_BODY)).toBeUndefined();
    const merged = mergePreservedPursuitInsightProse(
      { tone: "context", headline: "", body: "" },
      {
        tone: "context",
        headline: CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC,
        body: CLARIFIER_PLACEHOLDER_BODY,
      },
    );
    expect(merged?.headline).toBe("");
    expect(merged?.body).toBe("");
  });
});

describe("mergePreservedClarifiers", () => {
  it("next mode returns only fresh clarifiers capped at one", () => {
    const merged = mergePreservedClarifiers({
      fresh,
      cached: [{ id: "old", prompt: "Old?", options: ["A", "B"], kind: "clarify" as const }],
      preserveAllowed: true,
      mode: "next",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("next-q");
  });

  it("initial mode preserves cached pending when present", () => {
    const cached: Clarifier[] = [{ id: "pending", prompt: "Pending?", options: ["A", "B"], kind: "clarify" }];
    const merged = mergePreservedClarifiers({
      fresh,
      cached,
      preserveAllowed: true,
      mode: "initial",
    });
    expect(merged).toEqual(cached);
  });
});
