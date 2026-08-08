import { describe, expect, it } from "vitest";
import {
  parseNewChapterDraft,
  withNewChapterDraft,
  withoutNewChapterDraft,
} from "./new-chapter-draft";

describe("new chapter draft payload", () => {
  it("preserves processing metadata while adding a typed draft", () => {
    const payload = withNewChapterDraft(
      { reviewBucket: "primary", candidateIds: ["candidate-1"] },
      { title: "  Return to London  ", primaryThemeId: "people" },
    );
    expect(payload).toEqual({
      reviewBucket: "primary",
      candidateIds: ["candidate-1"],
      newChapterDraft: { title: "Return to London", primaryThemeId: "people" },
    });
    expect(parseNewChapterDraft(payload)).toEqual({
      title: "Return to London",
      primaryThemeId: "people",
    });
  });

  it("rejects invalid themes or titles without discarding the rest of the payload", () => {
    const payload = {
      reviewBucket: "primary",
      newChapterDraft: { title: "", primaryThemeId: "everything" },
    };
    expect(parseNewChapterDraft(payload)).toBeNull();
    expect(withoutNewChapterDraft(payload)).toEqual({ reviewBucket: "primary" });
  });
});
