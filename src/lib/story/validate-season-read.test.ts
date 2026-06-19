import { describe, expect, it, vi } from "vitest";
import { validateSeasonReadAgainstPursuits } from "./validate-season-read";

describe("validateSeasonReadAgainstPursuits", () => {
  it("warns when completion language appears near an ACTIVE pursuit title", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateSeasonReadAgainstPursuits(
      "CeMAP qualification is completed and opens the next career step.",
      [{ title: "CeMAP qualification", status: "ACTIVE" }],
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("CeMAP qualification"),
    );
    warn.mockRestore();
  });

  it("does not warn for COMPLETE pursuits", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateSeasonReadAgainstPursuits(
      "CeMAP qualification is completed.",
      [{ title: "CeMAP qualification", status: "COMPLETE" }],
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
