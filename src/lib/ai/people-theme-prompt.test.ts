import { describe, expect, it } from "vitest";

import {
  buildReflectPursuitsOnlySystemPrompt,
  buildReflectSystemPrompt,
} from "@/lib/ai/generate-reflect";
import {
  PEOPLE_THEME_BODY_CLAUSE,
  shouldApplyPeopleThemeBodyRules,
} from "@/lib/ai/people-theme-prompt";
import { buildEnrichSystemPrompt } from "@/lib/pursuit/generate-pursuit-enrich";
import { DEFAULT_PURSUIT_ENRICH_OPTIONS } from "@/lib/pursuit/enrich-options";
import { buildStorySystemPrompt } from "@/lib/story/generate-story";

const CLAUSE_MARKER = "invite them to dinner";

describe("people theme body rules", () => {
  it("matches approved clause text", () => {
    expect(PEOPLE_THEME_BODY_CLAUSE).toContain('themeId is "people"');
    expect(PEOPLE_THEME_BODY_CLAUSE).toContain(CLAUSE_MARKER);
    expect(PEOPLE_THEME_BODY_CLAUSE).toContain("One genuine question is permitted");
  });

  it("applies only when themeId is people", () => {
    expect(shouldApplyPeopleThemeBodyRules("people")).toBe(true);
    expect(shouldApplyPeopleThemeBodyRules("work")).toBe(false);
    expect(shouldApplyPeopleThemeBodyRules(undefined)).toBe(false);
  });
});

describe("people theme prompt wiring", () => {
  it("includes clause in enrich prompt for people theme only", () => {
    const withPeople = buildEnrichSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, true, false);
    const withoutPeople = buildEnrichSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, false, false);

    expect(withPeople).toContain(CLAUSE_MARKER);
    expect(withoutPeople).not.toContain(CLAUSE_MARKER);
  });

  it("includes clause in reflect pursuit-body prompts", () => {
    expect(buildReflectPursuitsOnlySystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, false)).toContain(
      CLAUSE_MARKER,
    );
    expect(buildReflectSystemPrompt(5, DEFAULT_PURSUIT_ENRICH_OPTIONS, "full", false)).toContain(
      CLAUSE_MARKER,
    );
  });

  it("does not add people rules to whole-map story prompt", () => {
    expect(buildStorySystemPrompt(5)).not.toContain(CLAUSE_MARKER);
  });

  it("keeps people rules out of reflect whole-map reading section", () => {
    const prompt = buildReflectSystemPrompt(5, DEFAULT_PURSUIT_ENRICH_OPTIONS, "full", false);
    const wholeMapSection = prompt.split("WHOLE-MAP READING:")[1]?.split("OUTPUT:")[0] ?? "";

    expect(wholeMapSection).not.toContain(CLAUSE_MARKER);
  });
});
