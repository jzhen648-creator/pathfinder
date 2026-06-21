import { describe, expect, it } from "vitest";

import {
  PURSUIT_STATUS_PROMPT_LINES,
  pursuitStatusPromptBlock,
} from "@/lib/ai/pursuit-status-prompt";

describe("pursuitStatusPromptBlock", () => {
  it("enumerates all four pursuit statuses on one shared block", () => {
    const block = pursuitStatusPromptBlock();
    expect(block).toContain("Pursuit status (status field in map context):");
    expect(block).toContain("- COMPLETE —");
    expect(block).toContain("- ACTIVE —");
    expect(block).toContain("- MAINTAINING —");
    expect(block).toContain("- PAUSED —");
  });

  it("MAINTAINING forbids gap, pace, and finish nudges", () => {
    const maintaining = PURSUIT_STATUS_PROMPT_LINES.find((line) =>
      line.startsWith("- MAINTAINING —"),
    );
    expect(maintaining).toBeDefined();
    expect(maintaining).toContain("MUST NOT treat absent milestone movement");
    expect(maintaining).toContain("MUST NOT apply deadline or pace judgment");
    expect(maintaining).toContain("MUST NOT nudge to finish or complete it");
    expect(maintaining).toContain("observe steadiness, not progress");
  });
});
