import { describe, expect, it } from "vitest";
import {
  appendConfirmedContext,
  planUpdateApplication,
  replaceConfirmedContext,
  type UpdateApplicationPlanInput,
} from "./apply-update-context";

const USER = "user-1";

const BASE: UpdateApplicationPlanInput = {
  accepted: true,
  placeId: null,
  supersedesUpdateId: null,
  state: "NOW",
  targetPlace: null,
  targetUpdate: null,
  userId: USER,
};

const place = (id = "place-1", userId = USER) => ({ id, userId });
const update = (over: Partial<NonNullable<UpdateApplicationPlanInput["targetUpdate"]>> = {}) => ({
  id: "update-1",
  userId: USER,
  placeId: "place-1",
  supersededAt: null,
  ...over,
});

describe("appendConfirmedContext", () => {
  it("uses the addition when there is no existing context", () => {
    expect(appendConfirmedContext(null, "Returning to London on 16 August 2026.")).toBe(
      "Returning to London on 16 August 2026.",
    );
    expect(appendConfirmedContext("   ", "  Back in London.  ")).toBe("Back in London.");
  });

  it("appends as a new paragraph", () => {
    expect(appendConfirmedContext("Career context.", "Back in London.")).toBe(
      "Career context.\n\nBack in London.",
    );
  });

  it("does not duplicate the same meaning on a retry, ignoring case", () => {
    expect(
      appendConfirmedContext(
        "Career context.\n\nReturning to London on 16 August 2026.",
        "returning to london on 16 august 2026.",
      ),
    ).toBe("Career context.\n\nReturning to London on 16 August 2026.");
  });
});

describe("replaceConfirmedContext", () => {
  it("replaces only the exact prior paragraph and preserves the rest", () => {
    expect(
      replaceConfirmedContext(
        "Five years of property experience.\r\n\r\nSeeking a first mortgage adviser role.\r\n\r\nCeMAP completed.",
        "seeking a FIRST mortgage adviser role.",
        "Accepted a first mortgage adviser role; probation is now the immediate plan.",
      ),
    ).toBe(
      "Five years of property experience.\n\nAccepted a first mortgage adviser role; probation is now the immediate plan.\n\nCeMAP completed.",
    );
  });

  it("returns null when the target paragraph is not present", () => {
    expect(
      replaceConfirmedContext(
        "Five years of property experience.\n\nStill exploring adviser roles.",
        "Seeking a first mortgage adviser role.",
        "Accepted a first mortgage adviser role.",
      ),
    ).toBeNull();
  });

  it("returns null on empty input rather than guessing", () => {
    expect(replaceConfirmedContext(null, "a", "b")).toBeNull();
    expect(replaceConfirmedContext("something", "", "b")).toBeNull();
    expect(replaceConfirmedContext("something", "a", "  ")).toBeNull();
  });
});

describe("planUpdateApplication", () => {
  it("skips a rejected line", () => {
    expect(planUpdateApplication({ ...BASE, accepted: false })).toEqual({ action: "skip" });
  });

  it("refuses a rejected line that also tries to resolve", () => {
    expect(() =>
      planUpdateApplication({ ...BASE, accepted: false, placeId: "place-1" }),
    ).toThrowError(/REJECTED_LINE_CANNOT_RESOLVE/);
    expect(() =>
      planUpdateApplication({ ...BASE, accepted: false, supersedesUpdateId: "update-1" }),
    ).toThrowError(/REJECTED_LINE_CANNOT_RESOLVE/);
  });

  it("creates a Place when the packet line resolves to nothing existing", () => {
    expect(planUpdateApplication(BASE)).toEqual({ action: "create_place_and_update" });
  });

  it("appends to an existing Place", () => {
    expect(planUpdateApplication({ ...BASE, targetPlace: place() })).toEqual({
      action: "append_update",
    });
    expect(
      planUpdateApplication({ ...BASE, placeId: "place-1", targetPlace: place() }),
    ).toEqual({ action: "append_update" });
  });

  it("supersedes only when the user named a live target in the same Place", () => {
    expect(
      planUpdateApplication({
        ...BASE,
        supersedesUpdateId: "update-1",
        targetPlace: place(),
        targetUpdate: update(),
      }),
    ).toEqual({ action: "supersede_update" });
  });

  it.each([
    [{ supersedesUpdateId: "update-1" }, "MISSING_SUPERSEDE_TARGET"],
    [
      { supersedesUpdateId: "update-1", targetPlace: place(), targetUpdate: update({ userId: "user-2" }) },
      "CROSS_OWNER_SUPERSEDE",
    ],
    [
      {
        supersedesUpdateId: "update-1",
        targetPlace: place(),
        targetUpdate: update({ supersededAt: new Date("2026-08-01T00:00:00Z") }),
      },
      "ALREADY_SUPERSEDED",
    ],
    [{ supersedesUpdateId: "update-1", targetUpdate: update() }, "MISSING_PLACE_FOR_SUPERSEDE"],
    [
      {
        supersedesUpdateId: "update-1",
        targetPlace: place("place-2"),
        targetUpdate: update({ placeId: "place-1" }),
      },
      "SUPERSEDE_CROSSES_PLACE",
    ],
    [{ placeId: "place-1" }, "MISSING_PLACE"],
    [{ placeId: "place-1", targetPlace: place("place-1", "user-2") }, "CROSS_OWNER_PLACE"],
  ])("rejects unsafe resolution (%#)", (over, code) => {
    expect(() =>
      planUpdateApplication({ ...BASE, ...(over as Partial<UpdateApplicationPlanInput>) }),
    ).toThrowError(new RegExp(code));
  });
});
