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
    expect(buildReflectSystemPrompt(DEFAULT_PURSUIT_ENRICH_OPTIONS, "full", false)).toContain(
      CLAUSE_MARKER,
    );
  });
});
