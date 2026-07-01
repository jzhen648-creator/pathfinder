import { describe, expect, it } from "vitest";

import {
  PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
  PURSUIT_COMPARISON_FIELD_JOBS,
  PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
  PURSUIT_INSIGHT_FIELD_LANES,
  PURSUIT_READING_AUTHORSHIP_ORDER,
  THEME_INSIGHT_FIELD_JOBS,
  THEME_INSIGHT_FIELD_LANES,
  THEME_REFLECT_OUTPUT_CONTRACT,
} from "@/lib/insights/theme-insight-prompt-blocks";

describe("theme-insight-prompt-blocks", () => {
  it("describes theme card as oneLiner + reflective only", () => {
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("{ tone, oneLiner, reflective }");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("FROM YOUR MAP");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("<= 140 chars");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("self-contained thought");
    expect(THEME_INSIGHT_FIELD_JOBS).not.toContain("ACROSS PURSUITS");
    expect(THEME_INSIGHT_FIELD_JOBS).not.toContain("COMPARISON");
  });

  it("defines theme field lanes with headline/body non-duplication", () => {
    expect(THEME_INSIGHT_FIELD_LANES).toContain("THEME READING FIELD LANES");
    expect(THEME_INSIGHT_FIELD_LANES).toContain("Do NOT restate the oneLiner");
    expect(THEME_INSIGHT_FIELD_LANES).toContain("Long-term investing is the through-line");
    expect(THEME_INSIGHT_FIELD_LANES).toContain("£12,400 of £500,000");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("THEME READING FIELD LANES");
    expect(THEME_INSIGHT_FIELD_JOBS).toContain("Ban near-duplicate phrasing");
  });

  it("defines pursuit field lanes with non-duplication bans", () => {
    expect(PURSUIT_INSIGHT_FIELD_LANES).toContain("CHAPTER READING FIELD LANES");
    expect(PURSUIT_INSIGHT_FIELD_LANES).toContain("MAP-RELATIONSHIPS");
    expect(PURSUIT_INSIGHT_FIELD_LANES).toContain("Do NOT restate the headline");
    expect(PURSUIT_INSIGHT_FIELD_LANES).toContain("Do NOT restate Status, Deadline, or Significance");
    expect(PURSUIT_INSIGHT_FIELD_LANES).toContain("Do NOT restate milestone row titles");
  });

  it("defines worth-knowing remit on the historical comparison field", () => {
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("Worth knowing ·");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("consequential domain context the map does NOT contain");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("Do NOT borrow another chapter's progress story");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).toContain("<benchmark_facts>");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).not.toContain("Population / typical-norm benchmark");
    expect(PURSUIT_COMPARISON_FIELD_JOBS).not.toContain("fromMap");
  });

  it("limits body domain context to cross-pursuit relationships only", () => {
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("cross-chapter");
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("AT MOST ONE sentence");
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("QUALITATIVE only");
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("what this chapter type is");
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("INSIGHT-CARD-REDESIGN-SPEC.md");
    expect(PURSUIT_BODY_DOMAIN_CONTEXT_RULE).toContain("you should");
  });

  it("defines context-tab non-duplication for pursuit panels", () => {
    expect(PURSUIT_CONTEXT_TAB_NON_DUPLICATION).toContain("enrichAnswers");
    expect(PURSUIT_CONTEXT_TAB_NON_DUPLICATION).toContain("Do NOT restate enrichAnswers");
    expect(PURSUIT_CONTEXT_TAB_NON_DUPLICATION).toContain("domain gloss");
  });

  it("scopes chapter reading authorship to pursuit panels only", () => {
    expect(PURSUIT_READING_AUTHORSHIP_ORDER).toContain("does NOT apply to theme oneLiner or reflective");
    expect(PURSUIT_READING_AUTHORSHIP_ORDER).toContain("<focal_chapter_facts>");
    expect(PURSUIT_READING_AUTHORSHIP_ORDER).toContain("Wrong: restating three confirmed Quick Question picks");
  });

  it("requires empty theme contextual and combined on reflect", () => {
    expect(THEME_REFLECT_OUTPUT_CONTRACT).toContain('{ tone, oneLiner, reflective }');
    expect(THEME_REFLECT_OUTPUT_CONTRACT).toContain('contextual and combined MUST be empty strings ""');
    expect(THEME_REFLECT_OUTPUT_CONTRACT).toContain("Worth knowing");
  });
});
