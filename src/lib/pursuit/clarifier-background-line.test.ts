import { describe, expect, it } from "vitest";

import {
  clarifierAppendLine,
  removeClarifierAppendLineFromBackground,
  syncClarifierAnswerInBackground,
} from "@/lib/pursuit/clarifier-background-line";

const contributionPrompt = "What's your current annual contribution to this ISA?";
const contributionOption = "£20,000";

describe("clarifierAppendLine", () => {
  it("matches mobile pursuit-display format", () => {
    expect(clarifierAppendLine(contributionPrompt, contributionOption)).toBe(
      "What's your current annual contribution to this ISA? → £20,000",
    );
  });
});

describe("syncClarifierAnswerInBackground", () => {
  it("appends first tap line to empty background", () => {
    expect(
      syncClarifierAnswerInBackground(null, {
        prompt: contributionPrompt,
        selectedOption: contributionOption,
      }),
    ).toBe(clarifierAppendLine(contributionPrompt, contributionOption));
  });

  it("preserves freeform lines when appending", () => {
    const freeform = "Maxing ISA each tax year.";
    expect(
      syncClarifierAnswerInBackground(freeform, {
        prompt: contributionPrompt,
        selectedOption: contributionOption,
      }),
    ).toBe(`${freeform}\n${clarifierAppendLine(contributionPrompt, contributionOption)}`);
  });

  it("re-answer replaces old line without duplicates", () => {
    const oldLine = clarifierAppendLine(contributionPrompt, "Under £10k");
    const newLine = clarifierAppendLine(contributionPrompt, contributionOption);
    const background = `Manual note\n${oldLine}`;

    expect(
      syncClarifierAnswerInBackground(
        background,
        { prompt: contributionPrompt, selectedOption: contributionOption },
        { prompt: contributionPrompt, selectedOption: "Under £10k" },
      ),
    ).toBe(`Manual note\n${newLine}`);
  });

  it("re-answer same option does not duplicate", () => {
    const line = clarifierAppendLine(contributionPrompt, contributionOption);
    expect(
      syncClarifierAnswerInBackground(
        line,
        { prompt: contributionPrompt, selectedOption: contributionOption },
        { prompt: contributionPrompt, selectedOption: contributionOption },
      ),
    ).toBe(line);
  });
});

describe("removeClarifierAppendLineFromBackground", () => {
  it("removes matching line and keeps freeform", () => {
    const line = clarifierAppendLine(contributionPrompt, contributionOption);
    expect(removeClarifierAppendLineFromBackground(`Keep me\n${line}`, contributionPrompt, contributionOption)).toBe(
      "Keep me",
    );
  });

  it("returns null when last line removed", () => {
    const line = clarifierAppendLine(contributionPrompt, contributionOption);
    expect(removeClarifierAppendLineFromBackground(line, contributionPrompt, contributionOption)).toBeNull();
  });
});
